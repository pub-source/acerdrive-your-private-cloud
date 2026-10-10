import { Link } from "@tanstack/react-router";
import { HardDrive, Settings, BookOpen, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { StatusBadge } from "./StatusBadge";
import { StorageMeter } from "./StorageMeter";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "My Drive", icon: HardDrive },
  { to: "/setup", label: "Gateway setup", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-primary-foreground shadow-elevated">
              <HardDrive className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">AcerDrive</span>
          </Link>
          <button className="md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
              activeOptions={{ exact: true }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <StorageMeter />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Files live only on your Acer Aspire One. Nothing is stored in the cloud.
          </p>
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-30 bg-background/70 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-8">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <StatusBadge />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
