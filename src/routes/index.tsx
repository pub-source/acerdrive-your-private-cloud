import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Search, LayoutGrid, List, FolderPlus, Folder as FolderIcon, Image as ImageIcon, Film, FileQuestion,
  MoreVertical, Download, Pencil, Trash2, Eye, Loader2, AlertTriangle, PlugZap, X, HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { gateway, formatBytes, isImage, isVideo, isAcceptedMedia, type DriveFile, type Folder } from "@/lib/gateway";
import { useGateway } from "@/lib/gateway-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Drive — AcerDrive" },
      { name: "description", content: "Browse, upload and preview photos and videos stored on your own Acer laptop." },
      { property: "og:title", content: "My Drive — AcerDrive" },
      { property: "og:description", content: "Private photo and video library served from your own antiX gateway." },
    ],
  }),
  component: DrivePage,
});

interface UploadJob { id: string; name: string; progress: number; state: "uploading" | "done" | "error"; error?: string }

function DrivePage() {
  const { status } = useGateway();
  if (status === "checking") return <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (status !== "connected") return <NotConnected />;
  return <Drive />;
}

function NotConnected() {
  const { status, error } = useGateway();
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-brand shadow-elevated">
        <PlugZap className="h-8 w-8 text-primary-foreground" />
      </div>
      <h1 className="text-3xl font-bold">Gateway not configured</h1>
      <p className="mt-3 text-muted-foreground">
        AcerDrive stores your photos and videos only on your Acer Aspire One. To browse or upload, install the small
        AcerDrive gateway on antiX and point this app at it.
      </p>
      {status === "error" && error && (
        <p className="mx-auto mt-4 flex max-w-lg items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {error}
        </p>
      )}
      <ol className="mx-auto mt-8 grid max-w-lg gap-3 text-left text-sm">
        {["Install the FastAPI gateway on the Acer (see Gateway setup).", "Connect your device via Tailscale or WireGuard, or be on the same home network.", "Enter the gateway URL in Settings and press Test connection."].map((s, i) => (
          <li key={i} className="flex gap-3 rounded-lg border bg-card p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild><Link to="/setup">Gateway setup</Link></Button>
        <Button asChild variant="secondary"><Link to="/settings">Settings</Link></Button>
      </div>
    </div>
  );
}

function Drive() {
  const { config, health } = useGateway();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const [editing, setEditing] = useState<DriveFile | null>(null);
  const [deleting, setDeleting] = useState<DriveFile | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadFolders = useCallback(async () => {
    try { setFolders(await gateway.listFolders(config)); } catch (e) { toast.error((e as Error).message); }
  }, [config]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await gateway.listFiles(config, { query: debounced, folder: folderId }));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [config, debounced, folderId]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const startUploads = (list: FileList | File[]) => {
    const arr = Array.from(list);
    const rejected = arr.filter((f) => !isAcceptedMedia(f));
    if (rejected.length) toast.error(`Skipped ${rejected.length} non-image/video file(s)`);
    arr.filter(isAcceptedMedia).forEach((file) => {
      const id = `${file.name}-${file.size}-${file.lastModified}-${performance.now()}`;
      setUploads((u) => [...u, { id, name: file.name, progress: 0, state: "uploading" }]);
      gateway
        .upload(config, file, {
          folderId,
          onProgress: (p) => setUploads((u) => u.map((j) => (j.id === id ? { ...j, progress: p } : j))),
        })
        .then(() => {
          setUploads((u) => u.map((j) => (j.id === id ? { ...j, progress: 100, state: "done" } : j)));
          void loadFiles();
        })
        .catch((e: Error) => {
          setUploads((u) => u.map((j) => (j.id === id ? { ...j, state: "error", error: e.message } : j)));
          toast.error(`${file.name}: ${e.message}`);
        });
    });
  };

  const recent = useMemo(
    () => [...files].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6),
    [files],
  );
  const currentFolder = folders.find((f) => f.id === folderId);

  return (
    <div
      className="relative mx-auto max-w-7xl"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) startUploads(e.dataTransfer.files); }}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card p-10 text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-primary" />
            <p className="font-display text-lg font-semibold">Drop photos & videos to upload to your Acer</p>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{health?.hostname ? `Connected to ${health.hostname}` : "Connected to your Acer"}</p>
          <h1 className="text-3xl font-bold">{currentFolder ? currentFolder.name : "My Drive"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setNewFolderOpen(true)}><FolderPlus className="h-4 w-4" />New folder</Button>
          <Button onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" />Upload</Button>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden"
            onChange={(e) => { if (e.target.files) startUploads(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your photos & videos" className="pl-9" aria-label="Search files" />
        </div>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="View mode">
          <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          <Button size="icon" variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Folders</h2>
        <div className="flex flex-wrap gap-2">
          <FolderChip active={folderId === null} onClick={() => setFolderId(null)} icon={<HardDrive className="h-4 w-4" />} label="All files" />
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              <FolderChip active={folderId === f.id} onClick={() => setFolderId(f.id)} icon={<FolderIcon className="h-4 w-4" />} label={f.name} />
              <button aria-label={`Delete folder ${f.name}`} onClick={() => setDeletingFolder(f)}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground group-hover:grid focus:grid">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {uploads.length > 0 && (
        <section className="mb-8 rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Uploads</h2>
            <Button size="sm" variant="ghost" onClick={() => setUploads((u) => u.filter((j) => j.state === "uploading"))}>Clear finished</Button>
          </div>
          <ul className="space-y-3">
            {uploads.map((u) => (
              <li key={u.id} className="text-sm">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate">{u.name}</span>
                  <span className={cn("shrink-0 text-xs", u.state === "error" ? "text-destructive" : u.state === "done" ? "text-success" : "text-muted-foreground")}>
                    {u.state === "error" ? u.error : u.state === "done" ? "Saved to Acer" : `${u.progress}%`}
                  </span>
                </div>
                <Progress value={u.progress} className="h-1.5" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!query && !folderId && recent.length > 0 && !loading && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recent.map((f) => (
              <button key={f.id} onClick={() => setPreview(f)} className="overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring">
                <Thumb file={f} className="aspect-square" />
                <p className="truncate px-2 py-1.5 text-xs">{f.name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{query ? `Results for “${query}”` : "Files"}</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-xl" />)}
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm">{loadError}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void loadFiles()}>Retry</Button>
          </div>
        ) : files.length === 0 ? (
          <button onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed p-12 text-center transition hover:border-primary">
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{query ? "No files match your search" : "No files here yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Drag photos & videos here or click to upload</p>
          </button>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {files.map((f) => (
              <div key={f.id} className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary">
                <button className="block w-full" onClick={() => setPreview(f)} aria-label={`Preview ${f.name}`}>
                  <Thumb file={f} className="aspect-[4/3]" />
                </button>
                <div className="flex items-center gap-2 p-2.5">
                  <TypeIcon file={f} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                  </div>
                  <FileMenu file={f} onPreview={setPreview} onEdit={setEditing} onDelete={setDeleting} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted-foreground">
                <tr><th className="p-3 font-medium">Name</th><th className="hidden p-3 font-medium sm:table-cell">Size</th><th className="hidden p-3 font-medium md:table-cell">Added</th><th className="w-10" /></tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-t hover:bg-accent/40">
                    <td className="p-2">
                      <button className="flex items-center gap-3 text-left" onClick={() => setPreview(f)}>
                        <Thumb file={f} className="h-10 w-10 shrink-0 rounded-md" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    </td>
                    <td className="hidden p-3 text-muted-foreground sm:table-cell">{formatBytes(f.size)}</td>
                    <td className="hidden p-3 text-muted-foreground md:table-cell">{new Date(f.createdAt).toLocaleDateString()}</td>
                    <td className="p-2"><FileMenu file={f} onPreview={setPreview} onEdit={setEditing} onDelete={setDeleting} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
      <EditDialog file={editing} folders={folders} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void loadFiles(); }} />
      <NewFolderDialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onCreated={() => { setNewFolderOpen(false); void loadFolders(); }} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the file from your Acer’s disk. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!deleting) return;
              try { await gateway.deleteFile(config, deleting.id); toast.success("File deleted"); void loadFiles(); }
              catch (e) { toast.error((e as Error).message); }
              setDeleting(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingFolder} onOpenChange={(o) => !o && setDeletingFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{deletingFolder?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The gateway decides what happens to files inside (typically the folder must be empty).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!deletingFolder) return;
              try {
                await gateway.deleteFolder(config, deletingFolder.id);
                if (folderId === deletingFolder.id) setFolderId(null);
                toast.success("Folder deleted"); void loadFolders();
              } catch (e) { toast.error((e as Error).message); }
              setDeletingFolder(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FolderChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition", active ? "border-primary bg-accent" : "bg-card hover:bg-accent/50")}>
      {icon}{label}
    </button>
  );
}

function TypeIcon({ file }: { file: DriveFile }) {
  if (isImage(file)) return <ImageIcon className="h-4 w-4 shrink-0 text-chart-4" />;
  if (isVideo(file)) return <Film className="h-4 w-4 shrink-0 text-chart-5" />;
  return <FileQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function Thumb({ file, className }: { file: DriveFile; className?: string }) {
  const { config } = useGateway();
  const [failed, setFailed] = useState(false);
  const cross = config.credentials === "include" ? "use-credentials" : undefined;
  const fallback = (
    <div className={cn("grid place-items-center bg-muted", className)}>
      {isVideo(file) ? <Film className="h-8 w-8 text-muted-foreground" /> : isImage(file) ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <FileQuestion className="h-8 w-8 text-muted-foreground" />}
    </div>
  );
  if (failed || (!isImage(file) && !isVideo(file))) return fallback;
  if (isVideo(file)) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <video src={`${gateway.previewUrl(config, file.id)}#t=0.5`} preload="metadata" muted crossOrigin={cross} onError={() => setFailed(true)} className="h-full w-full object-cover" />
        <Film className="absolute bottom-1.5 right-1.5 h-4 w-4 text-foreground drop-shadow" />
      </div>
    );
  }
  return <img src={gateway.previewUrl(config, file.id)} alt={file.name} loading="lazy" crossOrigin={cross} onError={() => setFailed(true)} className={cn("bg-muted object-cover", className)} />;
}

function FileMenu({ file, onPreview, onEdit, onDelete }: { file: DriveFile; onPreview: (f: DriveFile) => void; onEdit: (f: DriveFile) => void; onDelete: (f: DriveFile) => void }) {
  const { config } = useGateway();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${file.name}`}><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onPreview(file)}><Eye className="h-4 w-4" />Preview</DropdownMenuItem>
        <DropdownMenuItem asChild><a href={gateway.downloadUrl(config, file.id)} download={file.name}><Download className="h-4 w-4" />Download</a></DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(file)}><Pencil className="h-4 w-4" />Rename / move</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(file)}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PreviewDialog({ file, onClose }: { file: DriveFile | null; onClose: () => void }) {
  const { config } = useGateway();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file]);
  const cross = config.credentials === "include" ? "use-credentials" : undefined;
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        {file && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{file.name}</DialogTitle>
              <DialogDescription>{formatBytes(file.size)} · {file.mimeType} · {new Date(file.createdAt).toLocaleString()}</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[70vh] place-items-center overflow-hidden rounded-lg bg-muted">
              {failed ? (
                <div className="p-12 text-center text-sm text-muted-foreground"><FileQuestion className="mx-auto mb-2 h-10 w-10" />Preview unavailable from gateway</div>
              ) : isVideo(file) ? (
                <video src={gateway.previewUrl(config, file.id)} controls autoPlay crossOrigin={cross} onError={() => setFailed(true)} className="max-h-[70vh] w-full" />
              ) : isImage(file) ? (
                <img src={gateway.previewUrl(config, file.id)} alt={file.name} crossOrigin={cross} onError={() => setFailed(true)} className="max-h-[70vh] object-contain" />
              ) : (
                <div className="p-12 text-sm text-muted-foreground">No preview for this file type</div>
              )}
            </div>
            <DialogFooter>
              <Button asChild><a href={gateway.downloadUrl(config, file.id)} download={file.name}><Download className="h-4 w-4" />Download</a></Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ file, folders, onClose, onSaved }: { file: DriveFile | null; folders: Folder[]; onClose: () => void; onSaved: () => void }) {
  const { config } = useGateway();
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string>("__root");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (file) { setName(file.name); setFolder(file.folderId ?? "__root"); } }, [file]);
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename or move</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!file || !name.trim()) return;
          setSaving(true);
          try {
            await gateway.renameOrMove(config, file.id, { name: name.trim(), folderId: folder === "__root" ? null : folder });
            toast.success("Saved"); onSaved();
          } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
        }}>
          <div className="space-y-1.5"><label htmlFor="fname" className="text-sm font-medium">Name</label><Input id="fname" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} /></div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Folder</span>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger aria-label="Folder"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root">No folder</SelectItem>
                {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewFolderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { config } = useGateway();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setName(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setSaving(true);
          try { await gateway.createFolder(config, name.trim()); toast.success("Folder created"); onCreated(); }
          catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
        }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer 2026" maxLength={100} aria-label="Folder name" />
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>Create</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
