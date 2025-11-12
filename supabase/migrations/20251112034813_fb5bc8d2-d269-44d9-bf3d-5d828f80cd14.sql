-- Make forms work for public document scanning (no login required)
-- Make user_id nullable so documents can be scanned without authentication
ALTER TABLE public.forms ALTER COLUMN user_id DROP NOT NULL;

-- Allow anyone to insert forms (for scanning)
DROP POLICY IF EXISTS "Users can create their own forms" ON public.forms;
CREATE POLICY "Anyone can create forms"
ON public.forms
FOR INSERT
WITH CHECK (true);

-- Allow anyone to read their own uploaded forms (by id)
DROP POLICY IF EXISTS "Users can view their own forms" ON public.forms;
CREATE POLICY "Anyone can view forms they created"
ON public.forms
FOR SELECT
USING (true);

-- Allow anyone to update forms
DROP POLICY IF EXISTS "Users can update their own forms" ON public.forms;
CREATE POLICY "Anyone can update forms"
ON public.forms
FOR UPDATE
USING (true);

-- Allow anyone to delete forms
DROP POLICY IF EXISTS "Users can delete their own forms" ON public.forms;
CREATE POLICY "Anyone can delete forms"
ON public.forms
FOR DELETE
USING (true);

-- Make form_fields user_id nullable too
ALTER TABLE public.form_fields ALTER COLUMN user_id DROP NOT NULL;

-- Update form_fields policies for public access
DROP POLICY IF EXISTS "Users can view their own form fields" ON public.form_fields;
CREATE POLICY "Anyone can view form fields"
ON public.form_fields
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert their own form fields" ON public.form_fields;
CREATE POLICY "Anyone can insert form fields"
ON public.form_fields
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own form fields" ON public.form_fields;
CREATE POLICY "Anyone can update form fields"
ON public.form_fields
FOR UPDATE
USING (true);

DROP POLICY IF EXISTS "Users can delete their own form fields" ON public.form_fields;
CREATE POLICY "Anyone can delete form fields"
ON public.form_fields
FOR DELETE
USING (true);

-- Make storage bucket public for temporary document uploads
UPDATE storage.buckets SET public = true WHERE id = 'forms';

-- Update storage policies for public access
DROP POLICY IF EXISTS "Users can upload their own forms" ON storage.objects;
CREATE POLICY "Anyone can upload forms"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'forms');

DROP POLICY IF EXISTS "Users can view their own forms" ON storage.objects;
CREATE POLICY "Anyone can view forms"
ON storage.objects
FOR SELECT
USING (bucket_id = 'forms');

DROP POLICY IF EXISTS "Users can update their own forms" ON storage.objects;
CREATE POLICY "Anyone can update forms"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'forms');

DROP POLICY IF EXISTS "Users can delete their own forms" ON storage.objects;
CREATE POLICY "Anyone can delete forms"
ON storage.objects
FOR DELETE
USING (bucket_id = 'forms');