-- Objection/Not Interested call result now captures whether the objection
-- came from the gatekeeper or the decision maker.
ALTER TABLE public.call_logs ADD COLUMN objection_source TEXT;
