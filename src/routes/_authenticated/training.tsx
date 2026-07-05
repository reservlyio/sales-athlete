import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({ meta: [{ title: "Training" }] }),
  component: TrainingPage,
});

type TrainingSettings = { training_video_url: string | null; training_script: string | null };

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

function TrainingPage() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["training-settings"],
    queryFn: async (): Promise<TrainingSettings> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("training_video_url,training_script")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as TrainingSettings;
    },
  });

  const [videoUrl, setVideoUrl] = useState("");
  const [script, setScript] = useState("");

  useEffect(() => {
    if (settingsQ.data) {
      setVideoUrl(settingsQ.data.training_video_url ?? "");
      setScript(settingsQ.data.training_script ?? "");
    }
  }, [settingsQ.data]);

  const saveVideo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ training_video_url: videoUrl || null })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Video saved"); qc.invalidateQueries({ queryKey: ["training-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveScript = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ training_script: script || null })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Script saved"); qc.invalidateQueries({ queryKey: ["training-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const embedUrl = videoUrl.trim() ? toEmbedUrl(videoUrl.trim()) : null;
  const videoDirty = videoUrl !== (settingsQ.data?.training_video_url ?? "");
  const scriptDirty = script !== (settingsQ.data?.training_script ?? "");

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-5">Training</h1>

      <section className="bg-card border border-border rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-1">Training video</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Paste a YouTube or Vimeo link — practice tonality by watching and repeating.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          {videoDirty && (
            <button
              onClick={() => saveVideo.mutate()}
              disabled={saveVideo.isPending}
              className="shrink-0 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {saveVideo.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        {videoUrl.trim() && (
          embedUrl ? (
            <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe
                src={embedUrl}
                title="Training video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
          ) : (
            <p className="text-xs text-destructive">Couldn't recognize that as a YouTube or Vimeo link.</p>
          )
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Script</h2>
          {scriptDirty && (
            <button
              onClick={() => saveScript.mutate()}
              disabled={saveScript.isPending}
              className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 font-semibold disabled:opacity-50"
            >
              {saveScript.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={10}
          placeholder="Write or paste your call script here…"
          className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </section>
    </AppShell>
  );
}
