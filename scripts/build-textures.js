#!/usr/bin/env node
/* eslint-disable no-console */
// Extract block textures from a Minecraft jar and build:
//   public/atlas.png         — sprite atlas (16x16 tiles in a grid)
//   public/blocks-data.json  — { width, height, tileSize, blocks: [{ id, name, group, atlasX, atlasY, r,g,b,a }] }
//
// Usage:
//   node scripts/build-textures.js                     # auto-find Minecraft jar
//   node scripts/build-textures.js --jar /path/to.jar  # explicit jar
//   node scripts/build-textures.js --version 1.21.4    # specific MC version

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { PNG } = require("pngjs");

const { ALL_BLOCKS } = require("./blocks-master");
const { autoDiscoverBlocks } = require("./discover-blocks");

const TILE = 16;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    argMap[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
  }
}

function findJar() {
  if (argMap.jar) return argMap.jar;
  const appData = process.env.APPDATA || (process.env.HOME && path.join(process.env.HOME, ".minecraft"));
  if (!appData) throw new Error("Could not determine .minecraft location — pass --jar /path/to.jar");
  const mcDir = process.env.APPDATA ? path.join(appData, ".minecraft") : appData;
  const versionsDir = path.join(mcDir, "versions");
  if (!fs.existsSync(versionsDir)) {
    throw new Error(`No .minecraft/versions at ${versionsDir} — install Minecraft or pass --jar`);
  }

  if (argMap.version) {
    const jar = path.join(versionsDir, argMap.version, `${argMap.version}.jar`);
    if (!fs.existsSync(jar)) throw new Error(`No jar at ${jar}`);
    return jar;
  }

  // Pick the highest-numbered release version that has a jar.
  const versions = fs.readdirSync(versionsDir)
    .filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)) // only stable releases like 1.21.4
    .filter((v) => fs.existsSync(path.join(versionsDir, v, `${v}.jar`)))
    .sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da !== db) return db - da; // descending
      }
      return 0;
    });

  if (versions.length === 0) {
    throw new Error("No stable release versions found in .minecraft/versions — pass --jar");
  }
  const v = versions[0];
  return path.join(versionsDir, v, `${v}.jar`);
}

function readJarTexture(zip, name) {
  const entry = zip.getEntry(`assets/minecraft/textures/block/${name}.png`);
  if (!entry) return null;
  return PNG.sync.read(entry.getData());
}

// Read texture, take the first 16x16 frame for animated textures, return RGBA Uint8Array.
function loadTile(zip, name) {
  const png = readJarTexture(zip, name);
  if (!png) return null;
  if (png.width !== TILE) {
    console.warn(`  skipping ${name}: width ${png.width} != ${TILE}`);
    return null;
  }
  const out = new Uint8Array(TILE * TILE * 4);
  // Just take the top 16 rows (handles animated vertical strips automatically).
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const src = (y * png.width + x) * 4;
      const dst = (y * TILE + x) * 4;
      out[dst]     = png.data[src];
      out[dst + 1] = png.data[src + 1];
      out[dst + 2] = png.data[src + 2];
      out[dst + 3] = png.data[src + 3];
    }
  }
  return out;
}

// Premultiply alpha then average — for blocks that have semi-transparent texels (glass, leaves)
// we still want a sensible color thumbnail.
function averageColor(rgba) {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const aa = rgba[i + 3];
    if (aa === 0) continue;
    r += rgba[i]     * aa;
    g += rgba[i + 1] * aa;
    b += rgba[i + 2] * aa;
    a += aa;
    n++;
  }
  if (n === 0 || a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: Math.round(r / a), g: Math.round(g / a), b: Math.round(b / a), a: Math.round(a / n) };
}

