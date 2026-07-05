import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { fmtDate } from "@/lib/crm";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({ meta: [{ title: "Call log" }] }),
  component: CallsPage,
});

type Row = {
  id: string;
  lead_id: string | null;
  company: string;
  call_date: string;
  result: string;
  notes: string | null;
  follow_up_date: string | null;
};

function CallsPage() {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["all-calls"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("id,lead_id,company,call_date,result,notes,follow_up_date")
        .order("call_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = search.trim()
    ? (q.data ?? []).filter((r) => r.company.toLowerCase().includes(search.trim().toLowerCase()))
    : (q.data ?? []);

  // group by date
  const grouped = new Map<string, Row[]>();
  filtered.forEach((r) => {
    const list = grouped.get(r.call_date) ?? [];
    list.push(r);
    grouped.set(r.call_date, list);
  });

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Call log</h1>
      <p className="text-xs text-muted-foreground mb-5 stat-num">
        Last 200 calls · {q.data?.length ?? 0} entries
      </p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company…"
          className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : grouped.size === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
          {search.trim() ? "No calls match your search." : "No calls logged yet. Get out there. 📞"}
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([date, rows]) => (
            <div key={date}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold">{fmtDate(date)}</h2>
                <span className="text-xs text-muted-foreground stat-num">{rows.length} calls</span>
              </div>
              <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                {rows.map((r) => {
                  const inner = (
                    <div className="px-4 py-2.5 hover:bg-accent/40">
                      <div className="flex justify-between items-baseline">
                        <span className="font-medium text-sm truncate">{r.company}</span>
                        <span className="text-[11px] text-muted-foreground">{r.result}</span>
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.notes}</p>}
                      {r.follow_up_date && (
                        <p className="text-[11px] text-warning mt-0.5">→ Follow up {fmtDate(r.follow_up_date)}</p>
                      )}
                    </div>
                  );
                  return r.lead_id ? (
                    <Link key={r.id} to="/leads/$id" params={{ id: r.lead_id }}>{inner}</Link>
                  ) : (
                    <div key={r.id}>{inner}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
