/**
 * טיפוסים משותפים לרכיבי אשף ייבוא הבחורים.
 * הלוגיקה עצמה (ניתוח, מיפוי, נרמול, כפילויות) חיה ב-services/studentListParser.
 */
import type { DuplicateMatch, NormalizedRow } from "@/services/studentListParser";

/** בחירת המשתמש עבור שורה שזוהתה ככפילות. */
export type DupChoice = "skip" | "import" | "update";

/** שיעור מוכר — ‎id אופציונלי כי באשף הקליטה השיעורים עדיין לא נוצרו ב-DB. */
export interface KnownClass {
  id?: string;
  name: string;
}

/** תצוגת שורה מעובדת: ערכים, ולידציה, וכפילות. */
export interface RowView {
  index: number;
  values: NormalizedRow;
  errors: string[];
  warnings: string[];
  duplicate: DuplicateMatch | null;
  choice: DupChoice;
  /** האם השיעור ריק (מותר) או קיים ברשימת השיעורים המוכרים. */
  classKnown: boolean;
}

/** רשומת בחור מוכנה לשמירה — שיעור עדיין כשם (הצרכן ממפה ל-id). */
export interface PreparedStudent {
  full_name: string;
  father_name: string | null;
  class_name: string | null;
  phone: string | null;
  parent_phone: string | null;
  notes: string | null;
}

/** תוכנית ייבוא ניטרלית — כל צרכן (מסך ייבוא / אשף קליטה) מבצע התמדה בעצמו. */
export interface ImportPlan {
  toInsert: PreparedStudent[];
  toUpdate: { id: string; data: PreparedStudent }[];
  skipped: number;
  errors: number;
}

export interface ImportSummary {
  willImport: number;
  updates: number;
  duplicates: number;
  errors: number;
  skipped: number;
  total: number;
}
