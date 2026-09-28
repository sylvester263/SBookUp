-- Singleton store_settings table
CREATE TABLE IF NOT EXISTS public.store_settings (
  id boolean PRIMARY KEY DEFAULT true,
  store_name text NOT NULL DEFAULT 'Jahangir''s Sons',
  contact_email text,
  contact_phone text,
  address text,
  currency text NOT NULL DEFAULT 'PKR',
  tax_rate numeric NOT NULL DEFAULT 0,
  meta_title text,
  meta_description text,
  sender_name text,
  sender_email text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_settings_public_read"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "store_settings_staff_write"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Seed the single row
INSERT INTO public.store_settings (id, store_name, contact_email, contact_phone, address, currency, tax_rate, meta_title, meta_description, sender_name, sender_email)
VALUES (true, 'Jahangir''s Sons', 'info@jahangirssons.com', '+92 300 0000000', 'Lahore, Pakistan', 'PKR', 0,
  'Jahangir''s Sons — A Complete Family Store, Lahore Since 1968',
  'Shop books, stationery, uniforms, toys, baby items and party supplies. Free delivery in Lahore on orders above PKR 2,000.',
  'Jahangir''s Sons', 'orders@jahangirssons.com')
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER store_settings_set_updated_at
BEFORE UPDATE ON public.store_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();