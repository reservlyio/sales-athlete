import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { ChevronDown, Video, Link2, FileText, X, Pencil } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

const TRAINING_FILES_BUCKET = "training-files";

// Accepts "90", "1:30", or "1:02:30" and returns whole seconds, or null if empty/invalid.
function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

function formatSecondsToTime(sec: number | null): string {
  if (sec === null || sec < 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getVideoEmbedUrl(url: string, startSec: number | null, endSec: number | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

    let id: string | null = null;
    if (hostname === "youtube.com") {
      id = u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] || null : u.searchParams.get("v");
    } else if (hostname === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0] || null;
    }

    if (id) {
      const params = new URLSearchParams();
      if (startSec !== null) params.set("start", String(startSec));
      if (endSec !== null) params.set("end", String(endSec));
      const query = params.toString();
      return `https://www.youtube.com/embed/${id}${query ? `?${query}` : ""}`;
    }

    if (hostname === "vimeo.com") {
      const vid = u.pathname.slice(1).split("/")[0];
      if (!vid || !/^\d+$/.test(vid)) return null;
      // Vimeo's embed only supports a start offset via the #t= fragment, not an end time.
      return `https://player.vimeo.com/video/${vid}${startSec !== null ? `#t=${startSec}s` : ""}`;
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
      return data as {
        daily_goal: number;
        work_days: number[];
        training_video_url: string | null;
        training_video_start_sec: number | null;
        training_video_end_sec: number | null;
        training_reference_urls: string[];
        training_script_path: string | null;
        training_script_filename: string | null;
      };
    },
  });
  const [goal, setGoal] = useState<number>(50);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoStart, setVideoStart] = useState<string>("");
  const [videoEnd, setVideoEnd] = useState<string>("");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [newReferenceUrl, setNewReferenceUrl] = useState("");
  const [trimOpen, setTrimOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [scriptFilename, setScriptFilename] = useState<string | null>(null);
  const [pendingScriptFile, setPendingScriptFile] = useState<File | null>(null);
  const [removeScript, setRemoveScript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startSec = useMemo(() => parseTimeToSeconds(videoStart), [videoStart]);
  const endSec = useMemo(() => parseTimeToSeconds(videoEnd), [videoEnd]);
  const embedUrl = useMemo(() => getVideoEmbedUrl(videoUrl, startSec, endSec), [videoUrl, startSec, endSec]);
  useEffect(() => {
    if (settings.data) {
      setGoal(settings.data.daily_goal);
      setDays(settings.data.work_days);
      setVideoUrl(settings.data.training_video_url ?? "");
      setVideoStart(formatSecondsToTime(settings.data.training_video_start_sec));
      setVideoEnd(formatSecondsToTime(settings.data.training_video_end_sec));
      setReferenceUrls(settings.data.training_reference_urls ?? []);
      setScriptPath(settings.data.training_script_path ?? null);
      setScriptFilename(settings.data.training_script_filename ?? null);
      setPendingScriptFile(null);
      setRemoveScript(false);
      setTrainingOpen(false);
      setTrimOpen(false);
      setReferencesOpen(false);
      setScriptOpen(false);
    }
  }, [settings.data]);

  const addReference = () => {
    const trimmed = newReferenceUrl.trim();
    if (!trimmed) return;
    setReferenceUrls((prev) => [...prev, trimmed]);
    setNewReferenceUrl("");
  };
  const removeReference = (idx: number) => setReferenceUrls((prev) => prev.filter((_, i) => i !== idx));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingScriptFile(file);
      setRemoveScript(false);
    }
    e.target.value = "";
  };

  async function downloadScript() {
    if (!scriptPath) return;
    const { data, error } = await supabase.storage.from(TRAINING_FILES_BUCKET).createSignedUrl(scriptPath, 60);
    if (error || !data) { toast.error("Couldn't generate a download link"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const save = useMutation({
    mutationFn: async () => {
      let newScriptPath = scriptPath;
      let newScriptFilename = scriptFilename;

      if (pendingScriptFile) {
        const ext = pendingScriptFile.name.split(".").pop() || "bin";
        const path = `script/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(TRAINING_FILES_BUCKET)
          .upload(path, pendingScriptFile, { upsert: true });
        if (upErr) throw upErr;
        if (scriptPath) await supabase.storage.from(TRAINING_FILES_BUCKET).remove([scriptPath]);
        newScriptPath = path;
        newScriptFilename = pendingScriptFile.name;
      } else if (removeScript && scriptPath) {
        await supabase.storage.from(TRAINING_FILES_BUCKET).remove([scriptPath]);
        newScriptPath = null;
        newScriptFilename = null;
      }

      const { error } = await supabase
        .from("app_settings")
        .update({
          daily_goal: goal,
          work_days: days,
          training_video_url: videoUrl.trim() || null,
          training_video_start_sec: startSec,
          training_video_end_sec: endSec,
          training_reference_urls: referenceUrls,
          training_script_path: newScriptPath,
          training_script_filename: newScriptFilename,
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
            <div className="space-y-3 mt-3">
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
              <div className="pt-2 border-t border-border/60 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTrimOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                    trimOpen
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Trim{startSec !== null || endSec !== null ? " ✓" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setReferencesOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                    referencesOpen
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Reference clips{referenceUrls.length > 0 ? ` (${referenceUrls.length})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setScriptOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                    scriptOpen
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  My script{scriptFilename || pendingScriptFile ? " ✓" : ""}
                </button>
              </div>

              {trimOpen && (
                <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Start at</label>
                    <Input
                      placeholder="e.g. 1:30"
                      value={videoStart}
                      onChange={(e) => setVideoStart(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      End at{videoUrl.includes("vimeo.com") ? " (YouTube only)" : ""}
                    </label>
                    <Input
                      placeholder="e.g. 4:00"
                      value={videoEnd}
                      onChange={(e) => setVideoEnd(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {referencesOpen && (
                <div className="space-y-2 rounded-md bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Good-delivery examples to reference later — just for you, not shown anywhere else.
                  </p>
                  {referenceUrls.length > 0 && (
                    <ul className="space-y-3">
                      {referenceUrls.map((url, i) => {
                        const preview = getVideoEmbedUrl(url, null, null);
                        return (
                          <li key={i} className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs">
                              <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                                {url}
                              </a>
                              <button
                                type="button"
                                onClick={() => removeReference(i)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {preview && (
                              <div className="aspect-video rounded-md overflow-hidden border border-border">
                                <iframe
                                  src={preview}
                                  title={`Reference clip ${i + 1}`}
                                  className="w-full h-full"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste a link…"
                      value={newReferenceUrl}
                      onChange={(e) => setNewReferenceUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addReference(); }
                      }}
                      className="text-xs h-8"
                    />
                    <button
                      type="button"
                      onClick={addReference}
                      className="text-xs font-semibold px-3 rounded-md bg-primary text-primary-foreground shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {scriptOpen && (
                <div className="space-y-2 rounded-md bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Your actual call script — PDF, Word, or text file.</p>
                  {pendingScriptFile ? (
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="flex-1 truncate">Will upload on save: {pendingScriptFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingScriptFile(null)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : scriptFilename && !removeScript ? (
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <button type="button" onClick={downloadScript} className="flex-1 truncate text-left text-primary hover:underline">
                        {scriptFilename}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveScript(true)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {removeScript ? "Will remove on save." : "No script uploaded yet."}
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
                  >
                    {scriptFilename || pendingScriptFile ? "Replace file" : "Upload file"}
                  </button>
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
