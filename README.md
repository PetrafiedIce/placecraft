# Placecraft

A real-time collaborative pixel canvas in the spirit of r/place, where every "pixel" is a Minecraft block. When the canvas looks good, download it as a `.litematic` file and paste it into your Minecraft world with the [Litematica](https://www.curseforge.com/minecraft/mc-mods/litematica) mod.

- 128 × 128 canvas (configurable)
- ~80 building blocks across stone, wood, wool, concrete, and specialty categories
- 30-second per-IP cooldown between placements
- Live updates over WebSockets (Socket.IO)
- Exports as `.litematic` (Litematica) and `.png` (visual reference)

---

## Run it locally

```sh
cd placecraft
npm install
npm start
```

Open <http://localhost:3000>.

The canvas state is persisted to `data/canvas.bin` and survives restarts.

### Share with friends without deploying

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/) or [ngrok](https://ngrok.com/), then:

```sh
# Cloudflare Tunnel (no account needed)
cloudflared tunnel --url http://localhost:3000

# or ngrok (free account needed)
ngrok http 3000
```

It will print a public `https://*.trycloudflare.com` (or `*.ngrok-free.app`) URL anyone can use.

---

## Configuration (env vars)

| Variable         | Default | Description                                        |
| ---------------- | ------- | -------------------------------------------------- |
| `PORT`           | `3000`  | HTTP port                                          |
| `CANVAS_WIDTH`   | `128`   | Canvas width in blocks                             |
| `CANVAS_HEIGHT`  | `128`   | Canvas height in blocks                            |
| `COOLDOWN_MS`    | `30000` | Cooldown between placements per IP, milliseconds   |
| `ADMIN_SECRET`   | *(off)* | If set, enables `POST /api/admin/clear` with this  |

Changing the canvas size will refuse to load the old `data/canvas.bin` (it falls back to a blank canvas). Delete the file or back it up before resizing.

**Clearing the canvas:**

```sh
curl -X POST -H "x-admin-secret: yoursecret" https://your-host/api/admin/clear
```

---

## Deploy to a free host

### Render

1. Push this folder to a GitHub repo.
2. Create a **Web Service** at <https://render.com>, point it at your repo.
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add env vars if you want non-defaults (e.g., `ADMIN_SECRET`).
6. *(Optional, for state persistence across restarts)* Add a **Persistent Disk** mounted at `/opt/render/project/src/data`. Without this, Render's free tier loses canvas state on every redeploy / sleep wake.

### Fly.io

```sh
fly launch                 # answer prompts; uses included Dockerfile
fly volumes create placecraft_data --size 1 --region <your-region>
# Edit fly.toml to mount the volume at /app/data:
#   [mounts]
#     source = "placecraft_data"
#     destination = "/app/data"
fly deploy
```

### Railway

1. Create a project from this repo at <https://railway.app>.
2. Railway auto-detects Node and runs `npm start`.
3. Add a Volume mounted at `/app/data` so canvas state persists.
4. Set env vars in the dashboard if needed.

### Anywhere else

The app is a plain Node/Express server. Any host that runs Node 18+ and supports WebSockets works. WebSocket support is the only gotcha — some serverless / function platforms (Vercel, Netlify Functions) don't keep long-lived connections, so they won't work for this app.

---

## Putting the canvas into Minecraft

1. From the running site, click **↓ .litematic** to download `placecraft.litematic`.
2. Install [Litematica](https://www.curseforge.com/minecraft/mc-mods/litematica) (and its dependency [MaLiLib](https://www.curseforge.com/minecraft/mc-mods/malilib)) for your Minecraft version. *Fabric on 1.21.x is what this project's parent mod targets.*
3. Drop `placecraft.litematic` into `<.minecraft>/schematics/`.
4. In-game, open Litematica (default key: `M`), go to **Load schematics**, pick the file, and **Load**.
5. The schematic now follows you as a ghost. Position it (use the **Schematic placement** menu — set rotation, mirror, world position). The canvas becomes a 128×128 vertical wall, with the canvas's top at the top of the wall.
6. To actually build it:
   - **Creative**: enable **Easy Place** in Litematica (default: `M` → *Easy Place mode*). Right-click to place blocks where the ghost shows them. Or in creative single-player, use `//paste` via [WorldEdit](https://www.curseforge.com/minecraft/mc-mods/worldedit) by saving the schematic with `//schem save` after loading — easier: just use Printer (in Litematica's fork, "[Litematica Printer](https://github.com/aleksilassila/litematica-printer)").
   - **Survival**: place blocks against the ghost outline. Litematica highlights wrong blocks in red.

The flat wall is 128 × 128 × 1 — make sure you have room for that.

---

## How the schematic export works

The canvas is a flat `width × height` array of palette indices. On export:

1. The palette is trimmed to the blocks actually used (so unused blocks don't bloat the file).
2. The flat array is laid out as a vertical wall of blocks (`X` right, `Y` up, `Z = 0`).
3. Block indices are bit-packed into a `long[]` using Mojang's post-1.16 format (entries can span longs).
4. The whole thing is wrapped in Litematica's NBT structure and gzipped.

See [`litematic.js`](litematic.js) and [`nbt.js`](nbt.js) for the implementation. They have no external dependencies — pure Node + `zlib`.

---

## Project layout

```
placecraft/
├── server.js           # Express + Socket.IO server
├── litematic.js        # .litematic NBT builder
├── nbt.js              # minimal NBT writer
├── png.js              # minimal PNG writer (snapshot endpoint)
├── package.json
├── Dockerfile
├── Procfile
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js          # frontend: canvas + pan/zoom + palette + socket client
│   └── blocks.js       # shared palette (loaded by server and browser)
└── data/
    └── canvas.bin      # persisted canvas state (created at runtime)
```

---

## Customizing the block palette

Edit [`public/blocks.js`](public/blocks.js). Each entry needs:

```js
{ id: "minecraft:block_id", name: "Display Name", color: "#rrggbb", group: "Category" }
```

Index `0` is always air ("Erase"). Don't reorder existing entries — the palette index is what's stored in the persisted canvas file, so reordering remaps every existing pixel. Append new blocks at the end.

Max palette size is 255 (storage is one byte per pixel).
