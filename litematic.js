// Generate a Litematica .litematic file (gzipped NBT) from a flat 2D canvas of palette indices.
// Layout: canvas becomes a vertical wall of size width x height x 1.
//   - Pixel (px, py) at top-left of canvas maps to block at (x=px, y=height-1-py, z=0)
//   - So the top of the canvas is the top of the wall.

const zlib = require("zlib");
const { nbt, writeNBT, TYPE } = require("./nbt");
const { BLOCKS } = require("./blocks-data");

// Minecraft 1.21 baseline. Litematica is forgiving across versions for vanilla blocks,
// so this works fine even when loaded in 1.21.x newer subversions.
const DEFAULT_DATA_VERSION = 3953;

// Pack a flat array of palette indices into a BigInt long[] using Mojang's modern
// (post-1.16) format where entries can span the boundary between two longs.
function packBlockStates(indices, paletteSize) {
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(Math.max(paletteSize, 1))));
  const totalBits = bitsPerEntry * indices.length;
  const numLongs = Math.ceil(totalBits / 64);
  const longs = new Array(numLongs).fill(0n);
  const bpe = BigInt(bitsPerEntry);
  const mask = (1n << bpe) - 1n;

  for (let i = 0; i < indices.length; i++) {
    const value = BigInt(indices[i]) & mask;
    const startBit = BigInt(i) * bpe;
    const startLong = Number(startBit >> 6n);
    const bitOffset = startBit & 63n;
    const endBit = bitOffset + bpe;

    longs[startLong] |= (value << bitOffset) & 0xffffffffffffffffn;
    if (endBit > 64n) {
      const bitsInSecond = endBit - 64n;
      longs[startLong + 1] |= value >> (bpe - bitsInSecond);
    }
  }

  // Wrap to signed 64-bit for NBT long representation.
  return longs.map((v) => BigInt.asIntN(64, v));
}

/**
 * Build a .litematic Buffer from canvas data.
 *
 * @param {Object} opts
 * @param {Uint8Array|number[]} opts.indices  Flat (width * height) array of palette indices (0 = air).
 * @param {number} opts.width                 Canvas width in pixels (becomes wall X).
 * @param {number} opts.height                Canvas height in pixels (becomes wall Y).
 * @param {string} [opts.name]                Schematic name shown in Litematica.
 * @param {string} [opts.author]              Author string.
 * @param {string} [opts.description]         Description string.
 * @param {number} [opts.dataVersion]         Minecraft DataVersion to embed.
 * @returns {Buffer} gzipped NBT ready to write to disk as .litematic
 */
function buildLitematic({
  indices,
  width,
  height,
  name = "Placecraft Canvas",
  author = "placecraft",
  description = "Collaborative pixel art built on placecraft.",
  dataVersion = DEFAULT_DATA_VERSION,
} = {}) {
  if (!indices || indices.length !== width * height) {
    throw new Error("indices length must equal width * height");
  }

  // Build the trimmed palette: only include blocks actually used, plus air at index 0.
  // Map from source palette index -> trimmed palette index, so the long array uses small numbers.
  const used = new Set([0]); // always include air
  for (const idx of indices) used.add(idx);
  const sortedUsed = Array.from(used).sort((a, b) => a - b);
  const sourceToTrimmed = new Map();
  sortedUsed.forEach((srcIdx, trimmedIdx) => sourceToTrimmed.set(srcIdx, trimmedIdx));

  const paletteEntries = sortedUsed.map((srcIdx) => {
    const block = BLOCKS[srcIdx] || BLOCKS[0];
    return nbt.compound({ Name: nbt.string(block.id) });
  });

  // Iteration order in Litematica regions: y outermost, then z, then x.
  // For our flat wall (sizeZ=1) the block at (x, y, 0) has index y*sizeX + x.
  // Canvas pixel (px, py) maps to block (px, height-1-py, 0) to put canvas-top at wall-top.
  const sizeX = width;
  const sizeY = height;
  const sizeZ = 1;
  const volume = sizeX * sizeY * sizeZ;
  const blockIndices = new Array(volume);
  let totalBlocks = 0;

  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const blockIdx = (y * sizeZ + z) * sizeX + x;
        const py = sizeY - 1 - y;
        const px = x;
        const srcPaletteIdx = indices[py * width + px];
        const trimmedIdx = sourceToTrimmed.get(srcPaletteIdx) ?? 0;
        blockIndices[blockIdx] = trimmedIdx;
        if (trimmedIdx !== 0) totalBlocks++;
      }
    }
  }

  const packed = packBlockStates(blockIndices, paletteEntries.length);

  const now = BigInt(Date.now());

  const root = nbt.compound({
    MinecraftDataVersion: nbt.int(dataVersion),
    Version: nbt.int(6),
    SubVersion: nbt.int(1),
    Metadata: nbt.compound({
      Name: nbt.string(name),
      Author: nbt.string(author),
      Description: nbt.string(description),
      RegionCount: nbt.int(1),
      TimeCreated: nbt.long(now),
      TimeModified: nbt.long(now),
      TotalBlocks: nbt.int(totalBlocks),
      TotalVolume: nbt.int(volume),
      EnclosingSize: nbt.compound({
        x: nbt.int(sizeX),
        y: nbt.int(sizeY),
        z: nbt.int(sizeZ),
      }),
    }),
    Regions: nbt.compound({
      Main: nbt.compound({
        Position: nbt.compound({ x: nbt.int(0), y: nbt.int(0), z: nbt.int(0) }),
        Size:     nbt.compound({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
        BlockStatePalette: nbt.list(TYPE.COMPOUND, paletteEntries),
        BlockStates:       nbt.longArray(packed),
        Entities:          nbt.list(TYPE.COMPOUND, []),
        TileEntities:      nbt.list(TYPE.COMPOUND, []),
        PendingBlockTicks: nbt.list(TYPE.COMPOUND, []),
        PendingFluidTicks: nbt.list(TYPE.COMPOUND, []),
      }),
    }),
  });

  const uncompressed = writeNBT("", root);
  return zlib.gzipSync(uncompressed);
}

module.exports = { buildLitematic, packBlockStates };
