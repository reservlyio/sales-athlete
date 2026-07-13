import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { ChevronDown, Video } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

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

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

// Displayed Mon -> Sun; values are JS Date.getDay() indices (Sun=0) since
// that's what's stored in work_days and used elsewhere (e.g. streak calc).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = [50, 75, 100];

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as { daily_goal: number; work_days: number[]; training_video_url: string | null };
    },
  });
  const [goal, setGoal] = useState<number>(50);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const embedUrl = useMemo(() => getVideoEmbedUrl(videoUrl), [videoUrl]);
  useEffect(() => {
    if (settings.data) {
      setGoal(settings.data.daily_goal);
      setDays(settings.data.work_days);
      setVideoUrl(settings.data.training_video_url ?? "");
      setTrainingOpen(!!settings.data.training_video_url);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({
          daily_goal: goal,
          work_days: days,
          training_video_url: videoUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDay = (i: number) =>
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()));

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-5">Settings</h1>

      <Collapsible open={trainingOpen} onOpenChange={setTrainingOpen}>
        <div className="bg-card border border-border rounded-xl p-4 mb-8">
          <CollapsibleTrigger className="w-full flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-500" />
              <span className="font-semibold">Training</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${trainingOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="text-xs text-muted-foreground mt-3 mb-2">
              Paste a training video link — saved to your account in the cloud, so it shows up the same on every
              device you sign in on, not just this browser.
            </p>
            <div className="space-y-3">
              <Input
                placeholder="Paste a YouTube or Vimeo URL…"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
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

      <section className="bg-card border border-border rounded-xl p-5 mb-8">
        <h2 className="font-semibold mb-1">Daily call goal</h2>
        <p className="text-xs text-muted-foreground mb-3">Streak only continues when this is hit.</p>
        <div className="flex gap-2 mb-3">
          {PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => setGoal(n)}
              className={`flex-1 py-2.5 rounded-md text-sm font-semibold stat-num border ${
                goal === n ? "bg-primary text-primary-foreground border-primary" : "bg-input border-border"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">Custom</label>
        <input
          type="number"
          min={1}
          value={goal}
          onChange={(e) => setGoal(Math.max(1, Number(e.target.value) || 1))}
          className="w-full mt-1 bg-input border border-border rounded-md px-3 py-2 text-sm stat-num"
        />
      </section>

      <section className="bg-card border border-border rounded-xl p-5 mb-8">
        <h2 className="font-semibold mb-1">Work days</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Non-work days don't break your streak.
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_ORDER.map((i, pos) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`py-2.5 rounded-md text-xs font-semibold border ${
                days.includes(i)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-input border-border text-muted-foreground"
              }`}
            >
              {DAY_NAMES[pos]}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="w-full mt-6 bg-primary text-primary-foreground rounded-full py-4 font-semibold disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save changes"}
      </button>
    </AppShell>
  );
}
