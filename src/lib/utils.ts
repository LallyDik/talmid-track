import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Build a Supabase-Storage-safe object key. Storage rejects non-ASCII
 * filenames (e.g. Hebrew) and characters like spaces/parentheses with an
 * "Invalid key" error, so we key by a random UUID plus a sanitized extension.
 * `folder` MUST start with the yeshiva_id (the storage RLS policies match the
 * first path segment). The human-readable name is stored separately in the DB.
 */
export function safeStorageKey(folder: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext =
    dot > 0
      ? fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 8)
      : "";
  const id = crypto.randomUUID();
  return `${folder}/${ext ? `${id}.${ext}` : id}`;
}
