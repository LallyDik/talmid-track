import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createYeshivaInput = z.object({
  name: z.string().trim().min(1, "Yeshiva name required").max(200),
  address: z.string().trim().max(500).optional().nullable(),
});

export const createYeshiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createYeshivaInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("yeshiva_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (profile?.yeshiva_id) throw new Error("User already belongs to a yeshiva");

    const { data: y, error: yErr } = await supabaseAdmin
      .from("yeshivas")
      .insert({ name: data.name, address: data.address ?? null })
      .select("id")
      .single();
    if (yErr) throw new Error(yErr.message);

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({ yeshiva_id: y.id })
      .eq("id", userId);
    if (uErr) throw new Error(uErr.message);

    return { id: y.id as string };
  });