export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          attendance_report_id: string | null
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          created_at: string
          detected_automatically: boolean
          detection_confidence: number | null
          id: string
          manually_verified: boolean
          notes: string | null
          report_date: string
          student_id: string
          study_session_id: string
          updated_at: string
          verified_by: string | null
          yeshiva_id: string
        }
        Insert: {
          attendance_report_id?: string | null
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          detected_automatically?: boolean
          detection_confidence?: number | null
          id?: string
          manually_verified?: boolean
          notes?: string | null
          report_date: string
          student_id: string
          study_session_id: string
          updated_at?: string
          verified_by?: string | null
          yeshiva_id: string
        }
        Update: {
          attendance_report_id?: string | null
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          detected_automatically?: boolean
          detection_confidence?: number | null
          id?: string
          manually_verified?: boolean
          notes?: string | null
          report_date?: string
          student_id?: string
          study_session_id?: string
          updated_at?: string
          verified_by?: string | null
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_attendance_report_id_fkey"
            columns: ["attendance_report_id"]
            isOneToOne: false
            referencedRelation: "attendance_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_study_session_id_fkey"
            columns: ["study_session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_reports: {
        Row: {
          class_id: string | null
          file_url: string | null
          id: string
          notes: string | null
          ocr_raw_result: Json | null
          original_file_name: string | null
          processing_status: Database["public"]["Enums"]["report_processing_status"]
          report_date: string
          study_session_id: string
          uploaded_at: string
          uploaded_by: string | null
          yeshiva_id: string
        }
        Insert: {
          class_id?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          ocr_raw_result?: Json | null
          original_file_name?: string | null
          processing_status?: Database["public"]["Enums"]["report_processing_status"]
          report_date: string
          study_session_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          yeshiva_id: string
        }
        Update: {
          class_id?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          ocr_raw_result?: Json | null
          original_file_name?: string | null
          processing_status?: Database["public"]["Enums"]["report_processing_status"]
          report_date?: string
          study_session_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_reports_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_reports_study_session_id_fkey"
            columns: ["study_session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_reports_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          yeshiva_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          yeshiva_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          yeshiva_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          yeshiva_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          yeshiva_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      student_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          severity: Database["public"]["Enums"]["event_severity"]
          student_id: string
          title: string
          yeshiva_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type: string
          id?: string
          severity?: Database["public"]["Enums"]["event_severity"]
          student_id: string
          title: string
          yeshiva_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          severity?: Database["public"]["Enums"]["event_severity"]
          student_id?: string
          title?: string
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_events_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      student_treatments: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          opened_at: string
          outcome: string | null
          status: Database["public"]["Enums"]["treatment_status"]
          student_id: string
          title: string
          treatment_type: string | null
          yeshiva_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          opened_at?: string
          outcome?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          student_id: string
          title: string
          treatment_type?: string | null
          yeshiva_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          opened_at?: string
          outcome?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          student_id?: string
          title?: string
          treatment_type?: string | null
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_treatments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_treatments_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          active: boolean
          address: string | null
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          father_name: string | null
          full_name: string
          id: string
          notes: string | null
          parent_phone: string | null
          phone: string | null
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
          yeshiva_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          father_name?: string | null
          full_name: string
          id?: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          yeshiva_id: string
        }
        Update: {
          active?: boolean
          address?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          father_name?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          late_time_b: string
          late_time_c: string
          name: string
          order_index: number
          start_time: string
          yeshiva_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          late_time_b: string
          late_time_c: string
          name: string
          order_index?: number
          start_time: string
          yeshiva_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          late_time_b?: string
          late_time_c?: string
          name?: string
          order_index?: number
          start_time?: string
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: number
          status: Database["public"]["Enums"]["task_status"]
          student_id: string | null
          title: string
          treatment_id: string | null
          yeshiva_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          student_id?: string | null
          title: string
          treatment_id?: string | null
          yeshiva_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          student_id?: string | null
          title?: string
          treatment_id?: string | null
          yeshiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "student_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_updates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          treatment_id: string
          update_date: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          treatment_id: string
          update_date?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          treatment_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_updates_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "student_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          yeshiva_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          yeshiva_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          yeshiva_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_yeshiva_id_fkey"
            columns: ["yeshiva_id"]
            isOneToOne: false
            referencedRelation: "yeshivas"
            referencedColumns: ["id"]
          },
        ]
      }
      yeshivas: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_yeshiva: {
        Args: { _address?: string; _name: string }
        Returns: string
      }
      get_my_yeshiva_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "viewer"
      attendance_status:
        | "on_time"
        | "late_b"
        | "late_c"
        | "absent"
        | "excused"
        | "unknown"
      event_severity: "info" | "low" | "medium" | "high" | "urgent"
      report_processing_status:
        | "pending"
        | "processing"
        | "needs_review"
        | "approved"
        | "failed"
      student_status: "active" | "inactive" | "vacation" | "left" | "suspended"
      task_status: "open" | "in_progress" | "completed" | "cancelled"
      treatment_status:
        | "new"
        | "in_progress"
        | "waiting"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "viewer"],
      attendance_status: [
        "on_time",
        "late_b",
        "late_c",
        "absent",
        "excused",
        "unknown",
      ],
      event_severity: ["info", "low", "medium", "high", "urgent"],
      report_processing_status: [
        "pending",
        "processing",
        "needs_review",
        "approved",
        "failed",
      ],
      student_status: ["active", "inactive", "vacation", "left", "suspended"],
      task_status: ["open", "in_progress", "completed", "cancelled"],
      treatment_status: [
        "new",
        "in_progress",
        "waiting",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
