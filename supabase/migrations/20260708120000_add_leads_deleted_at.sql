-- Soft-delete leads instead of removing them, so they can be viewed/restored from an archive.
ALTER TABLE public.leads ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX leads_deleted_at_idx ON public.leads(deleted_at);
