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
const MAX_PER_BLOCK = parseInt(process.env.MAX_PER_BLOCK || "3", 10);
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

// Palette fingerprint — hash of all block IDs in order. Any change here (removed
// block, reordered list, new MC version with extra blocks) shifts existing palette
// indices, so we refuse to load a canvas that was saved against a different palette.
const PALETTE_FINGERPRINT = (() => {
  let h = 2166136261 >>> 0;
  for (const b of BLOCKS) {
    for (let i = 0; i < b.id.length; i++) {
      h = Math.imul(h ^ b.id.charCodeAt(i), 16777619) >>> 0;
    }
    h = Math.imul(h ^ 0x7c, 16777619) >>> 0; // separator
  }
  return h >>> 0;
})();
const FINGERPRINT_FILE = path.join(DATA_DIR, "palette.fingerprint");

function canvasBuffer() {
  return Buffer.from(canvas.buffer, canvas.byteOffset, canvas.byteLength);
}

(function loadCanvas() {
  try {
    let savedFp = null;
    try { savedFp = fs.readFileSync(FINGERPRINT_FILE, "utf8").trim(); } catch (_) {}
    if (savedFp !== null && savedFp !== String(PALETTE_FINGERPRINT)) {
      console.warn(
        `Palette fingerprint changed (saved=${savedFp}, current=${PALETTE_FINGERPRINT}). ` +
        `Discarding canvas to avoid misrendering with shifted indices.`
      );
      try { fs.unlinkSync(CANVAS_FILE); } catch (_) {}
    }
    const buf = fs.readFileSync(CANVAS_FILE);
    const expected = WIDTH * HEIGHT * 2;
    if (buf.length === expected) {
      const copy = Buffer.alloc(expected);
      buf.copy(copy);
      canvas = new Uint16Array(copy.buffer, copy.byteOffset, WIDTH * HEIGHT);
      console.log(`Loaded canvas from ${CANVAS_FILE}`);
    } else {
      console.warn(
        `Canvas file size ${buf.length} != expected ${expected}; starting blank.`
      );
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("Could not read canvas file:", e.message);
    console.log("Starting with a blank canvas.");
  }
  // Always write the current fingerprint so the next start can compare.
  try { fs.writeFileSync(FINGERPRINT_FILE, String(PALETTE_FINGERPRINT)); } catch (_) {}
})();

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(CANVAS_FILE, canvasBuffer(), (err) => {
    if (err) console.error("Failed to save canvas:", err);
  });
}, SAVE_INTERVAL_MS);

// Per-block placement counts (palette index → number currently on canvas).
// Index 0 (air) is unbounded — erasing is always free. Everything else is capped
// at MAX_PER_BLOCK to keep one block from dominating the canvas.
const blockCounts = new Uint32Array(BLOCKS.length);
function recountFromCanvas() {
  blockCounts.fill(0);
  for (let i = 0; i < canvas.length; i++) blockCounts[canvas[i]]++;
}
recountFromCanvas();

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
    maxPerBlock: MAX_PER_BLOCK,
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
  recountFromCanvas();
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
    maxPerBlock: MAX_PER_BLOCK,
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
    const prev = canvas[idx];

    if (prev === blockIndex) {
      // No-op placement still costs a cooldown to prevent rapid spam-clicking probes.
      lastPlace.set(ip, Date.now());
      ack?.({ ok: true, cooldownMs: COOLDOWN_MS, noop: true });
      return;
    }

    // Max-per-block rule. Air (index 0) is exempt — erasing is always allowed.
    // Replacing an existing block of THIS type with itself was already handled above,
    // so we only need to compare against the cap for non-air new blocks.
    if (blockIndex !== 0 && blockCounts[blockIndex] >= MAX_PER_BLOCK) {
      ack?.({
        ok: false,
        reason: "block_limit",
        max: MAX_PER_BLOCK,
        current: blockCounts[blockIndex],
      });
      return;
    }

    canvas[idx] = blockIndex;
    blockCounts[prev]--;
    blockCounts[blockIndex]++;
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
