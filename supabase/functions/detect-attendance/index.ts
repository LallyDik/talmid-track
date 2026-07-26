/**
 * detect-attendance — Supabase Edge Function (Deno)
 * =============================================================================
 * שכבת זיהוי סימוני-נוכחות אמיתית מבוססת Anthropic Claude Vision.
 *
 * מקבלת תמונות של עמודות בודדות מתוך דף רישום-נוכחות ישיבתי (סרוק), ומחזירה
 * לכל עמודה רשימת שורות: שם הבחור (בעברית, כפי שמופיע) + באיזו עמודת-סימון
 * (א/ב/ג) יש סימון בכתב-יד (וי/X), או "none" כשאין סימון.
 *
 * ── התקנה / הפעלה ────────────────────────────────────────────────────────────
 *   1. הגדירו סוד ANTHROPIC_API_KEY ב-Supabase (או ב-Lovable → Secrets):
 *        supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *      בלי הסוד הזה הפונקציה מחזירה 500 עם הודעת שגיאה ברורה.
 *   2. אופציונלי — לבחירת מודל זול/מהיר יותר:
 *        supabase secrets set ATTENDANCE_VISION_MODEL=claude-sonnet-5
 *      ברירת המחדל היא claude-opus-4-8 (מומלץ לדיוק מרבי בכתב-יד עברי).
 *   3. הפריסה מתבצעת אוטומטית: Lovable פורס את supabase/functions/ בכל push.
 *      (ידנית: supabase functions deploy detect-attendance)
 *
 * אימות JWT של הקורא נשאר פעיל (ברירת מחדל של Supabase) — אין להשבית אותו.
 * =============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk";

/** מודל ברירת המחדל — Opus 4.8 (הכי מדויק לכתב-יד עברי לפי הנחיית Anthropic). */
const DEFAULT_MODEL = "claude-opus-4-8";

/** כמה תמונות לעבד במקביל (הגבלת concurrency כדי לא לפגוע ב-rate limits). */
const MAX_CONCURRENCY = 3;

/** סכמת הפלט המובנה (structured output) שהמודל מחויב לעמוד בה. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description:
              'the student full name exactly as printed, Hebrew, kept whole including any ב"ר part',
          },
          mark: {
            type: "string",
            enum: ["a", "b", "c", "none"],
            description:
              "which mark column has a checkmark: a=א, b=ב, c=ג, none=no mark (absent)",
          },
          confidence: {
            type: "number",
            description: "0..1 confidence for this row's mark reading",
          },
        },
        required: ["name", "mark", "confidence"],
      },
    },
  },
  required: ["rows"],
} as const;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InputImage {
  id: string;
  base64: string;
  mediaType: string;
  columns?: string[];
}

interface DetectedRow {
  name: string;
  mark: "a" | "b" | "c" | "none";
  confidence: number;
}

interface ImageResult {
  id: string;
  rows: DetectedRow[];
  error?: string;
}

/** בונה את ה-prompt לעמודה בודדת, מודע לעמודות-הסימון הקיימות בדף. */
function buildPrompt(columns: string[]): string {
  const cols = columns.length ? columns.join(", ") : "א, ב";
  const a = columns[0] ?? "א";
  const b = columns[1] ?? "ב";
  const c = columns[2] ?? "ג";
  return [
    "You are reading ONE physical column of a scanned Hebrew (right-to-left) yeshiva attendance sheet.",
    "Each body row is ONE student and contains TWO SEPARATE parts:",
    '  (1) the printed NAME — Hebrew text only (e.g. "וינברג שלום נח ב"ר אברהם").',
    `  (2) a row of small ATTENDANCE MARK BOXES next to the name, labeled ${cols} in the header. A box may hold a HANDWRITTEN mark, or be empty.`,
    "",
    "Return, for EVERY body row:",
    '  - name: ONLY the printed Hebrew NAME, EXACTLY as printed (keep any ב"ר <father> part).',
    "    ⚠️ CRITICAL: the name must be Hebrew letters and spaces ONLY. Do NOT copy ANYTHING from the",
    "    mark boxes into the name — no checkmark, no וי, no slash (/), no X, no dots, no digits, no",
    "    brackets ] [, no pipes |, no table/grid lines. Such marks belong in `mark`, NEVER in `name`.",
    `  - mark: examine the ${cols} boxes (identify them by the header letters). A box is MARKED if it`,
    "    holds ANY handwritten stroke — a checkmark (וי / ✓), a tick, a slash (/), an X, a diagonal line,",
    "    or any pen scribble. Ignore any mark columns other than these.",
    `      a = the ${a} box, b = the ${b} box, c = the ${c} box, none = all these boxes are clearly empty.`,
    "    Most rows DO have a mark — inspect the boxes carefully before answering none. If several look",
    "    marked, pick the clearest/darkest one.",
    "  - confidence: your 0..1 confidence in the mark reading for that row.",
    "",
    "SKIP these — never return them as rows:",
    "  - the header row itself (השם / א / ב / ג ...),",
    '  - any boilerplate text: בס"ד, רישום נוכחות, פרשת ..., תשפ"...',
    "",
    "Only return rows whose NAME you can actually read. Do NOT invent, guess, or complete names you cannot see clearly.",
    "If the image contains no readable student rows, return an empty rows array.",
  ].join("\n");
}

