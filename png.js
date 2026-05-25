// Minimal PNG writer + texture-composited PNG export.
// Uses pngjs to read the atlas (the build-textures script already wrote it), then
// composites the actual 16x16 block textures into the output for a true preview.
// For the lighter color-thumbnail export, use buildThumbnailPng().

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { PNG } = require("pngjs");
const { BLOCKS, TILE_SIZE, ATLAS_WIDTH, ATLAS_HEIGHT } = require("./blocks-data");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function writePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * rowBytes, rowBytes)
      .copy(raw, y * (rowBytes + 1) + 1);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- Atlas (loaded once) ---
let atlas = null;
function loadAtlas() {
  if (atlas) return atlas;
  const p = path.join(__dirname, "public", "atlas.png");
  if (!fs.existsSync(p)) {
    throw new Error("public/atlas.png not found. Run scripts/build-textures.js first.");
  }
  const png = PNG.sync.read(fs.readFileSync(p));
  if (png.width !== ATLAS_WIDTH || png.height !== ATLAS_HEIGHT) {
    throw new Error(`atlas.png size mismatch: file ${png.width}x${png.height}, manifest ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
  }
  atlas = { width: png.width, height: png.height, data: png.data };
  return atlas;
}

// Composite a full-resolution texture PNG of the canvas (W*16 by H*16).
function buildTexturedPng(indices, width, height) {
  const A = loadAtlas();
  const outW = width * TILE_SIZE;
  const outH = height * TILE_SIZE;
  const out = new Uint8Array(outW * outH * 4);
  // Default to transparent (out is already zero-filled).

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = indices[py * width + px];
      const block = BLOCKS[idx];
      if (!block || block.a === 0 && block.id === "minecraft:air") continue;

      const srcX = block.atlasX;
      const srcY = block.atlasY;
      const dstX = px * TILE_SIZE;
      const dstY = py * TILE_SIZE;

      for (let y = 0; y < TILE_SIZE; y++) {
        const srcRow = ((srcY + y) * A.width + srcX) * 4;
        const dstRow = ((dstY + y) * outW + dstX) * 4;
        for (let i = 0; i < TILE_SIZE * 4; i++) {
          out[dstRow + i] = A.data[srcRow + i];
        }
      }
    }
  }
  return writePng(outW, outH, out);
}

// Color-thumbnail PNG: 1 pixel per block using the precomputed average color.
function buildThumbnailPng(indices, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const block = BLOCKS[indices[i]] || BLOCKS[0];
    const o = i * 4;
    out[o]     = block.r;
    out[o + 1] = block.g;
    out[o + 2] = block.b;
    out[o + 3] = block.a;
  }
  return writePng(width, height, out);
}

module.exports = { writePng, buildTexturedPng, buildThumbnailPng };
