-- Create storage bucket for form uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('forms', 'forms', false);

-- Allow authenticated users to upload their own files
CREATE POLICY "Users can upload their own forms"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'forms' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can view their own forms"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'forms' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own files
CREATE POLICY "Users can update their own forms"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'forms' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own forms"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'forms' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);