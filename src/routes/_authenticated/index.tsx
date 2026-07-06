import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { todayISO, fmtDate } from "@/lib/crm";
import { Flame, Trophy, Target, Phone, ChevronDown, Video } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Today — Sales Command Center" }] }),
  component: Dashboard,
});

type CallRow = { call_date: string };
type Lead = { id: string; company: string; phone: string | null; next_follow_up: string | null };
type Settings = { daily_goal: number; work_days: number[] };

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, "");

    if (hostname === "youtube.com") {
      const id = u.searchParams.get("v");
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    }
    if (hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    }
    if (hostname === "vimeo.com") {
      const id = u.pathname.slice(1).split("/")[0];
      if (!id || !/^\d+$/.test(id)) return null;
      return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

function computeStreak(byDay: Map<string, number>, goal: number, workDays: number[]) {
  const isWork = (d: Date) => workDays.includes(d.getDay());
  let streak = 0;
  const cur = new Date();
  // If today is work day and not yet hit, start from yesterday
  const todayCount = byDay.get(toISO(cur)) ?? 0;
  if (isWork(cur) && todayCount < goal) cur.setDate(cur.getDate() - 1);
  while (true) {
    if (!isWork(cur)) {
      cur.setDate(cur.getDate() - 1);
      if (streak > 365) break;
      continue;
    }
    const c = byDay.get(toISO(cur)) ?? 0;
    if (c >= goal) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else break;
    if (streak > 365) break;
  }
  return streak;
}

function TrainingCard() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const embedUrl = useMemo(() => getVideoEmbedUrl(url), [url]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="bg-card rounded-xl border border-border p-4">
        <CollapsibleTrigger className="w-full flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-green-500" />
            <span className="font-bold">Training</span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Paste a YouTube or Vimeo URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {embedUrl && (
              <div className="aspect-video rounded-md overflow-hidden border border-border">
                <iframe
                  src={embedUrl}
                  title="Training video"
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Dashboard() {
  const today = todayISO();

  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as Settings;
    },
  });
  const goal = settingsQ.data?.daily_goal ?? 50;
  const workDays = settingsQ.data?.work_days ?? [1, 2, 3, 4, 5];

  const callsQ = useQuery({
    queryKey: ["calls-90"],
    queryFn: async (): Promise<CallRow[]> => {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const { data, error } = await supabase
        .from("call_logs")
        .select("call_date")
        .gte("call_date", toISO(from));
      if (error) throw error;
      return data as CallRow[];
    },
  });

  const followupsQ = useQuery({
    queryKey: ["followups-today", today],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,company,phone,next_follow_up")
        .lte("next_follow_up", today)
        .neq("deal_stage", "client")
        .neq("deal_stage", "lost")
        .order("next_follow_up", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const stats = useMemo(() => {
    const byDay = new Map<string, number>();
    (callsQ.data ?? []).forEach((r) => byDay.set(r.call_date, (byDay.get(r.call_date) ?? 0) + 1));
    const todayCalls = byDay.get(today) ?? 0;
    const sow = startOfWeek(new Date());
    const lastSow = new Date(sow);
    lastSow.setDate(lastSow.getDate() - 7);
    let thisWeek = 0,
      lastWeek = 0;
    byDay.forEach((c, d) => {
      const dd = new Date(d + "T00:00:00");
      if (dd >= sow) thisWeek += c;
      else if (dd >= lastSow && dd < sow) lastWeek += c;
    });
    const streak = computeStreak(byDay, goal, workDays);
    return { todayCalls, thisWeek, lastWeek, streak };
  }, [callsQ.data, goal, workDays, today]);

  const pct = Math.min(100, Math.round((stats.todayCalls / goal) * 100));
  const diff = stats.thisWeek - stats.lastWeek;
  const newRecord = stats.thisWeek > stats.lastWeek && stats.thisWeek > 0;

  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mt-1">Today's mission</h1>
      </header>

      {/* Target */}
      <section className="bg-card rounded-xl p-5 border border-border mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="size-4" /> Today's calls
          </div>
          <Link to="/settings" className="text-xs text-muted-foreground hover:text-primary">
            Goal: {goal}
          </Link>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="stat-num text-5xl md:text-6xl font-bold text-primary">{stats.todayCalls}</span>
          <span className="stat-num text-2xl text-muted-foreground">/ {goal}</span>
          <span className="ml-auto text-sm text-muted-foreground stat-num">{pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {stats.todayCalls >= goal && (
          <div className="mt-3 text-sm text-success font-semibold">✓ Goal hit — streak secured.</div>
        )}
      </section>

      {/* Streak + week */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
        <div className="bg-card rounded-xl p-5 border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Flame className="size-4 text-streak" /> Current streak
          </div>
          <div className="stat-num text-4xl font-bold text-streak">{stats.streak}</div>
          <div className="text-xs text-muted-foreground mt-1">{stats.streak === 1 ? "day" : "days"}</div>
        </div>
        <div className="bg-card rounded-xl p-5 border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Trophy className="size-4 text-warning" /> This week
          </div>
          <div className="stat-num text-4xl font-bold">{stats.thisWeek}</div>
          <div className="text-xs text-muted-foreground mt-1 stat-num">
            Last: {stats.lastWeek}{" "}
            {diff !== 0 && (
              <span className={diff > 0 ? "text-success" : "text-destructive"}>
                ({diff > 0 ? "+" : ""}
                {diff})
              </span>
            )}
          </div>
          {newRecord && <div className="mt-2 text-xs font-bold text-warning">🏆 New record</div>}
        </div>
      </div>

      {/* Training */}
      <div className="mt-8">
        <TrainingCard />
      </div>
    </AppShell>
  );
}
