import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Users, Phone, Settings as SettingsIcon } from "lucide-react";

const links = [
  { to: "/", label: "Today", icon: Home },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen pb-20 md:pb-0 md:pl-56">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 border-r border-border bg-card flex-col p-4">
        <div className="mb-8 px-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Sales OS</div>
          <div className="text-lg font-bold">Command Center</div>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => {
            const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 bg-card border-t border-border">
        {links.map((l) => {
          const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`flex flex-col items-center justify-center py-2.5 gap-1 text-[11px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <main className="px-4 md:px-8 py-5 md:py-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