function main() {
  const jarPath = findJar();
  console.log(`Using jar: ${jarPath}`);
  const zip = new AdmZip(jarPath);

  // Enumerate every texture and every block ID in the jar.
  const textureSet = new Set();
  const blockIds = [];
  for (const e of zip.getEntries()) {
    if (e.entryName.startsWith("assets/minecraft/textures/block/") && e.entryName.endsWith(".png")) {
      textureSet.add(e.entryName.slice("assets/minecraft/textures/block/".length, -".png".length));
    } else if (e.entryName.startsWith("assets/minecraft/blockstates/") && e.entryName.endsWith(".json")) {
      blockIds.push(e.entryName.slice("assets/minecraft/blockstates/".length, -".json".length));
    }
  }
  blockIds.sort();

  // Build slot 0 = air (eraser), then curated cube blocks, then auto-discovered everything else.
  const blocks = [{ id: "minecraft:air", name: "Erase", group: "Tools", texture: null }];
  blocks.push(...ALL_BLOCKS);

  const alreadyIncluded = blocks.map((b) => b.id);
  const { discovered, skipped } = autoDiscoverBlocks(blockIds, textureSet, alreadyIncluded);
  blocks.push(...discovered);

  console.log(`Curated cube blocks: ${ALL_BLOCKS.length}`);
  console.log(`Auto-discovered:     ${discovered.length}`);
  console.log(`Skipped:             ${skipped.length} (entity-only, internal, liquids, etc.)`);
  console.log(`Total palette:       ${blocks.length}`);

  // Layout atlas: 32 cols. Rows expand as needed.
  const cols = 32;
  const rows = Math.ceil(blocks.length / cols);
  const atlasW = cols * TILE;
  const atlasH = rows * TILE;
  const atlas = new PNG({ width: atlasW, height: atlasH, colorType: 6 });
  atlas.data.fill(0);

  const out = [];
  let placed = 0, missingTextures = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const atlasX = col * TILE;
    const atlasY = row * TILE;

    if (i === 0) {
      // Air slot: leave transparent
      out.push({
        id: block.id, name: block.name, group: block.group,
        atlasX, atlasY, r: 0, g: 0, b: 0, a: 0,
      });
      placed++;
      continue;
    }

    const tile = loadTile(zip, block.texture);
    if (!tile) {
      console.warn(`  MISSING: ${block.id} (${block.texture})`);
      missingTextures++;
      // Still occupy the slot so palette indices stay stable; use a magenta error tile.
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const dst = ((atlasY + y) * atlasW + (atlasX + x)) * 4;
          const checker = ((x >> 2) ^ (y >> 2)) & 1;
          atlas.data[dst]     = checker ? 255 : 0;
          atlas.data[dst + 1] = 0;
          atlas.data[dst + 2] = checker ? 255 : 0;
          atlas.data[dst + 3] = 255;
        }
      }
      out.push({
        id: block.id, name: block.name + " (missing)", group: block.group,
        atlasX, atlasY, r: 255, g: 0, b: 255, a: 255,
      });
      continue;
    }

    // Copy tile into atlas
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const src = (y * TILE + x) * 4;
        const dst = ((atlasY + y) * atlasW + (atlasX + x)) * 4;
        atlas.data[dst]     = tile[src];
        atlas.data[dst + 1] = tile[src + 1];
        atlas.data[dst + 2] = tile[src + 2];
        atlas.data[dst + 3] = tile[src + 3];
      }
    }
    const c = averageColor(tile);
    out.push({
      id: block.id, name: block.name, group: block.group,
      atlasX, atlasY, r: c.r, g: c.g, b: c.b, a: c.a,
    });
    placed++;
  }

  // Write atlas
  const atlasPath = path.join(PUBLIC_DIR, "atlas.png");
  fs.writeFileSync(atlasPath, PNG.sync.write(atlas));
  console.log(`Wrote ${atlasPath} (${atlasW}x${atlasH}, ${placed} placed, ${missingTextures} missing)`);

  // Write manifest
  const manifest = {
    tileSize: TILE,
    atlasWidth: atlasW,
    atlasHeight: atlasH,
    blocks: out,
  };
  const manifestPath = path.join(PUBLIC_DIR, "blocks-data.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`Wrote ${manifestPath} (${out.length} blocks total)`);
}

main();
