/**
 * useRosterImport — לב הלוגיקה של אשף הייבוא, משותף למסך /students/import
 * ולאשף הקליטה. מקבל Sheet מנותח + מיפוי + שיעורים מוכרים + בחורים קיימים,
 * ומחזיר שורות מעובדות (עם ולידציה וכפילויות), סיכום, ומחוללי-שינוי.
 * חף מ-DB ומ-UI — ההתמדה נעשית אצל הצרכן.
 */
import { useCallback, useMemo, useState } from "react";
import {
  findDuplicates,
  normalizeRows,
  type ColumnMapping,
  type DuplicateMatch,
  type ExistingStudent,
  type NormalizedRow,
  type ParsedSheet,
  type TargetField,
} from "@/services/studentListParser";
import type {
  DupChoice,
  ImportPlan,
  ImportSummary,
  KnownClass,
  PreparedStudent,
  RowView,
} from "./types";

interface UseRosterImportParams {
  sheet: ParsedSheet | null;
  mapping: ColumnMapping;
  knownClasses: KnownClass[];
  existingStudents: ExistingStudent[];
  /** כאשר הייבוא הוא "עבור שיעור מסוים" — כל הבחורים משויכים לשיעור זה. */
  forcedClassName?: string | null;
}

function classKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function defaultChoice(dup: DuplicateMatch): DupChoice {
  // כפילות ודאית (מדויקת / בתוך הקובץ) — ברירת מחדל לדלג, כדי לא ליצור כפילות
  // ללא אישור מפורש. כפילות "אפשרית" (אותו שם, אב/שיעור שונה) — ברירת מחדל
  // לייבא, כדי לא לאבד בחור לגיטימי בטעות; מסומן לבדיקה.
  return dup.type === "near" ? "import" : "skip";
}

export interface UseRosterImportResult {
  rows: RowView[];
  summary: ImportSummary;
  /** שמות שיעורים שהופיעו בקובץ אך אינם ברשימת השיעורים המוכרים. */
  unknownClassNames: string[];
  setCell: (index: number, field: TargetField, value: string) => void;
  setChoice: (index: number, choice: DupChoice) => void;
  buildPlan: () => ImportPlan;
  /** ממפה שם שיעור למזהה DB (אם קיים ומוכר). */
  classNameToId: (name: string | null) => string | undefined;
}

export function useRosterImport({
  sheet,
  mapping,
  knownClasses,
  existingStudents,
  forcedClassName = null,
}: UseRosterImportParams): UseRosterImportResult {
  // עריכות תאים ידניות: index -> חלקי-שורה. נשמר בין רינדורים.
  const [edits, setEdits] = useState<Record<number, Partial<NormalizedRow>>>({});
  const [choices, setChoices] = useState<Record<number, DupChoice>>({});

  // מיפוי שם-שיעור (מנורמל) -> id, מרשימת השיעורים המוכרים.
  const classIndex = useMemo(() => {
    const m = new Map<string, KnownClass>();
    for (const c of knownClasses) {
      const k = classKey(c.name);
      if (k && !m.has(k)) m.set(k, c);
    }
    return m;
  }, [knownClasses]);

  // שורות בסיס: נרמול לפי המיפוי, כפיית שיעור (אם נבחר שיעור ספציפי), ואיחוד עריכות.
  const baseRows: NormalizedRow[] = useMemo(() => {
    if (!sheet) return [];
    const normalized = normalizeRows(sheet.rows, mapping);
    return normalized.map((row, i) => {
      const withForced: NormalizedRow = forcedClassName
        ? { ...row, class_name: forcedClassName }
        : row;
      const edit = edits[i];
      return edit ? { ...withForced, ...edit } : withForced;
    });
  }, [sheet, mapping, forcedClassName, edits]);

  const duplicates: (DuplicateMatch | null)[] = useMemo(() => {
    const matches = findDuplicates(baseRows, existingStudents);
    const byIndex: (DuplicateMatch | null)[] = baseRows.map(() => null);
    for (const m of matches) byIndex[m.index] = m;
    return byIndex;
  }, [baseRows, existingStudents]);

  const rows: RowView[] = useMemo(() => {
    return baseRows.map((values, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!values.full_name.trim()) errors.push("חסר שם מלא");

      const cls = values.class_name.trim();
      const classKnown = cls === "" || classIndex.has(classKey(cls));
      if (cls !== "" && !classKnown) {
        warnings.push(`השיעור "${cls}" אינו קיים במערכת`);
      }

      const dup = duplicates[index];
      const choice = dup ? (choices[index] ?? defaultChoice(dup)) : "import";

      return { index, values, errors, warnings, duplicate: dup, choice, classKnown };
    });
  }, [baseRows, duplicates, choices, classIndex]);

  const unknownClassNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const cls = r.values.class_name.trim();
      if (cls && !r.classKnown) {
        const k = classKey(cls);
        if (!seen.has(k)) seen.set(k, cls);
      }
    }
    return [...seen.values()];
  }, [rows]);

  const summary: ImportSummary = useMemo(() => {
    let willImport = 0;
    let updates = 0;
    let duplicatesCount = 0;
    let errorsCount = 0;
    let skipped = 0;

    for (const r of rows) {
      if (r.errors.length) {
        errorsCount++;
        continue;
      }
      if (r.duplicate) {
        duplicatesCount++;
        if (r.choice === "skip") skipped++;
        else if (r.choice === "update" && r.duplicate.matchedExistingId) updates++;
        else willImport++;
      } else {
        willImport++;
      }
    }

    return {
      willImport,
      updates,
      duplicates: duplicatesCount,
      errors: errorsCount,
      skipped,
      total: rows.length,
    };
  }, [rows]);

  const setCell = useCallback((index: number, field: TargetField, value: string) => {
    setEdits((prev) => ({ ...prev, [index]: { ...prev[index], [field]: value } }));
  }, []);

  const setChoice = useCallback((index: number, choice: DupChoice) => {
    setChoices((prev) => ({ ...prev, [index]: choice }));
  }, []);

  const classNameToId = useCallback(
    (name: string | null): string | undefined => {
      if (!name) return undefined;
      return classIndex.get(classKey(name))?.id;
    },
    [classIndex],
  );

  const buildPlan = useCallback((): ImportPlan => {
    const toInsert: PreparedStudent[] = [];
    const toUpdate: { id: string; data: PreparedStudent }[] = [];
    let skipped = 0;
    let errors = 0;

    const prepare = (v: NormalizedRow): PreparedStudent => ({
      full_name: v.full_name.trim(),
      father_name: v.father_name.trim() || null,
      class_name: v.class_name.trim() || null,
      phone: v.phone.trim() || null,
      parent_phone: v.parent_phone.trim() || null,
      notes: v.notes.trim() || null,
    });

    for (const r of rows) {
      if (r.errors.length) {
        errors++;
        continue;
      }
      const data = prepare(r.values);
      if (r.duplicate) {
        if (r.choice === "skip") {
          skipped++;
        } else if (r.choice === "update" && r.duplicate.matchedExistingId) {
          toUpdate.push({ id: r.duplicate.matchedExistingId, data });
        } else {
          toInsert.push(data);
        }
      } else {
        toInsert.push(data);
      }
    }

    return { toInsert, toUpdate, skipped, errors };
  }, [rows]);

  return {
    rows,
    summary,
    unknownClassNames,
    setCell,
    setChoice,
    buildPlan,
    classNameToId,
  };
}
