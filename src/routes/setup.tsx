import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Gateway setup — AcerDrive" },
      { name: "description", content: "Install the AcerDrive FastAPI gateway on antiX Linux and view the API contract." },
      { property: "og:title", content: "Gateway setup — AcerDrive" },
      { property: "og:description", content: "Step-by-step antiX gateway deployment and REST API contract." },
    ],
  }),
  component: SetupPage,
});

const install = `# On the Acer Aspire One D250 (antiX, 32-bit)
sudo apt update
sudo apt install -y python3 python3-venv python3-pip ffmpeg
sudo useradd -r -m -d /srv/acerdrive acerdrive
sudo -u acerdrive mkdir -p /srv/acerdrive/{media,thumbs}
sudo -u acerdrive python3 -m venv /srv/acerdrive/venv
sudo -u acerdrive /srv/acerdrive/venv/bin/pip install fastapi "uvicorn[standard]" python-multipart
# copy gateway.py (below) to /srv/acerdrive/gateway.py`;

const gatewayPy = `# /srv/acerdrive/gateway.py — minimal reference gateway
import json, os, shutil, uuid, datetime, mimetypes
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT = "/srv/acerdrive"; MEDIA = f"{ROOT}/media"; DB = f"{ROOT}/index.json"
ALLOWED_ORIGIN = os.environ["ACERDRIVE_ORIGIN"]  # e.g. https://your-app.lovable.app
MAX_BYTES = 2 * 1024**3

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=[ALLOWED_ORIGIN],
                   allow_methods=["GET","POST","PATCH","DELETE"], allow_headers=["*"],
                   allow_credentials=True)

def load():
    return json.load(open(DB)) if os.path.exists(DB) else {"files": {}, "folders": {}}
def save(d):
    tmp = DB + ".tmp"; json.dump(d, open(tmp, "w")); os.replace(tmp, DB)
def now(): return datetime.datetime.utcnow().isoformat() + "Z"

@app.get("/api/health")
def health():
    u = shutil.disk_usage(MEDIA)
    return {"status": "ok", "version": "0.1.0", "hostname": os.uname().nodename,
            "storage": {"totalBytes": u.total, "usedBytes": u.used, "freeBytes": u.free}}

@app.get("/api/files")
def files(query: str = "", folder: str = ""):
    out = list(load()["files"].values())
    if folder: out = [f for f in out if f["folderId"] == folder]
    if query: out = [f for f in out if query.lower() in f["name"].lower()]
    return out

@app.post("/api/uploads")
async def upload(file: UploadFile = File(...), folderId: str | None = Form(None)):
    ctype = file.content_type or ""
    if not (ctype.startswith("image/") or ctype.startswith("video/")):
        raise HTTPException(415, "Only images and videos")
    fid = uuid.uuid4().hex; path = f"{MEDIA}/{fid}"; size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES: out.close(); os.remove(path); raise HTTPException(413, "Too large")
            out.write(chunk)
    d = load()
    rec = {"id": fid, "name": os.path.basename(file.filename or fid)[:255], "mimeType": ctype,
           "size": size, "createdAt": now(), "folderId": folderId or None}
    d["files"][fid] = rec; save(d); return rec

def get(fid):
    f = load()["files"].get(fid)
    if not f: raise HTTPException(404, "Not found")
    return f

@app.get("/api/files/{fid}/preview")
def preview(fid: str):
    f = get(fid); return FileResponse(f"{MEDIA}/{fid}", media_type=f["mimeType"])

@app.get("/api/files/{fid}/download")
def download(fid: str):
    f = get(fid); return FileResponse(f"{MEDIA}/{fid}", media_type=f["mimeType"], filename=f["name"])

class Patch(BaseModel):
    name: str | None = None
    folderId: str | None = None

@app.patch("/api/files/{fid}")
def patch(fid: str, p: Patch):
    d = load(); f = d["files"].get(fid)
    if not f: raise HTTPException(404, "Not found")
    if p.name: f["name"] = os.path.basename(p.name)[:255]
    if "folderId" in p.model_fields_set: f["folderId"] = p.folderId
    save(d); return f

@app.delete("/api/files/{fid}", status_code=204)
def delete(fid: str):
    d = load()
    if d["files"].pop(fid, None) is None: raise HTTPException(404, "Not found")
    os.remove(f"{MEDIA}/{fid}"); save(d)

class NewFolder(BaseModel): name: str

@app.get("/api/folders")
def folders(): return list(load()["folders"].values())

@app.post("/api/folders")
def create_folder(b: NewFolder):
    d = load(); fid = uuid.uuid4().hex
    d["folders"][fid] = {"id": fid, "name": b.name[:100], "createdAt": now()}; save(d)
    return d["folders"][fid]

@app.delete("/api/folders/{fid}", status_code=204)
def delete_folder(fid: str):
    d = load()
    if any(f["folderId"] == fid for f in d["files"].values()):
        raise HTTPException(409, "Folder not empty")
    if d["folders"].pop(fid, None) is None: raise HTTPException(404, "Not found")
    save(d)`;