/** מריץ קריאת Vision בודדת ומחזיר את השורות שזוהו לתמונה. */
async function detectOne(
  client: Anthropic,
  model: string,
  img: InputImage,
): Promise<ImageResult> {
  const columns = img.columns && img.columns.length ? img.columns : ["א", "ב"];
  try {
    const resp: any = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType,
                data: img.base64,
              },
            },
            { type: "text", text: buildPrompt(columns) },
          ],
        },
      ],
    } as any);

    // חשיבה אדפטיבית עלולה להוסיף בלוק "thinking" — מסננים לטקסט בלבד.
    const text = (resp.content ?? [])
      .filter((b: any) => b && b.type === "text")
      .map((b: any) => b.text)
      .join("");

    if (!text.trim()) {
      return { id: img.id, rows: [], error: "המודל לא החזיר תוכן קריא." };
    }

    let parsed: { rows?: DetectedRow[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        id: img.id,
        rows: [],
        error: "פענוח תשובת המודל נכשל (JSON לא תקין).",
      };
    }

    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.filter(
          (r) =>
            r &&
            typeof r.name === "string" &&
            r.name.trim().length > 0 &&
            (r.mark === "a" || r.mark === "b" || r.mark === "c" || r.mark === "none"),
        )
      : [];

    return { id: img.id, rows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id: img.id, rows: [], error: `שגיאת מודל: ${msg}` };
  }
}

/** מעבד מערך תמונות עם הגבלת concurrency, שומר על סדר התוצאות. */
async function detectAll(
  client: Anthropic,
  model: string,
  images: InputImage[],
): Promise<ImageResult[]> {
  const results = new Array<ImageResult>(images.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= images.length) return;
      results[i] = await detectOne(client, model, images[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, images.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "יש להשתמש ב-POST." }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "מנוע הזיהוי אינו מוגדר: חסר הסוד ANTHROPIC_API_KEY. יש להגדירו ב-Supabase/Lovable (Secrets) כדי להפעיל זיהוי אוטומטי.",
      },
      500,
    );
  }

  const model = Deno.env.get("ATTENDANCE_VISION_MODEL") ?? DEFAULT_MODEL;

  let payload: { images?: InputImage[]; context?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "גוף הבקשה אינו JSON תקין." }, 400);
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length === 0) {
    return jsonResponse({ error: "לא התקבלו תמונות לעיבוד." }, 400);
  }

  // ולידציה בסיסית של כל תמונה.
  for (const img of images) {
    if (!img || typeof img.id !== "string" || typeof img.base64 !== "string" || typeof img.mediaType !== "string") {
      return jsonResponse(
        { error: "מבנה התמונות שגוי (נדרש id, base64, mediaType לכל תמונה)." },
        400,
      );
    }
  }

  try {
    const client = new Anthropic({ apiKey });
    const results = await detectAll(client, model, images);
    return jsonResponse({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `עיבוד הזיהוי נכשל: ${msg}` }, 500);
  }
});
