import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/leads/new")({
  head: () => ({ meta: [{ title: "New Lead" }] }),
  component: NewLead,
});

function NewLead() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    company: "",
    contact_name: "",
    phone: "",
    email: "",
    website: "",
    location: "",
    notes: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.company.trim()) throw new Error("Company is required");
      const { data, error } = await supabase
        .from("leads")
        .insert({
          company: form.company.trim(),
          contact_name: form.contact_name || null,
          phone: form.phone || null,
          email: form.email || null,
          website: form.website || null,
          location: form.location || null,
          notes: form.notes || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Lead created");
      nav({ to: "/leads/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-5">New lead</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-3 bg-card border border-border rounded-xl p-5 max-w-xl"
      >
        {[
          { k: "company", label: "Company *", req: true },
          { k: "contact_name", label: "Contact name" },
          { k: "phone", label: "Phone" },
          { k: "email", label: "Email" },
          { k: "website", label: "Website" },
          { k: "location", label: "Location" },
        ].map((f) => (
          <div key={f.k}>
            <label className="text-xs text-muted-foreground">{f.label}</label>
            <input
              required={f.req}
              value={form[f.k as keyof typeof form]}
              onChange={set(f.k as keyof typeof form)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mt-1 focus:outline-none focus:border-primary"
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={3}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mt-1 focus:outline-none focus:border-primary"
          />
        </div>
        <button
          disabled={create.isPending}
          className="w-full bg-primary text-primary-foreground rounded-md py-2.5 font-semibold disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Save lead"}
        </button>
      </form>
    </AppShell>
  );
}
