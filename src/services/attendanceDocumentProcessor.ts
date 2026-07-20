/**
 * Attendance Document Processor
 * שכבת שירות מנותקת לזיהוי סימוני נוכחות ממסמכים סרוקים.
 * המימוש הנוכחי הוא MOCK - מחזיר סטטוסים אקראיים לכל בחור עם רמת ודאות.
 * ניתן להחליף אותו בעתיד בחיבור ל-OCR / מודל AI בלי לשנות את שאר המערכת.
 */

import type { AttendanceStatus } from "@/lib/hebrew";

export interface StudentInput {
  id: string;
  full_name: string;
}

export interface DetectionResult {
  student_id: string;
  attendance_status: AttendanceStatus;
  detection_confidence: number; // 0..1
}

export interface ProcessorInput {
  fileUrl: string;
  students: StudentInput[];
}

export interface ProcessorOutput {
  results: DetectionResult[];
  raw: Record<string, unknown>;
}

export interface AttendanceDocumentProcessor {
  process(input: ProcessorInput): Promise<ProcessorOutput>;
}

// Mock implementation
class MockProcessor implements AttendanceDocumentProcessor {
  async process({ students }: ProcessorInput): Promise<ProcessorOutput> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 800));

    const statuses: AttendanceStatus[] = ["on_time", "on_time", "on_time", "late_b", "late_c", "absent"];
    const results: DetectionResult[] = students.map((s) => {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const confidence = 0.55 + Math.random() * 0.4;
      return {
        student_id: s.id,
        attendance_status: status,
        detection_confidence: Number(confidence.toFixed(2)),
      };
    });

    return {
      results,
      raw: { engine: "mock-v1", processed_at: new Date().toISOString(), count: results.length },
    };
  }
}

export const attendanceDocumentProcessor: AttendanceDocumentProcessor = new MockProcessor();