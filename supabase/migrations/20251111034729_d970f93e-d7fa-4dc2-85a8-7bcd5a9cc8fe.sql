-- Create form_fields table and extend forms
CREATE TABLE IF NOT EXISTS public.form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT,
  bbox JSONB, -- { x, y, width, height } in 0-100 percent, origin top-left
  page INT NOT NULL DEFAULT 1,
  value TEXT,
  confidence NUMERIC,
  source TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;

-- RLS policies mirroring other user-scoped tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_fields' AND policyname = 'Users can view their own form fields'
  ) THEN
    CREATE POLICY "Users can view their own form fields"
    ON public.form_fields FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_fields' AND policyname = 'Users can insert their own form fields'
  ) THEN
    CREATE POLICY "Users can insert their own form fields"
    ON public.form_fields FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_fields' AND policyname = 'Users can update their own form fields'
  ) THEN
    CREATE POLICY "Users can update their own form fields"
    ON public.form_fields FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_fields' AND policyname = 'Users can delete their own form fields'
  ) THEN
    CREATE POLICY "Users can delete their own form fields"
    ON public.form_fields FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_form_fields_updated_at'
  ) THEN
    CREATE TRIGGER update_form_fields_updated_at
    BEFORE UPDATE ON public.form_fields
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON public.form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_user_id ON public.form_fields(user_id);

-- Extend forms with filled_file_url and layout_hash if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='forms' AND column_name='filled_file_url'
  ) THEN
    ALTER TABLE public.forms ADD COLUMN filled_file_url TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='forms' AND column_name='layout_hash'
  ) THEN
    ALTER TABLE public.forms ADD COLUMN layout_hash TEXT;
  END IF;
END $$;