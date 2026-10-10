import { useGateway } from "@/lib/gateway-context";
import { cn } from "@/lib/utils";

export function StatusBadge({ className }: { className?: string }) {
  const { status } = useGateway();
  const map = {
    unconfigured: { label: "Gateway not configured", dot: "bg-muted-foreground" },
    checking: { label: "Checking gateway…", dot: "bg-warning animate-pulse" },
    connected: { label: "Gateway connected", dot: "bg-success" },
    error: { label: "Gateway not configured", dot: "bg-destructive" },
  } as const;
  const m = map[status];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", m.dot)} aria-hidden />
      {m.label}
      {status === "error" && <span className="text-destructive">· unreachable</span>}
    </span>
  );
}
