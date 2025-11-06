-- Add extracted_fields column to forms table
ALTER TABLE forms ADD COLUMN extracted_fields jsonb DEFAULT '[]'::jsonb;

-- Update status to have more options
ALTER TABLE forms ALTER COLUMN status SET DEFAULT 'uploaded'::text;

COMMENT ON COLUMN forms.extracted_fields IS 'Stores extracted form fields and their values as JSON array';