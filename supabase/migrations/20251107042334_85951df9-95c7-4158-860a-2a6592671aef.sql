-- Create a table to store user personal information for auto-filling forms
CREATE TABLE public.user_personal_info (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, field_name)
);

-- Enable RLS
ALTER TABLE public.user_personal_info ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own personal info"
ON public.user_personal_info
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personal info"
ON public.user_personal_info
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personal info"
ON public.user_personal_info
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own personal info"
ON public.user_personal_info
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_user_personal_info_updated_at
BEFORE UPDATE ON public.user_personal_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();