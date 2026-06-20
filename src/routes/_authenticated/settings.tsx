import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRESETS = [50, 75, 100];

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as { daily_goal: number; work_days: number[] };
    },
  });
  const [goal, setGoal] = useState<number>(50);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  useEffect(() => {
    if (settings.data) {
      setGoal(settings.data.daily_goal);
      setDays(settings.data.work_days);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ daily_goal: goal, work_days: days, updated_at: new Date().toISOString() })
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

      <section className="bg-card border border-border rounded-xl p-5 mb-4">
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

      <section className="bg-card border border-border rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-1">Work days</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Non-work days don't break your streak.
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((n, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`py-2.5 rounded-md text-xs font-semibold border ${
                days.includes(i)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-input border-border text-muted-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="w-full bg-primary text-primary-foreground rounded-md py-3 font-semibold disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save changes"}
      </button>
    </AppShell>
  );
}
