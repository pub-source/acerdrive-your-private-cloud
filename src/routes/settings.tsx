import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatBytes, normalizeBaseUrl } from "@/lib/gateway";
import { useGateway } from "@/lib/gateway-context";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AcerDrive" },
      { name: "description", content: "Configure and test the connection to your AcerDrive gateway." },
      { property: "og:title", content: "Settings — AcerDrive" },
      { property: "og:description", content: "Connect AcerDrive to your private, self-hosted antiX gateway." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { config, setConfig, status, health, error, check } = useGateway();
  const [url, setUrl] = useState(config.baseUrl);
  const [withCreds, setWithCreds] = useState(config.credentials === "include");
  useEffect(() => { setUrl(config.baseUrl); setWithCreds(config.credentials === "include"); }, [config]);

  const save = () => setConfig({ baseUrl: normalizeBaseUrl(url), credentials: withCreds ? "include" : "omit" });
  const dirty = normalizeBaseUrl(url) !== config.baseUrl || (withCreds ? "include" : "omit") !== config.credentials;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Gateway connection</h2>
        <div className="space-y-1.5">
          <label htmlFor="gw" className="text-sm font-medium">Gateway base URL</label>
          <Input id="gw" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tubig.your-tailnet.ts.net" className="font-mono" />
          <p className="text-xs text-muted-foreground">
            Use your Tailscale/WireGuard address. This app is served over HTTPS, so browsers block plain-HTTP gateways
            (mixed content) — use HTTPS, e.g. via <code className="font-mono">tailscale serve</code>.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Send cookies to gateway</p>
            <p className="text-xs text-muted-foreground">Enable only if your gateway or proxy uses cookie-based login. Requires exact-origin CORS.</p>
          </div>
          <Switch checked={withCreds} onCheckedChange={setWithCreds} aria-label="Send cookies to gateway" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { if (dirty) save(); else void check(); }} disabled={status === "checking"}>
            {status === "checking" && <Loader2 className="h-4 w-4 animate-spin" />}
            {dirty ? "Save & test connection" : "Test connection"}
          </Button>
          {config.baseUrl && <Button variant="ghost" onClick={() => { setUrl(""); setConfig({ baseUrl: "", credentials: "omit" }); }}>Clear</Button>}
        </div>

        {status === "connected" && health && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-success" />Gateway reachable</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Status</dt><dd>{health.status}</dd>
              {health.hostname && (<><dt className="text-muted-foreground">Host</dt><dd>{health.hostname}</dd></>)}
              {health.version && (<><dt className="text-muted-foreground">Version</dt><dd>{health.version}</dd></>)}
              {health.storage && (<>
                <dt className="text-muted-foreground">Used</dt><dd>{formatBytes(health.storage.usedBytes)}</dd>
                <dt className="text-muted-foreground">Free</dt><dd>{formatBytes(health.storage.freeBytes)}</dd>
                <dt className="text-muted-foreground">Total</dt><dd>{formatBytes(health.storage.totalBytes)}</dd>
              </>)}
            </dl>
          </div>
        )}
        {status === "error" && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div><p className="font-medium">Gateway not configured</p><p className="text-muted-foreground">{error}</p></div>
          </div>
        )}
        {status === "unconfigured" && <p className="text-sm text-muted-foreground">Gateway not configured.</p>}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5 text-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />Privacy</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Files are sent directly from your browser to your Acer gateway. They are never stored in Lovable or any cloud storage.</li>
          <li>Only the gateway URL and cookie preference are saved, in this browser’s local storage. No passwords or keys are stored here.</li>
          <li>Privacy is enforced by your gateway and your VPN (Tailscale/WireGuard) — not by this web app. Anyone who can reach the gateway can reach your files, so keep it off the public internet.</li>
          <li>Never expose raw HTTP, SSH or VNC from the Acer to the internet.</li>
        </ul>
      </section>
    </div>
  );
}
