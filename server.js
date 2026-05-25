// Placecraft server: serves the static frontend, syncs the canvas over WebSockets,
// persists state to disk, enforces a per-IP cooldown, and exports .litematic / .png.

const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const { Server: SocketIOServer } = require("socket.io");

const { BLOCKS } = require("./blocks-data");
const { buildLitematic } = require("./litematic");
const { buildTexturedPng, buildThumbnailPng } = require("./png");

const PORT          = parseInt(process.env.PORT || "3000", 10);
const WIDTH         = parseInt(process.env.CANVAS_WIDTH || "128", 10);
const HEIGHT        = parseInt(process.env.CANVAS_HEIGHT || "128", 10);
const COOLDOWN_MS   = parseInt(process.env.COOLDOWN_MS || "30000", 10);
const ADMIN_SECRET  = process.env.ADMIN_SECRET || "";
const DATA_DIR      = path.join(__dirname, "data");
const CANVAS_FILE   = path.join(DATA_DIR, "canvas.bin");
const SAVE_INTERVAL_MS = 5000;

if (BLOCKS.length > 65535) {
  throw new Error(`Palette has ${BLOCKS.length} entries; storage uses 2 bytes per pixel (max 65535).`);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Canvas storage: 2 bytes per pixel (Uint16), value = palette index. Row-major, (0,0) top-left.
let canvas = new Uint16Array(WIDTH * HEIGHT);
let dirty = false;

function canvasBuffer() {
  return Buffer.from(canvas.buffer, canvas.byteOffset, canvas.byteLength);
}

(function loadCanvas() {
  try {
    const buf = fs.readFileSync(CANVAS_FILE);
    const expected = WIDTH * HEIGHT * 2;
    if (buf.length === expected) {
      // Copy bytes into a fresh Uint16Array so the underlying ArrayBuffer is properly aligned.
      const copy = Buffer.alloc(expected);
      buf.copy(copy);
      canvas = new Uint16Array(copy.buffer, copy.byteOffset, WIDTH * HEIGHT);
      console.log(`Loaded canvas from ${CANVAS_FILE}`);
    } else {
      console.warn(
        `Canvas file size ${buf.length} != expected ${expected}; starting blank. ` +
        `(Change CANVAS_WIDTH/CANVAS_HEIGHT to match, or delete the file. The format changed when ` +
        `we added texture support: old 1-byte saves are no longer compatible.)`
      );
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("Could not read canvas file:", e.message);
    console.log("Starting with a blank canvas.");
  }
})();

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(CANVAS_FILE, canvasBuffer(), (err) => {
    if (err) console.error("Failed to save canvas:", err);
  });
}, SAVE_INTERVAL_MS);

// Last-place timestamps by IP for cooldown enforcement.
const lastPlace = new Map();

function getClientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return socket.handshake.address || "unknown";
}

function cooldownRemaining(ip) {
  const last = lastPlace.get(ip);
  if (!last) return 0;
  return Math.max(0, COOLDOWN_MS - (Date.now() - last));
}

// HTTP server / API.
const app = express();
app.set("trust proxy", true);

