// Typed client for the self-hosted AcerDrive gateway (FastAPI on antiX).
// No secrets live here: access control is enforced by the gateway + VPN.

export type CredentialsPolicy = "omit" | "include";

export interface GatewayConfig {
  baseUrl: string;
  credentials: CredentialsPolicy;
}

export interface StorageInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

export interface HealthResponse {
  status: string;
  version?: string;
  hostname?: string;
  storage?: StorageInfo;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt?: string;
}

export class GatewayError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export function isConfigured(cfg: GatewayConfig): boolean {
  return normalizeBaseUrl(cfg.baseUrl) !== "";
}

function url(cfg: GatewayConfig, path: string): string {
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!base) throw new GatewayError("Gateway not configured");
  return `${base}${path}`;
}

async function request<T>(cfg: GatewayConfig, path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url(cfg, path), {
      ...init,
      credentials: cfg.credentials,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    const aborted = (e as Error)?.name === "AbortError";
    throw new GatewayError(
      aborted
        ? "Gateway timed out. Is the Acer awake and reachable on this network/VPN?"
        : "Could not reach the gateway (network, CORS, or mixed-content HTTPS→HTTP block).",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.message ?? detail;
    } catch {
      /* non-JSON error */
    }
    throw new GatewayError(`Gateway error ${res.status}: ${detail}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const gateway = {
  health: (cfg: GatewayConfig) => request<HealthResponse>(cfg, "/api/health", {}, 6000),

  listFiles: (cfg: GatewayConfig, params: { query?: string; folder?: string | null }) => {
    const qs = new URLSearchParams();
    qs.set("query", params.query ?? "");
    qs.set("folder", params.folder ?? "");
    return request<DriveFile[]>(cfg, `/api/files?${qs.toString()}`);
  },

  renameOrMove: (cfg: GatewayConfig, id: string, patch: { name?: string; folderId?: string | null }) =>
    request<DriveFile>(cfg, `/api/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteFile: (cfg: GatewayConfig, id: string) =>
    request<void>(cfg, `/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listFolders: (cfg: GatewayConfig) => request<Folder[]>(cfg, "/api/folders"),

  createFolder: (cfg: GatewayConfig, name: string) =>
    request<Folder>(cfg, "/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (cfg: GatewayConfig, id: string) =>
    request<void>(cfg, `/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" }),

  previewUrl: (cfg: GatewayConfig, id: string) => url(cfg, `/api/files/${encodeURIComponent(id)}/preview`),
  downloadUrl: (cfg: GatewayConfig, id: string) => url(cfg, `/api/files/${encodeURIComponent(id)}/download`),

  /** Multipart upload via XHR so we get real upload progress events. */
  upload(
    cfg: GatewayConfig,
    file: File,
    opts: { folderId?: string | null; onProgress?: (pct: number) => void; signal?: AbortSignal },
  ): Promise<DriveFile> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url(cfg, "/api/uploads"));
      xhr.withCredentials = cfg.credentials === "include";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as DriveFile);
          } catch {
            reject(new GatewayError("Gateway returned an invalid upload response", xhr.status));
          }
        } else {
          reject(new GatewayError(`Upload failed (${xhr.status})`, xhr.status));
        }
      };
      xhr.onerror = () => reject(new GatewayError("Upload failed: gateway unreachable"));
      xhr.onabort = () => reject(new GatewayError("Upload cancelled"));
      opts.signal?.addEventListener("abort", () => xhr.abort());
      const form = new FormData();
      form.append("file", file);
      if (opts.folderId) form.append("folderId", opts.folderId);
      xhr.send(form);
    });
  },
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export const isImage = (f: DriveFile) => f.mimeType.startsWith("image/");
export const isVideo = (f: DriveFile) => f.mimeType.startsWith("video/");
export const isAcceptedMedia = (file: File) => file.type.startsWith("image/") || file.type.startsWith("video/");
