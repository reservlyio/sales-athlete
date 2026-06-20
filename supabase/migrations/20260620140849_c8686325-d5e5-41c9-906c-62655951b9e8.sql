-- Replace permissive open_all policies with authenticated-only policies
DROP POLICY IF EXISTS open_all ON public.leads;
DROP POLICY IF EXISTS open_all ON public.call_logs;
DROP POLICY IF EXISTS open_all ON public.app_settings;

REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.call_logs FROM anon;
REVOKE ALL ON public.app_settings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.call_logs TO service_role;
GRANT ALL ON public.app_settings TO service_role;

CREATE POLICY "authenticated_all" ON public.leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.call_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);