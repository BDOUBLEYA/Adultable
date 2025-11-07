-- Fix the status column to allow all necessary statuses
ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_status_check;

ALTER TABLE forms ADD CONSTRAINT forms_status_check 
CHECK (status IN ('uploaded', 'processing', 'scanned', 'completed', 'error'));