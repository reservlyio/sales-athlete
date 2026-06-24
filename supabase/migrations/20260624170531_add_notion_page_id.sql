-- Stable key to match leads back to their Notion page across re-syncs,
-- so re-importing can upsert instead of wiping the table.
ALTER TABLE public.leads ADD COLUMN notion_page_id TEXT;
CREATE UNIQUE INDEX leads_notion_page_id_idx ON public.leads(notion_page_id) WHERE notion_page_id IS NOT NULL;
