// Server-side loader for the generated blocks-data.json (output of scripts/build-textures.js).
// Throws helpfully if the manifest isn't built yet.

const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "public", "blocks-data.json");
if (!fs.existsSync(dataPath)) {
  throw new Error(
    "blocks-data.json not found. Run `node scripts/build-textures.js` first to extract textures from your Minecraft jar."
  );
}
const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));

module.exports = {
  BLOCKS: raw.blocks,
  TILE_SIZE: raw.tileSize,
  ATLAS_WIDTH: raw.atlasWidth,
  ATLAS_HEIGHT: raw.atlasHeight,
};
