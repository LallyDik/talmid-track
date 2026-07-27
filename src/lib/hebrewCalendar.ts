/*
 * עזרי לוח עברי מבוססי Intl בלבד (ICU) — ללא ספרייה חיצונית (חשוב: התקנות npm
 * חסומות ב-NetFree). משמשים את HebrewDatePicker לבניית גריד של חודש עברי אמיתי
 * ולניווט חודש-אחר-חודש בלוח העברי. כל החישובים נעשים בצהריים המקומיים כדי
 * להימנע מהיסטי-שעון (DST) בהזזת ימים.
 */

/** פורמטר Intl שמחזיר את מספר-היום בחודש העברי בספרות רגילות (לפרסור). */
const HEBREW_DAY_FMT = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric" });

/** שם החודש העברי (תשרי, אב, אדר/אדר א׳/אדר ב׳ ...) מ-Intl. */
const HEBREW_MONTH_FMT = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { month: "long" });

export function hebrewMonthName(date: Date): string {
  const p = HEBREW_MONTH_FMT.formatToParts(date).find((x) => x.type === "month");
  return p ? p.value : "";
}

/**
 * מחזיר את שם החג/המועד/הצום שחל בתאריך (או null). הזיהוי לפי היום+החודש
 * העברי (חגים חלים בתאריך עברי קבוע). מכסה את המועדים המרכזיים; תאריכי-צום
 * מסומנים בתאריכם הנומינלי (ללא הזזת "נדחה"). פורים בשנה מעוברת חל באדר ב׳.
 */
export function hebrewHoliday(date: Date): string | null {
  const day = hebrewDayOfMonth(date);
  const month = hebrewMonthName(date);
  switch (month) {
    case "תשרי":
      if (day === 1 || day === 2) return "ראש השנה";
      if (day === 3) return "צום גדליה";
      if (day === 10) return "יום כיפור";
      if (day >= 15 && day <= 21) return "סוכות";
      if (day === 22) return "שמיני עצרת";
      break;
    case "כסלו":
      if (day >= 25) return "חנוכה";
      break;
    case "טבת":
      if (day <= 3) return "חנוכה";
      if (day === 10) return "עשרה בטבת";
      break;
    case "שבט":
      if (day === 15) return "ט״ו בשבט";
      break;
    case "ניסן":
      if (day >= 15 && day <= 21) return "פסח";
      break;
    case "אייר":
      if (day === 5) return "יום העצמאות";
      if (day === 18) return "ל״ג בעומר";
      break;
    case "סיוון":
      if (day === 6 || day === 7) return "שבועות";
      break;
    case "תמוז":
      if (day === 17) return "י״ז בתמוז";
      break;
    case "אב":
      if (day === 9) return "תשעה באב";
      if (day === 15) return "ט״ו באב";
      break;
  }
  // אדר (שנה רגילה) או אדר ב׳ (שנה מעוברת) — פורים.
  if (month === "אדר" || month === "אדר ב׳") {
    if (day === 13) return "תענית אסתר";
    if (day === 14) return "פורים";
    if (day === 15) return "שושן פורים";
  }
  return null;
}

function atNoon(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** מספר-היום בחודש העברי (1..30) עבור תאריך לועזי נתון. */
export function hebrewDayOfMonth(date: Date): number {
  const part = HEBREW_DAY_FMT.formatToParts(date).find((p) => p.type === "day");
  const n = part ? parseInt(part.value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** התאריך הלועזי (בצהריים) של א׳ בחודש העברי המכיל את date. */
export function hebrewMonthStart(date: Date): Date {
  const d = atNoon(date);
  d.setDate(d.getDate() - (hebrewDayOfMonth(d) - 1));
  return d;
}

/** אורך החודש העברי (29 או 30) המכיל את date. */
export function hebrewMonthLength(date: Date): number {
  const cur = hebrewMonthStart(date);
  let len = 1;
  for (let guard = 0; guard < 40; guard++) {
    cur.setDate(cur.getDate() + 1);
    if (hebrewDayOfMonth(cur) === 1) break;
    len++;
  }
  return len;
}

/** ניווט ±n חודשים עבריים; מחזיר את א׳ של חודש-היעד (בצהריים). */
export function addHebrewMonths(date: Date, n: number): Date {
  let first = hebrewMonthStart(date);
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const len = hebrewMonthLength(first);
      first = atNoon(first);
      first.setDate(first.getDate() + len);
    }
  } else if (n < 0) {
    for (let i = 0; i < -n; i++) {
      const prevLast = atNoon(first);
      prevLast.setDate(prevLast.getDate() - 1);
      first = hebrewMonthStart(prevLast);
    }
  }
  return first;
}

/** רשימת הימים (תאריכים לועזיים) של החודש העברי המכיל את date, מא׳ ועד סופו. */
export function hebrewMonthDays(date: Date): Date[] {
  const start = hebrewMonthStart(date);
  const len = hebrewMonthLength(start);
  const days: Date[] = [];
  for (let i = 0; i < len; i++) {
    const d = atNoon(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}
