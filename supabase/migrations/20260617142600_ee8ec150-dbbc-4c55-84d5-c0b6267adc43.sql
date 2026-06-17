
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  daily_goal INT NOT NULL DEFAULT 50,
  work_days INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  website TEXT,
  contact_name TEXT,
  title TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  notes TEXT,
  called BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  last_contact_date DATE,
  last_call_result TEXT,
  deal_stage TEXT NOT NULL DEFAULT 'new_lead',
  next_follow_up DATE,
  follow_up_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_stage_idx ON public.leads(deal_stage);
CREATE INDEX leads_followup_idx ON public.leads(next_follow_up);
CREATE INDEX leads_created_idx ON public.leads(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.leads FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  call_date DATE NOT NULL DEFAULT CURRENT_DATE,
  result TEXT NOT NULL,
  notes TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX call_logs_date_idx ON public.call_logs(call_date DESC);
CREATE INDEX call_logs_lead_idx ON public.call_logs(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO anon, authenticated;
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.call_logs FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
