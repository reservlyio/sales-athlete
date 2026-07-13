ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS training_reference_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS training_script_path TEXT,
  ADD COLUMN IF NOT EXISTS training_script_filename TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-files',
  'training-files',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_all_training_files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'training-files')
  WITH CHECK (bucket_id = 'training-files');
