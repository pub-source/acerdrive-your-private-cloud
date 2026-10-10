import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/gateway";
import { useGateway } from "@/lib/gateway-context";

export function StorageMeter() {
  const { status, health } = useGateway();
  const s = health?.storage;
  if (status !== "connected" || !s || !s.totalBytes) {
    return (
      <div className="rounded-lg border bg-surface p-3 text-xs text-muted-foreground">
        Storage info unavailable
      </div>
    );
  }
  const pct = Math.min(100, (s.usedBytes / s.totalBytes) * 100);
  return (
    <div className="rounded-lg border bg-surface p-3">
      <div className="mb-2 flex justify-between text-xs">
        <span className="font-medium">Acer disk</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="mt-2 text-xs text-muted-foreground">
        {formatBytes(s.usedBytes)} of {formatBytes(s.totalBytes)} used
      </p>
    </div>
  );
}
