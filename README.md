# AcerDrive: Your Private Cloud

Build a new app named "AcerDrive" — a Google Drive-inspired private photo and video library whose actual binary files are stored on the user's own Acer Aspire One D250 running antiX Linux, not in Lovable/Supabase object storage.

Architecture and security:
- Create polished responsive React + TypeScript + Tailwind + shadcn/ui frontend: dashboard, storage usage, drag-and-drop image/video uploads, progress, recent files, grid/list views, search, thumbnails, image/video preview modal, download, rename, delete confirmation, folders/collections, loading/errors/empty states.
- Design as original brand "AcerDrive", modern uncluttered, dark navy/indigo accents, accessible controls, mobile-friendly.
- Do not pretend upload works without the Acer gateway. Do not store files in Supabase Storage or Lovable cloud storage. Provide clear gateway connection status and onboarding.
- Implement typed frontend adapter for self-hosted Acer gateway REST API: GET /api/health; GET /api/files?query=&folder=; POST /api/uploads (multipart file + optional folderId); GET /api/files/:id/preview; GET /api/files/:id/download; PATCH /api/files/:id (name/folderId); DELETE /api/files/:id; GET /api/folders; POST /api/folders; DELETE /api/folders/:id. Use proper errors, credentials policy and upload progress where feasible.
- Settings page: configurable gateway base URL, Test Connection, health/storage info only when actually returned by /api/health, privacy notice; no client-side secrets.
- Add onboarding explaining a small Python FastAPI gateway must be installed on antiX to write uploads to local disk. The UI must say "Gateway not configured" until it can successfully reach /api/health. Files remain local only after gateway is installed.
- Cloud-hosted browsers cannot reach Acer LAN IP from outside the home network. Remote use needs VPN (e.g. Tailscale/WireGuard) or a carefully secured reverse proxy; never advise publicly exposing raw HTTP, SSH, or VNC.
- Media preview using API paths, fallback icons. No fake backend state, fake authentication or claims that URL hiding provides security. Private access is enforced by gateway/VPN.
- Include README/setup panel with antiX gateway deployment instructions and API contract. Avoid requiring cloud database or media storage; use local React state and the Acer API.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8edf0810-8fc8-4b8d-9309-a0e91942bda8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
