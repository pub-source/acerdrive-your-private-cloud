import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { gateway, isConfigured, type CredentialsPolicy, type GatewayConfig, type HealthResponse } from "./gateway";

export type GatewayStatus = "unconfigured" | "checking" | "connected" | "error";

interface Ctx {
  config: GatewayConfig;
  setConfig: (c: GatewayConfig) => void;
  status: GatewayStatus;
  health: HealthResponse | null;
  error: string | null;
  check: () => Promise<boolean>;
}

const GatewayCtx = createContext<Ctx | null>(null);
const KEY = "acerdrive.gateway";

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<GatewayConfig>({
    // Default to this personal AcerDrive gateway; users can change it in Settings.
    baseUrl: "https://tubig.tailf0978b.ts.net",
    credentials: "omit",
  });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<GatewayStatus>("unconfigured");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<GatewayConfig>;
        setConfigState({
          baseUrl: p.baseUrl ?? "",
          credentials: (p.credentials as CredentialsPolicy) === "include" ? "include" : "omit",
        });
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const runCheck = useCallback(async (cfg: GatewayConfig) => {
    if (!isConfigured(cfg)) {
      setStatus("unconfigured");
      setHealth(null);
      setError(null);
      return false;
    }
    setStatus("checking");
    try {
      const h = await gateway.health(cfg);
      setHealth(h);
      setError(null);
      setStatus("connected");
      return true;
    } catch (e) {
      setHealth(null);
      setError((e as Error).message);
      setStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (loaded) void runCheck(config);
  }, [loaded, config, runCheck]);

  const setConfig = useCallback((c: GatewayConfig) => {
    setConfigState(c);
    localStorage.setItem(KEY, JSON.stringify(c));
  }, []);

  const value = useMemo(
    () => ({ config, setConfig, status, health, error, check: () => runCheck(config) }),
    [config, setConfig, status, health, error, runCheck],
  );
  return <GatewayCtx.Provider value={value}>{children}</GatewayCtx.Provider>;
}

export function useGateway() {
  const c = useContext(GatewayCtx);
  if (!c) throw new Error("useGateway must be used inside GatewayProvider");
  return c;
}