app.use(express.static(path.join(__dirname, "public"), {
  // atlas.png and blocks-data.json are tightly coupled — they're generated together
  // and the byte offsets in the manifest only line up with the atlas they shipped
  // with. Long-lived caching would mean an old atlas could be paired with a new
  // manifest after rebuild, scrambling every texture. Force revalidation so the
  // browser refetches both whenever the file changes (ETag handles 304 fast path).
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") ||
        filePath.endsWith(".json") ||
        filePath.endsWith(".png") ||
        filePath.endsWith(".css") ||
        filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

app.get("/api/info", (req, res) => {
  res.json({
    width: WIDTH,
    height: HEIGHT,
    cooldownMs: COOLDOWN_MS,
    paletteSize: BLOCKS.length,
  });
});

app.get("/api/snapshot", (req, res) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.send(canvasBuffer());
});

app.get("/export.litematic", (req, res) => {
  try {
    const buf = buildLitematic({
      indices: canvas,
      width: WIDTH,
      height: HEIGHT,
      name: "Placecraft Canvas",
      author: "placecraft",
      description: `Collaborative canvas (${WIDTH}x${HEIGHT}) — built on placecraft.`,
    });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="placecraft.litematic"`);
    res.send(buf);
  } catch (e) {
    console.error("litematic export error:", e);
    res.status(500).send("Export failed: " + e.message);
  }
});

// Full-resolution textured PNG: each block rendered as its actual 16x16 texture.
app.get("/export.png", (req, res) => {
  try {
    const buf = buildTexturedPng(canvas, WIDTH, HEIGHT);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="placecraft.png"`);
    res.send(buf);
  } catch (e) {
    console.error("png export error:", e);
    res.status(500).send("Export failed: " + e.message);
  }
});

// Small color-thumbnail PNG: 1 pixel per block. Useful for previews/social cards.
app.get("/export-thumb.png", (req, res) => {
  try {
    const buf = buildThumbnailPng(canvas, WIDTH, HEIGHT);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="placecraft-thumb.png"`);
    res.send(buf);
  } catch (e) {
    console.error("thumbnail export error:", e);
    res.status(500).send("Export failed: " + e.message);
  }
});

app.post("/api/admin/clear", express.json(), (req, res) => {
  if (!ADMIN_SECRET) return res.status(403).send("ADMIN_SECRET not configured.");
  const provided = req.headers["x-admin-secret"] || req.body?.secret;
  if (provided !== ADMIN_SECRET) return res.status(403).send("Bad secret.");
  canvas.fill(0);
  dirty = true;
  io.emit("clear");
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" }, // canvas is public anyway; no auth surface to protect
  maxHttpBufferSize: 1024 * 1024,
});

io.on("connection", (socket) => {
  const ip = getClientIp(socket);

  socket.emit("init", {
    width: WIDTH,
    height: HEIGHT,
    cooldownMs: COOLDOWN_MS,
    paletteSize: BLOCKS.length,
    remainingCooldown: cooldownRemaining(ip),
    snapshot: canvasBuffer(),
  });

  socket.on("place", (msg, ack) => {
    if (!msg || typeof msg !== "object") {
      ack?.({ ok: false, reason: "bad_request" });
      return;
    }
    const x = msg.x | 0;
    const y = msg.y | 0;
    const blockIndex = msg.blockIndex | 0;

    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
      ack?.({ ok: false, reason: "out_of_bounds" });
      return;
    }
    if (blockIndex < 0 || blockIndex >= BLOCKS.length) {
      ack?.({ ok: false, reason: "bad_block" });
      return;
    }

    const remaining = cooldownRemaining(ip);
    if (remaining > 0) {
      ack?.({ ok: false, reason: "cooldown", remaining });
      return;
    }

    const idx = y * WIDTH + x;
    if (canvas[idx] === blockIndex) {
      // No-op placement still costs a cooldown to prevent rapid spam-clicking probes.
      lastPlace.set(ip, Date.now());
      ack?.({ ok: true, cooldownMs: COOLDOWN_MS, noop: true });
      return;
    }

    canvas[idx] = blockIndex;
    dirty = true;
    lastPlace.set(ip, Date.now());

    io.emit("placed", { x, y, b: blockIndex });
    ack?.({ ok: true, cooldownMs: COOLDOWN_MS });
  });
});

// Periodically prune the cooldown map so it doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MS * 2;
  for (const [ip, ts] of lastPlace) {
    if (ts < cutoff) lastPlace.delete(ip);
  }
}, 60_000);

// Graceful shutdown — flush the canvas on Ctrl-C / SIGTERM.
function flushAndExit(code) {
  try {
    fs.writeFileSync(CANVAS_FILE, canvasBuffer());
  } catch (e) {
    console.error("Final save failed:", e);
  }
  process.exit(code);
}
process.on("SIGINT",  () => flushAndExit(0));
process.on("SIGTERM", () => flushAndExit(0));

server.listen(PORT, () => {
  console.log(`Placecraft server listening on http://localhost:${PORT}`);
  console.log(`Canvas: ${WIDTH}x${HEIGHT}, cooldown: ${COOLDOWN_MS}ms, palette: ${BLOCKS.length} blocks`);
  if (!ADMIN_SECRET) console.log("(set ADMIN_SECRET env var to enable /api/admin/clear)");
});
