import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Privacy — Sales Center" },
      { name: "description", content: "How Sales Center handles your data, security, and privacy." },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Trust & Privacy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is maintained by the Sales Center owner to answer common security and
            privacy questions about the app. It describes current, app-visible controls and
            is not an independent certification.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Access & authentication</h2>
          <p className="text-sm text-muted-foreground">
            Access is restricted to authenticated users. Sessions are managed by the
            underlying auth provider; protected routes require a valid sign-in before any
            lead data is returned.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Platform & hosting</h2>
          <p className="text-sm text-muted-foreground">
            Sales Center is built on Lovable Cloud. The platform provides managed hosting,
            database, and authentication. Lovable platform capabilities are used as-is and
            this page does not represent a Lovable-issued certification.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Data collection & use</h2>
          <p className="text-sm text-muted-foreground">
            The app stores lead records (company, contact details, notes, call logs, and
            follow-up dates) that you create or import. Data is used only to power the
            CRM features you interact with inside the app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Row-level security</h2>
          <p className="text-sm text-muted-foreground">
            Database tables enforce row-level security policies so that records are only
            accessible to authorized accounts through the app's APIs.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Subprocessors & integrations</h2>
          <p className="text-sm text-muted-foreground">
            Optional integrations (such as Notion import and an AI gateway for parsing
            follow-up dates) are invoked only when you trigger the corresponding feature.
            Configure or disconnect them at any time from the app's settings.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Retention & deletion</h2>
          <p className="text-sm text-muted-foreground">
            You can delete individual leads and their associated call logs from the lead
            detail page at any time. Deletions are immediate within the app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Shared responsibility</h2>
          <p className="text-sm text-muted-foreground">
            Lovable provides the underlying platform features. The Sales Center owner is
            responsible for how the app is configured and the data entered into it. You,
            as a user, are responsible for keeping your sign-in credentials safe.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="text-sm text-muted-foreground">
            For security or privacy questions, contact the Sales Center owner directly.
          </p>
        </section>

        <div className="pt-4">
          <Link to="/" className="text-sm text-primary hover:underline">← Back to app</Link>
        </div>
      </div>
    </div>
  );
}
