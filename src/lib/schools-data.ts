import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type School = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  city: string;
  is_featured: boolean;
  sort_order: number;
};

export type SchoolClass = {
  id: string;
  school_id: string;
  class_name: string;
  class_order: number;
};

export type SchoolBundleItem = {
  id: string;
  product_id: string;
  item_type: "book" | "notebook" | "stationery";
  quantity: number;
  sort_order: number;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    sale_price: number | null;
    images: string[];
    stock_quantity: number;
  } | null;
};

export type SchoolBundle = {
  id: string;
  school_id: string;
  class_id: string;
  bundle_name: string;
  total_price: number;
  is_active: boolean;
  items: SchoolBundleItem[];
};

export const WHATSAPP_NUMBER = "923404548850";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const schoolsQuery = (opts: { featuredOnly?: boolean } = {}) =>
  queryOptions({
    queryKey: ["schools", opts],
    queryFn: async () => {
      let q = supabase.from("schools").select("*").order("sort_order");
      if (opts.featuredOnly) q = q.eq("is_featured", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as School[];
    },
  });

export const schoolBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["schools", "by-slug", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as School | null;
    },
  });

export const schoolClassesQuery = (schoolId: string | undefined | null) =>
  queryOptions({
    queryKey: ["school-classes", schoolId ?? null],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return [] as SchoolClass[];
      const { data, error } = await supabase
        .from("school_classes")
        .select("*")
        .eq("school_id", schoolId)
        .order("class_order");
      if (error) throw error;
      return (data ?? []) as unknown as SchoolClass[];
    },
  });

export const schoolBundleQuery = (
  schoolId: string | undefined | null,
  classId: string | undefined | null,
) =>
  queryOptions({
    queryKey: ["school-bundle", schoolId ?? null, classId ?? null],
    enabled: !!schoolId && !!classId,
    queryFn: async () => {
      if (!schoolId || !classId) return null;
      const { data, error } = await supabase
        .from("school_bundles")
        .select(
          "*, items:school_bundle_items(id,product_id,item_type,quantity,sort_order,product:products(id,name,slug,price,sale_price,images,stock_quantity))",
        )
        .eq("school_id", schoolId)
        .eq("class_id", classId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const b = data as any;
      b.items = ((b.items ?? []) as SchoolBundleItem[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      return b as SchoolBundle;
    },
  });
