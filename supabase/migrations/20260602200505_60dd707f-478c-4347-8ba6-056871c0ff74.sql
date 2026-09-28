-- Contact submissions
CREATE TABLE public.contact_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_messages_public_insert
  ON public.contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL AND length(trim(name)) BETWEEN 1 AND 100
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND message IS NOT NULL AND length(trim(message)) BETWEEN 1 AND 4000
  );

CREATE POLICY contact_messages_staff_all
  ON public.contact_messages
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- Newsletter unsubscribe token
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS newsletters_unsubscribe_token_key
  ON public.newsletters(unsubscribe_token);
