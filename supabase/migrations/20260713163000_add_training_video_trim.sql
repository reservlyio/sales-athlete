ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS training_video_start_sec INT,
  ADD COLUMN IF NOT EXISTS training_video_end_sec INT;