const service = `# antiX uses sysVinit/runit — simplest: start from /etc/rc.local or a runit service.
# Bind ONLY to localhost; Tailscale provides HTTPS + private access.
sudo -u acerdrive env ACERDRIVE_ORIGIN=https://YOUR-APP-URL \\
  /srv/acerdrive/venv/bin/uvicorn gateway:app --app-dir /srv/acerdrive \\
  --host 127.0.0.1 --port 8765 --workers 1

# Install Tailscale, join your tailnet, then expose HTTPS inside the tailnet only:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg --https=443 http://127.0.0.1:8765
# Gateway URL for Settings: https://<acer-name>.<tailnet>.ts.net`;

const contract: [string, string, string][] = [
  ["GET", "/api/health", "{ status, version?, hostname?, storage?: { totalBytes, usedBytes, freeBytes } }"],
  ["GET", "/api/files?query=&folder=", "DriveFile[] — { id, name, mimeType, size, createdAt, folderId|null }"],
  ["POST", "/api/uploads", "multipart: file, folderId? → DriveFile"],
  ["GET", "/api/files/:id/preview", "inline media bytes (image/* or video/*, Range support recommended)"],
  ["GET", "/api/files/:id/download", "attachment bytes"],
  ["PATCH", "/api/files/:id", "JSON { name?, folderId? } → DriveFile"],
  ["DELETE", "/api/files/:id", "204"],
  ["GET", "/api/folders", "Folder[] — { id, name, createdAt? }"],
  ["POST", "/api/folders", "JSON { name } → Folder"],
  ["DELETE", "/api/folders/:id", "204 (409 if not empty)"],
];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border bg-sidebar p-4 font-mono text-xs leading-relaxed">{children}</pre>;
}

function SetupPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Gateway setup</h1>
        <p className="mt-2 text-muted-foreground">
          AcerDrive is only a front end. Your files are written to the Acer’s local disk by a small Python FastAPI gateway
          that you install on antiX. Until it’s running and reachable, the app shows “Gateway not configured”.
        </p>
      </div>

      <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="font-medium">Network & security</p>
          <p className="text-muted-foreground">
            A browser outside your home cannot reach the Acer’s LAN IP (e.g. 192.168.x.x). For remote use, connect your
            phone/laptop and the Acer to a VPN such as <strong>Tailscale</strong> or <strong>WireGuard</strong>, or use a
            carefully secured, authenticated HTTPS reverse proxy. Never port-forward raw HTTP, SSH or VNC to the internet.
            The gateway has no login of its own here — the VPN is what keeps it private.
          </p>
        </div>
      </div>

      <section className="space-y-3"><h2 className="text-xl font-semibold">1. Install dependencies</h2><Code>{install}</Code></section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Reference gateway</h2>
        <p className="text-sm text-muted-foreground">Lightweight enough for the Atom N450 / 1 GB RAM. Thumbnails are optional — the preview endpoint can serve originals.</p>
        <Code>{gatewayPy}</Code>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">3. Run privately & expose over the VPN</h2><Code>{service}</Code></section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. Connect</h2>
        <p className="text-sm text-muted-foreground">Open Settings, paste the HTTPS tailnet URL and press Test connection.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">API contract</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="p-3">Method</th><th className="p-3">Path</th><th className="p-3">Response</th></tr></thead>
            <tbody>
              {contract.map(([m, p, r]) => (
                <tr key={m + p} className="border-t">
                  <td className="p-3 font-mono text-xs font-semibold text-primary">{m}</td>
                  <td className="p-3 font-mono text-xs">{p}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Errors: non-2xx with JSON <code className="font-mono">{"{ detail }"}</code>. CORS must allow this app’s exact origin.</p>
      </section>
    </div>
  );
}
