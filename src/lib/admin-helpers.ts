// Shared helpers for admin server functions (staff checks, activity log,
// catalog attributes). Plain module: only runs inside server-function handlers.
import {
  mergeApplicable, withNewOptions,
  type AttributeDefinition, type EffectiveAttribute,
} from "@/lib/attributes";

export async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("manager")) {
    throw new Error("Forbidden: staff only");
  }
  return roles as string[];
}

export async function assertAdmin(supabase: any, userId: string) {
  const roles = await assertStaff(supabase, userId);
  if (!roles.includes("admin")) throw new Error("Forbidden: admin only");
  return roles;
}

export async function logActivity(supabase: any, adminId: string, action: string, entity_type: string, entity_id: string | null, new_value: any = null, old_value: any = null) {
  try {
    await supabase.from("activity_logs").insert({ admin_id: adminId, action, entity_type, entity_id, new_value, old_value });
  } catch (e) {
    // non-fatal
  }
}

// ---------- catalog attribute helpers ----------
/** Attributes that apply to the given categories (own + inherited), merged. */
export async function loadApplicableAttributes(db: any, categoryIds: string[]): Promise<EffectiveAttribute[]> {
  if (!categoryIds.length) return [];
  const sets = await Promise.all(
    categoryIds.map(async (id) => {
      const { data, error } = await db.rpc("category_attribute_set", { p_category_id: id });
      if (error) throw new Error(error.message);
      return (data ?? []) as { attribute_id: string; is_required: boolean; is_variant_axis: boolean; sort_order: number; inherited: boolean }[];
    }),
  );
  const ids = Array.from(new Set(sets.flat().map((r) => r.attribute_id)));
  if (!ids.length) return [];
  const { data: defs, error } = await db.from("attribute_definitions").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map<string, AttributeDefinition>((defs ?? []).map((d: any) => [d.id, { ...d, options: d.options ?? [] }]));
  return mergeApplicable(
    sets.map((set) =>
      set.filter((r) => byId.has(r.attribute_id)).map((r) => ({
        ...byId.get(r.attribute_id)!,
        is_required: r.is_required,
        variant_axis: r.is_variant_axis,
        inherited: r.inherited,
        sort_order: r.sort_order,
      })),
    ),
  );
}

/** Adds admin-typed new options (e.g. a new author) to their definitions. */
export async function saveNewOptions(db: any, applicable: EffectiveAttribute[], newOptions: Record<string, string[]>) {
  for (const [key, vals] of Object.entries(newOptions)) {
    const def = applicable.find((a) => a.key === key);
    if (!def || !vals.length) continue;
    const { error } = await db.from("attribute_definitions").update({ options: withNewOptions(def, vals) }).eq("id", def.id);
    if (error) throw new Error(error.message);
  }
}

export function attributeErrorMessage(errors: Record<string, string>) {
  return "Please fix: " + Object.values(errors).join("; ");
}
