// Auto-discover every placeable block from the Minecraft jar's blockstates/.
// For each ID, picks a single 16x16 texture file that's visually representative,
// and assigns it to a sensible category. Blocks that don't fit pixel-art use
// (water/lava, fire, command/jigsaw, beds, mob heads, multi-piece entity blocks)
// are filtered out.
//
// Returns: { discovered: [{ id, texture, name, group }], skipped: [id...] }
//
// Usage: const { autoDiscoverBlocks } = require('./discover-blocks');
//        const { discovered, skipped } = autoDiscoverBlocks(allIds, allTextures, alreadyIncludedIds);

const pretty = (s) =>
  s.replace(/^minecraft:/, "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

// Blocks to never include — purely functional, invisible, or with no usable texture file.
const HARD_SKIP = new Set([
  // Empty/invisible
  "air", "cave_air", "void_air", "barrier", "light", "structure_void",
  // Internal block states / continuations
  "piston_head", "moving_piston",
  "attached_melon_stem", "attached_pumpkin_stem",
  "pumpkin_stem", "melon_stem",          // empty stem (use crop stages instead — skipped)
  "kelp_plant", "twisting_vines_plant", "weeping_vines_plant", "cave_vines_plant",
  "big_dripleaf_stem",
  "bamboo_sapling",                       // visually identical to bamboo stage 0
  "tall_seagrass",                        // top half
  "tripwire", "redstone_wire",            // line/dot dynamic, not a single 16x16
  "frosted_ice",                          // only formed under specific conditions
  // Liquids & fire — never makes sense as pixel art on a flat wall
  "water", "lava", "bubble_column",
  "fire", "soul_fire",
  // Cauldron variants (just the filled forms)
  "water_cauldron", "lava_cauldron", "powder_snow_cauldron",
  // Portals
  "nether_portal", "end_portal", "end_gateway",
  // Mob spawners that use entity textures
  // (regular spawner kept — has a placeholder texture)
  // Heads/skulls use entity model textures
  "skeleton_skull", "skeleton_wall_skull",
  "wither_skeleton_skull", "wither_skeleton_wall_skull",
  "zombie_head", "zombie_wall_head",
  "player_head", "player_wall_head",
  "creeper_head", "creeper_wall_head",
  "dragon_head", "dragon_wall_head",
  "piglin_head", "piglin_wall_head",
  // Beds — entity textures
  // (skipped programmatically below since they all match *_bed)
  // Candle cakes — niche
  // (skipped programmatically)
  // Chests — entity textures (kept with planks fallback below? no, skip)
  "chest", "trapped_chest", "ender_chest",
  // End portal frame
  // (kept — has a top texture)
  // Jigsaw + command blocks — functional
  "jigsaw",
  // Banner pattern items not placeable
  // (banners themselves are kept)
]);

// Block id → texture file name override. Used when the default heuristic doesn't pick the right face.
const TEXTURE_OVERRIDE = {
  // Functional / multi-face blocks — pick iconic face
  crafting_table:        "crafting_table_top",
  enchanting_table:      "enchanting_table_top",
  beacon:                "beacon",
  conduit:               "conduit",
  hopper:                "hopper_inside",
  piston:                "piston_top",
  sticky_piston:         "piston_top_sticky",
  daylight_detector:     "daylight_detector_top",
  daylight_detector_inverted: "daylight_detector_inverted_top",
  cauldron:              "cauldron_top",
  brewing_stand:         "brewing_stand_base",
  composter:             "composter_top",
  spawner:               "spawner",
  trial_spawner:         "trial_spawner_top_inactive",
  vault:                 "vault_top",
  lectern:               "lectern_sides",
  lodestone:             "lodestone_top",
  respawn_anchor:        "respawn_anchor_top",
  loom:                  "loom_top",
  cartography_table:     "cartography_table_top",
  smithing_table:        "smithing_table_top",
  fletching_table:       "fletching_table_top",
  stonecutter:           "stonecutter_top",
  bell:                  "bell_bottom",
  grindstone:            "grindstone_round",
  end_portal_frame:      "end_portal_frame_top",
  beehive:               "beehive_side",
  bee_nest:              "bee_nest_side",
  campfire:              "campfire_log_lit",
  soul_campfire:         "soul_campfire_log_lit",
  lightning_rod:         "lightning_rod",
  sculk_sensor:          "sculk_sensor_top",
  calibrated_sculk_sensor: "calibrated_sculk_sensor_top",
  sculk_shrieker:        "sculk_shrieker_top",
  sculk_catalyst:        "sculk_catalyst_top",
  tnt:                   "tnt_side",
  cake:                  "cake_side",
  decorated_pot:         "decorated_pot_side",
  flower_pot:            "flower_pot",
  creaking_heart:        "creaking_heart",
  pointed_dripstone:     "pointed_dripstone_up_tip",
  amethyst_cluster:      "amethyst_cluster",
  small_amethyst_bud:    "small_amethyst_bud",
  medium_amethyst_bud:   "medium_amethyst_bud",
  large_amethyst_bud:    "large_amethyst_bud",
  reinforced_deepslate:  "reinforced_deepslate_top",
  // Plants
  cactus:                "cactus_side",
  bamboo:                "bamboo_stage0",
  sugar_cane:            "sugar_cane",
  cocoa:                 "cocoa_stage2",
  azalea:                "azalea_side",
  flowering_azalea:      "flowering_azalea_side",
  big_dripleaf:          "big_dripleaf_top",
  small_dripleaf:        "small_dripleaf_top",
  mangrove_roots:        "mangrove_roots_side",
  short_grass:           "short_grass",
  // Crops
  wheat:                 "wheat_stage7",
  carrots:               "carrots_stage3",
  potatoes:              "potatoes_stage3",
  beetroots:             "beetroots_stage3",
  nether_wart:           "nether_wart_stage2",
  sweet_berry_bush:      "sweet_berry_bush_stage3",
  pitcher_crop:          "pitcher_crop_top_stage_4",
  torchflower_crop:      "torchflower_crop_stage1",
  // Lights
  torch:                 "torch",
  wall_torch:            "torch",
  soul_torch:            "soul_torch",
  soul_wall_torch:       "soul_torch",
  redstone_torch:        "redstone_torch",
  redstone_wall_torch:   "redstone_torch",
  lantern:               "lantern",
  soul_lantern:          "soul_lantern",
  end_rod:               "end_rod",
  // Pressure plate special cases
  light_weighted_pressure_plate: "gold_block",
  heavy_weighted_pressure_plate: "iron_block",
  stone_pressure_plate: "stone",
  polished_blackstone_pressure_plate: "polished_blackstone",
  // Buttons special cases
  stone_button:          "stone",
  polished_blackstone_button: "polished_blackstone",
  // Bars / hooks
  iron_bars:             "iron_bars",
  chain:                 "chain",
  tripwire_hook:         "tripwire_hook",
  // Eggs
  turtle_egg:            "turtle_egg",
  sniffer_egg:           "sniffer_egg_not_cracked_top",
  dragon_egg:            "dragon_egg",
  frogspawn:             "frogspawn",
  // Snow / cobweb
  snow:                  "snow",
  powder_snow:           "powder_snow",
  cobweb:                "cobweb",
  // Sea pickle
  sea_pickle:            "sea_pickle",
  // Glow lichen / vines
  glow_lichen:           "glow_lichen",
  sculk_vein:            "sculk_vein",
  vine:                  "vine",
  weeping_vines:         "weeping_vines",
  twisting_vines:        "twisting_vines",
  cave_vines:            "cave_vines_plant",
  hanging_roots:         "hanging_roots",
  pale_hanging_moss:     "pale_hanging_moss_tip",
  // Pink petals & friends (1.20+)
  pink_petals:           "pink_petals",
  leaf_litter:           "leaf_litter",
  wildflowers:           "wildflowers",
  firefly_bush:          "firefly_bush",
  bush:                  "bush",
  short_dry_grass:       "short_dry_grass",
  tall_dry_grass:        "tall_dry_grass",
  // Eyeblossoms (1.21.4+)
  closed_eyeblossom:     "closed_eyeblossom",
  open_eyeblossom:       "open_eyeblossom",
  // Scaffolding
  scaffolding:           "scaffolding_side",
  // Muddy mangrove roots
  muddy_mangrove_roots:  "muddy_mangrove_roots_side",
  // Pitcher plant (no dedicated block texture — use crop variant)
  pitcher_plant:         "pitcher_crop_top",
  // Copper bulb (all 4 oxidation states; default off variant)
  copper_bulb:           "copper_bulb",
  exposed_copper_bulb:   "exposed_copper_bulb",
  weathered_copper_bulb: "weathered_copper_bulb",
  oxidized_copper_bulb:  "oxidized_copper_bulb",
  // Quartz stairs/slabs (no plain "quartz" texture exists — use the side face)
  quartz_stairs:         "quartz_block_side",
  quartz_slab:           "quartz_block_side",
  smooth_quartz_stairs:  "quartz_block_bottom",
  smooth_quartz_slab:    "quartz_block_bottom",
  smooth_sandstone_stairs: "sandstone_top",
  smooth_sandstone_slab:   "sandstone_top",
  smooth_red_sandstone_stairs: "red_sandstone_top",
  smooth_red_sandstone_slab:   "red_sandstone_top",
  smooth_stone_slab:     "smooth_stone",
  // Command block variants (use command_block_back like the curated one)
  chain_command_block:     "command_block_back",
  repeating_command_block: "command_block_back",
  // Dried ghast (skip — entity, multi-face animated)
  // Tall flowers — bottom half is the iconic image
  sunflower:             "sunflower_bottom",
  lilac:                 "lilac_bottom",
  rose_bush:             "rose_bush_bottom",
  peony:                 "peony_bottom",
  pitcher_plant:         "pitcher_plant_bottom",
  // Tall grass / large fern — use bottom too
  tall_grass:            "tall_grass_bottom",
  large_fern:            "large_fern_bottom",
  // Seagrass
  seagrass:              "seagrass",
  kelp:                  "kelp",
  // Coral plants (small, not the block)
  tube_coral:            "tube_coral",
  brain_coral:           "brain_coral",
  bubble_coral:          "bubble_coral",
  fire_coral:            "fire_coral",
  horn_coral:            "horn_coral",
  dead_tube_coral:       "dead_tube_coral",
  dead_brain_coral:      "dead_brain_coral",
  dead_bubble_coral:     "dead_bubble_coral",
  dead_fire_coral:       "dead_fire_coral",
  dead_horn_coral:       "dead_horn_coral",
  // Rails
  rail:                  "rail",
  powered_rail:          "powered_rail_on",
  detector_rail:         "detector_rail_on",
  activator_rail:        "activator_rail_on",
  // Lily pad
  lily_pad:              "lily_pad",
  // Banners use wool texture
  // (handled in code below)
  // Carpets
  moss_carpet:           "moss_block",
  pale_moss_carpet:      "pale_moss_block",
};

// Block id → group name override. Default groups are derived from suffix.
const GROUP_OVERRIDE = {};

// Returns null if no texture could be found.
function findBaseTexture(base, textures) {
  if (textures.has(base)) return base;
  if (textures.has(base + "s")) return base + "s";                  // brick → bricks
  if (textures.has(base + "_planks")) return base + "_planks";      // wood types → planks
  if (textures.has(base + "_block")) return base + "_block";        // honey → honey_block etc.
  return null;
}

function categorize(id, textures) {
  if (HARD_SKIP.has(id)) return null;
  if (TEXTURE_OVERRIDE[id]) {
    const tex = TEXTURE_OVERRIDE[id];
    if (!textures.has(tex)) return null;
    return { texture: tex, group: pickGroup(id) };
  }

  // Waxed copper variants are visually identical to their unwaxed counterparts —
  // strip the `waxed_` prefix and reuse that categorization.
  if (id.startsWith("waxed_")) {
    const unwaxed = id.slice("waxed_".length);
    const inner = categorize(unwaxed, textures);
    if (inner) return { texture: inner.texture, group: "Copper" };
    return null;
  }

  // Suffix-based mapping. Each branch returns { texture, group } or null to skip.

  // Stairs / slabs / walls — use the base material's texture
  for (const [suffix, group] of [["_stairs", "Stairs"], ["_slab", "Slabs"], ["_wall", "Walls"]]) {
    if (id.endsWith(suffix) && id !== suffix.slice(1) && !id.endsWith("_wall_sign") && !id.endsWith("_wall_hanging_sign") && !id.endsWith("_wall_banner") && !id.endsWith("_wall_torch") && !id.endsWith("_wall_head") && !id.endsWith("_wall_skull") && !id.endsWith("_wall_fan")) {
      const base = id.slice(0, -suffix.length);
      const tex = findBaseTexture(base, textures);
      return tex ? { texture: tex, group } : null;
    }
  }

  // Wall variants — skip (use the non-wall sibling)
  if (id.endsWith("_wall_sign")        ||
      id.endsWith("_wall_hanging_sign") ||
      id.endsWith("_wall_banner")) {
    return null;
  }

  // Doors / trapdoors
  if (id.endsWith("_door") && id !== "door") {
    const base = id.slice(0, -"_door".length);
    const tex = `${base}_door_bottom`;
    return textures.has(tex) ? { texture: tex, group: "Doors" } : null;
  }
  if (id.endsWith("_trapdoor")) {
    return textures.has(id) ? { texture: id, group: "Doors" } : null;
  }

  // Fences and gates
  if (id.endsWith("_fence")) {
    const base = id.slice(0, -"_fence".length);
    const tex = findBaseTexture(base, textures);
    return tex ? { texture: tex, group: "Fences" } : null;
  }
  if (id.endsWith("_fence_gate")) {
    const base = id.slice(0, -"_fence_gate".length);
    const tex = findBaseTexture(base, textures);
    return tex ? { texture: tex, group: "Fences" } : null;
  }

  // Buttons / pressure plates
  if (id.endsWith("_button")) {
    const base = id.slice(0, -"_button".length);
    const tex = findBaseTexture(base, textures);
    return tex ? { texture: tex, group: "Buttons & Plates" } : null;
  }
  if (id.endsWith("_pressure_plate")) {
    const base = id.slice(0, -"_pressure_plate".length);
    const tex = findBaseTexture(base, textures);
    return tex ? { texture: tex, group: "Buttons & Plates" } : null;
  }

  // Signs / hanging signs (skip wall-mounted variants — same texture as the freestanding sign)
  if (id.endsWith("_sign") || id.endsWith("_hanging_sign")) {
    const base = id.replace(/(_hanging)?_sign$/, "");
    const tex = findBaseTexture(base, textures);
    return tex ? { texture: tex, group: "Signs" } : null;
  }
  // Shelves (1.21.x)
  if (id.endsWith("_shelf")) {
    const base = id.slice(0, -"_shelf".length);
    const tex = textures.has(`${base}_planks`) ? `${base}_planks` : base;
    return textures.has(tex) ? { texture: tex, group: "Decoration" } : null;
  }

  // Carpets
  if (id.endsWith("_carpet")) {
    const color = id.slice(0, -"_carpet".length);
    const tex = textures.has(`${color}_wool`) ? `${color}_wool` : id;
    return textures.has(tex) ? { texture: tex, group: "Carpets" } : null;
  }

  // Banners (wall banners already skipped above)
  if (id.endsWith("_banner")) {
    const color = id.slice(0, -"_banner".length);
    const tex = `${color}_wool`;
    return textures.has(tex) ? { texture: tex, group: "Banners" } : null;
  }

  // Beds — skip (entity model textures, not block textures)
  if (id.endsWith("_bed")) return null;

  // Glass panes
  if (id === "glass_pane") {
    return textures.has("glass") ? { texture: "glass", group: "Glass Panes" } : null;
  }
  if (id.endsWith("_stained_glass_pane")) {
    const color = id.slice(0, -"_stained_glass_pane".length);
    const tex = `${color}_stained_glass`;
    return textures.has(tex) ? { texture: tex, group: "Glass Panes" } : null;
  }

  // Candles
  if (id === "candle") {
    return textures.has("candle") ? { texture: "candle", group: "Lights" } : null;
  }
  if (id.endsWith("_candle") && !id.endsWith("_candle_cake")) {
    return textures.has(id) ? { texture: id, group: "Lights" } : null;
  }
  if (id.endsWith("_candle_cake")) return null;  // niche

  // Shulker boxes — textures are `<color>_shulker_box`, not `shulker_box_<color>`.
  if (id === "shulker_box") {
    return textures.has("shulker_box") ? { texture: "shulker_box", group: "Shulker Boxes" } : null;
  }
  if (id.endsWith("_shulker_box")) {
    return textures.has(id) ? { texture: id, group: "Shulker Boxes" } : null;
  }

  // Coral fans
  if (id.endsWith("_coral_fan")) {
    return textures.has(id) ? { texture: id, group: "Coral" } : null;
  }
  if (id.endsWith("_coral_wall_fan")) return null;  // same texture as fan

  // Anvils (3 damage levels)
  if (id === "anvil")          return textures.has("anvil")          ? { texture: "anvil",          group: "Decoration" } : null;
  if (id === "chipped_anvil")  return textures.has("chipped_anvil_top")  ? { texture: "chipped_anvil_top",  group: "Decoration" } : null;
  if (id === "damaged_anvil")  return textures.has("damaged_anvil_top")  ? { texture: "damaged_anvil_top",  group: "Decoration" } : null;

  // Default: if a texture with the same name exists, use it. Group falls back to
  // pickGroup (flowers/plants/lights/etc. all live there) and finally "Decoration".
  if (textures.has(id)) return { texture: id, group: pickGroup(id) };
  return null;
}

function pickGroup(id) {
  // Fallback group for blocks resolved via TEXTURE_OVERRIDE
  if (GROUP_OVERRIDE[id]) return GROUP_OVERRIDE[id];

  // Plants / nature
  const PLANT_IDS = new Set([
    "cactus","bamboo","sugar_cane","cocoa","azalea","flowering_azalea",
    "big_dripleaf","small_dripleaf","mangrove_roots","short_grass","tall_grass",
    "fern","large_fern","dead_bush","seagrass","kelp","lily_pad",
    "spore_blossom","vine","glow_lichen","sculk_vein",
    "weeping_vines","twisting_vines","cave_vines","hanging_roots","pale_hanging_moss",
    "pink_petals","leaf_litter","wildflowers","firefly_bush","bush",
    "short_dry_grass","tall_dry_grass","red_mushroom","brown_mushroom",
    "crimson_fungus","warped_fungus","crimson_roots","warped_roots","nether_sprouts",
  ]);
  if (PLANT_IDS.has(id)) return "Plants";

  // Flowers
  const FLOWERS = new Set([
    "poppy","dandelion","blue_orchid","allium","azure_bluet",
    "red_tulip","orange_tulip","white_tulip","pink_tulip",
    "oxeye_daisy","cornflower","lily_of_the_valley","wither_rose",
    "sunflower","lilac","rose_bush","peony",
    "torchflower","pitcher_plant","closed_eyeblossom","open_eyeblossom",
  ]);
  if (FLOWERS.has(id)) return "Flowers";

  // Crops
  if (["wheat","carrots","potatoes","beetroots","nether_wart","sweet_berry_bush","pitcher_crop","torchflower_crop"].includes(id)) {
    return "Plants";
  }

  // Saplings
  if (id.endsWith("_sapling") || id === "mangrove_propagule") return "Saplings";

  // Lights
  if (["torch","wall_torch","soul_torch","soul_wall_torch","redstone_torch","redstone_wall_torch",
       "lantern","soul_lantern","end_rod","sea_pickle"].includes(id)) return "Lights";

  // Rails
  if (id.endsWith("_rail") || id === "rail") return "Rails";

  // Coral small plants
  if ((id.endsWith("_coral") || id.startsWith("dead_") && id.endsWith("_coral"))) return "Coral";

  // Functional / decorative defaults
  return "Decoration";
}

function autoDiscoverBlocks(allIds, allTextures, alreadyIncluded) {
  const discovered = [];
  const skipped = [];
  const alreadySet = new Set();
  for (const x of alreadyIncluded) alreadySet.add(x.replace(/^minecraft:/, ""));

  for (const id of allIds) {
    if (alreadySet.has(id)) continue;
    const cat = categorize(id, allTextures);
    if (!cat) { skipped.push(id); continue; }
    discovered.push({
      id: "minecraft:" + id,
      texture: cat.texture,
      name: pretty(id),
      group: cat.group,
    });
  }
  return { discovered, skipped };
}

module.exports = { autoDiscoverBlocks };
