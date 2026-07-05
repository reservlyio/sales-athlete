-- Training tab: one editable video link + one persistent script,
-- stored on the same singleton settings row as daily_goal/work_days.
ALTER TABLE public.app_settings ADD COLUMN training_video_url TEXT;
ALTER TABLE public.app_settings ADD COLUMN training_script TEXT;
