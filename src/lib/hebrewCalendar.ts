/*
 * עזרי לוח עברי מבוססי Intl בלבד (ICU) — ללא ספרייה חיצונית (חשוב: התקנות npm
 * חסומות ב-NetFree). משמשים את HebrewDatePicker לבניית גריד של חודש עברי אמיתי
 * ולניווט חודש-אחר-חודש בלוח העברי. כל החישובים נעשים בצהריים המקומיים כדי
 * להימנע מהיסטי-שעון (DST) בהזזת ימים.
 */

/** פורמטר Intl שמחזיר את מספר-היום בחודש העברי בספרות רגילות (לפרסור). */
const HEBREW_DAY_FMT = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric" });

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
