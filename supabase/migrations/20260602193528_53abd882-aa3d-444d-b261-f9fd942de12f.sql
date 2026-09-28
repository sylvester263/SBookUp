ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_name text,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT jsonb_build_object(
    'school_reminders', true,
    'newsletter', true,
    'order_updates', true,
    'promotions', false,
    'restock_alerts', false
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END$$;
