
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  city text NOT NULL DEFAULT 'Lahore',
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schools TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view schools" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Admins manage schools" ON public.schools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  class_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, class_name)
);
GRANT SELECT ON public.school_classes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.school_classes TO authenticated;
GRANT ALL ON public.school_classes TO service_role;
ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view classes" ON public.school_classes FOR SELECT USING (true);
CREATE POLICY "Admins manage classes" ON public.school_classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.school_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.school_classes(id) ON DELETE CASCADE,
  bundle_name text NOT NULL,
  total_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, class_id)
);
GRANT SELECT ON public.school_bundles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.school_bundles TO authenticated;
GRANT ALL ON public.school_bundles TO service_role;
ALTER TABLE public.school_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view bundles" ON public.school_bundles FOR SELECT USING (true);
CREATE POLICY "Admins manage bundles" ON public.school_bundles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.school_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.school_bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('book','notebook','stationery')),
  quantity integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.school_bundle_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.school_bundle_items TO authenticated;
GRANT ALL ON public.school_bundle_items TO service_role;
ALTER TABLE public.school_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view bundle items" ON public.school_bundle_items FOR SELECT USING (true);
CREATE POLICY "Admins manage bundle items" ON public.school_bundle_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_school_bundles_updated BEFORE UPDATE ON public.school_bundles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_school_classes_school ON public.school_classes(school_id, class_order);
CREATE INDEX idx_school_bundles_lookup ON public.school_bundles(school_id, class_id);
CREATE INDEX idx_school_bundle_items_bundle ON public.school_bundle_items(bundle_id, sort_order);

INSERT INTO public.schools (name, slug, city, is_featured, sort_order) VALUES
  ('Beaconhouse School System', 'beaconhouse-school-system', 'Lahore', true, 1),
  ('The City School', 'the-city-school', 'Lahore', true, 2),
  ('Lahore Grammar School', 'lahore-grammar-school', 'Lahore', true, 3),
  ('Allied School', 'allied-school', 'Lahore', true, 4),
  ('Punjab Group of Colleges', 'punjab-group-of-colleges', 'Lahore', true, 5);

DO $$
DECLARE
  s record;
  classes text[] := ARRAY['Nursery','KG','Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'];
  i int;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    FOR i IN 1..array_length(classes,1) LOOP
      INSERT INTO public.school_classes (school_id, class_name, class_order)
      VALUES (s.id, classes[i], i);
    END LOOP;
  END LOOP;
END $$;
