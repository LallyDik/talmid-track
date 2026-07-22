import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { safeStorageKey } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatHebrewDate } from "@/lib/hebrew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  type Column,
} from "@/components/kit";
import { formatBytes, staffName, useStaff } from "./shared";

type StudentDocument = Tables<"student_documents">;

const BUCKET = "student-documents";

export function DocumentsTab({
  studentId,
  yeshivaId,
  userId,
}: {
  studentId: string;
  yeshivaId?: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const { data: staff } = useStaff(yeshivaId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["student-documents", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_documents")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentDocument[];
    },
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!yeshivaId) throw new Error("missing yeshiva");
      if (!file) throw new Error("no file");
      const path = safeStorageKey(`${yeshivaId}/${studentId}`, file.name);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("student_documents").insert({
        yeshiva_id: yeshivaId,
        student_id: studentId,
        file_path: path,
        original_file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        title: title.trim() || file.name,
        uploaded_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הקובץ הועלה בהצלחה");
      setTitle("");
      setFile(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
    },
    onError: () => toast.error("העלאת הקובץ נכשלה. נסה שוב."),
  });

  const deleteDoc = useMutation({
    mutationFn: async (doc: StudentDocument) => {
      const { error: rmErr } = await supabase.storage
        .from(BUCKET)
        .remove([doc.file_path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase
        .from("student_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הקובץ נמחק");
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
    },
    onError: () => toast.error("מחיקת הקובץ נכשלה. נסה שוב."),
  });

  async function download(doc: StudentDocument) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("יצירת קישור להורדה נכשלה.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const columns: Column<StudentDocument>[] = [
    {
      key: "title",
      header: "כותרת",
      cell: (d) => (
        <span className="inline-flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {d.title || d.original_file_name || "מסמך"}
        </span>
      ),
    },
    {
      key: "file",
      header: "שם הקובץ",
      cell: (d) => (
        <span dir="ltr" className="text-xs text-muted-foreground">
          {d.original_file_name ?? "—"}
        </span>
      ),
    },
    { key: "size", header: "גודל", cell: (d) => formatBytes(d.size_bytes) },
    {
      key: "uploader",
      header: "הועלה על ידי",
      cell: (d) => staffName(staff, d.uploaded_by),
    },
    {
      key: "date",
      header: "תאריך",
      cell: (d) => formatHebrewDate(d.created_at),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => download(d)}
            aria-label="הורד"
          >
            <Download className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="מחק">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            }
            title="מחיקת מסמך"
            description={`למחוק את "${d.title || d.original_file_name}"? לא ניתן לשחזר פעולה זו.`}
            confirmText="מחק"
            destructive
            onConfirm={() => deleteDoc.mutateAsync(d)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4" />
              העלה מסמך
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="rounded-2xl">
            <DialogHeader className="text-right">
              <DialogTitle>העלאת מסמך</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>כותרת</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="כותרת המסמך (אם ריק — שם הקובץ)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>קובץ</Label>
                <Input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex justify-start gap-2 pt-2">
                <Button
                  disabled={!file || uploadDoc.isPending}
                  onClick={() => uploadDoc.mutate()}
                >
                  {uploadDoc.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  העלה
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        columns={columns}
        data={docs ?? []}
        rowKey={(d) => d.id}
        loading={isLoading}
        pageSize={10}
        empty={
          <EmptyState
            icon={FileText}
            title="אין מסמכים"
            description="העלה טפסים, אישורים ומסמכים רלוונטיים לבחור."
            action={
              <Button onClick={() => setOpen(true)}>
                <Upload className="h-4 w-4" />
                העלה מסמך ראשון
              </Button>
            }
          />
        }
      />
    </div>
  );
}
