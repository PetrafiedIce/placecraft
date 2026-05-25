// Master list of all "buildable" (full-cube) Minecraft blocks. Each entry maps an
// in-game block ID to the most visually iconic 16x16 texture file inside the
// vanilla jar (assets/minecraft/textures/block/<texture>.png). The order here
// becomes the palette index order at canvas storage time — appending is safe,
// reordering invalidates saved canvases.

const pretty = (s) =>
  s.replace(/^minecraft:/, "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const b = (id, texture, name, group) => ({
  id: id.startsWith("minecraft:") ? id : "minecraft:" + id,
  texture,
  name: name || pretty(id),
  group,
});

// Wood family: planks, log (side), stripped log, wood (uses log side), stripped wood, leaves.
function woodFamily(prefix, opts = {}) {
  const { logTexture = `${prefix}_log`, strippedLogTexture = `stripped_${prefix}_log`, leaves = true } = opts;
  const cap = pretty(prefix);
  const out = [
    b(`${prefix}_planks`,         `${prefix}_planks`,    `${cap} Planks`,   "Wood"),
    b(`${prefix}_log`,            logTexture,            `${cap} Log`,      "Wood"),
    b(`stripped_${prefix}_log`,   strippedLogTexture,    `Stripped ${cap} Log`, "Wood"),
    b(`${prefix}_wood`,           logTexture,            `${cap} Wood`,     "Wood"),
    b(`stripped_${prefix}_wood`,  strippedLogTexture,    `Stripped ${cap} Wood`, "Wood"),
  ];
  if (leaves) out.push(b(`${prefix}_leaves`, `${prefix}_leaves`, `${cap} Leaves`, "Leaves"));
  return out;
}

// Stem family for crimson/warped (nether wood uses "stem" and "hyphae").
function stemFamily(prefix) {
  const cap = pretty(prefix);
  return [
    b(`${prefix}_planks`,         `${prefix}_planks`,         `${cap} Planks`,            "Wood"),
    b(`${prefix}_stem`,           `${prefix}_stem`,           `${cap} Stem`,              "Wood"),
    b(`stripped_${prefix}_stem`,  `stripped_${prefix}_stem`,  `Stripped ${cap} Stem`,     "Wood"),
    b(`${prefix}_hyphae`,         `${prefix}_stem`,           `${cap} Hyphae`,            "Wood"),
    b(`stripped_${prefix}_hyphae`,`stripped_${prefix}_stem`,  `Stripped ${cap} Hyphae`,   "Wood"),
  ];
}

// 16-color block sets: wool, concrete, concrete_powder, terracotta, glazed_terracotta, stained_glass.
const COLORS = [
  "white", "light_gray", "gray", "black", "brown",
  "red", "orange", "yellow", "lime", "green",
  "cyan", "light_blue", "blue", "purple", "magenta", "pink",
];

function coloredSet(suffix, group) {
  return COLORS.map((c) => b(`${c}_${suffix}`, `${c}_${suffix}`, null, group));
}

const ALL_BLOCKS = [
  // Slot 0 is reserved for "air" (eraser) by the build script.

  // ---- Stone family ----
  b("stone",                    "stone",                    null, "Stone"),
  b("smooth_stone",             "smooth_stone",             null, "Stone"),
  b("cobblestone",              "cobblestone",              null, "Stone"),
  b("mossy_cobblestone",        "mossy_cobblestone",        null, "Stone"),
  b("stone_bricks",             "stone_bricks",             null, "Stone"),
  b("mossy_stone_bricks",       "mossy_stone_bricks",       null, "Stone"),
  b("cracked_stone_bricks",     "cracked_stone_bricks",     null, "Stone"),
  b("chiseled_stone_bricks",    "chiseled_stone_bricks",    null, "Stone"),
  b("granite",                  "granite",                  null, "Stone"),
  b("polished_granite",         "polished_granite",         null, "Stone"),
  b("diorite",                  "diorite",                  null, "Stone"),
  b("polished_diorite",         "polished_diorite",         null, "Stone"),
  b("andesite",                 "andesite",                 null, "Stone"),
  b("polished_andesite",        "polished_andesite",        null, "Stone"),
  b("deepslate",                "deepslate",                null, "Stone"),
  b("cobbled_deepslate",        "cobbled_deepslate",        null, "Stone"),
  b("polished_deepslate",       "polished_deepslate",       null, "Stone"),
  b("chiseled_deepslate",       "chiseled_deepslate",       null, "Stone"),
  b("deepslate_bricks",         "deepslate_bricks",         null, "Stone"),
  b("cracked_deepslate_bricks", "cracked_deepslate_bricks", null, "Stone"),
  b("deepslate_tiles",          "deepslate_tiles",          null, "Stone"),
  b("cracked_deepslate_tiles",  "cracked_deepslate_tiles",  null, "Stone"),
  b("tuff",                     "tuff",                     null, "Stone"),
  b("polished_tuff",            "polished_tuff",            null, "Stone"),
  b("chiseled_tuff",            "chiseled_tuff",            null, "Stone"),
  b("tuff_bricks",              "tuff_bricks",              null, "Stone"),
  b("chiseled_tuff_bricks",     "chiseled_tuff_bricks",     null, "Stone"),
  b("calcite",                  "calcite",                  null, "Stone"),
  b("dripstone_block",          "dripstone_block",          null, "Stone"),
  b("bedrock",                  "bedrock",                  null, "Stone"),
  b("obsidian",                 "obsidian",                 null, "Stone"),
  b("crying_obsidian",          "crying_obsidian",          null, "Stone"),
  b("reinforced_deepslate",     "reinforced_deepslate_side", null, "Stone"),

  // ---- Sandstone ----
  b("sandstone",                "sandstone",                null, "Sandstone"),
  b("smooth_sandstone",         "sandstone_top",            "Smooth Sandstone", "Sandstone"),
  b("cut_sandstone",            "cut_sandstone",            null, "Sandstone"),
  b("chiseled_sandstone",       "chiseled_sandstone",       null, "Sandstone"),
  b("red_sandstone",            "red_sandstone",            null, "Sandstone"),
  b("smooth_red_sandstone",     "red_sandstone_top",        "Smooth Red Sandstone", "Sandstone"),
  b("cut_red_sandstone",        "cut_red_sandstone",        null, "Sandstone"),
  b("chiseled_red_sandstone",   "chiseled_red_sandstone",   null, "Sandstone"),

  // ---- Earth & soil ----
  b("dirt",                     "dirt",                     null, "Earth"),
  b("coarse_dirt",              "coarse_dirt",              null, "Earth"),
  b("rooted_dirt",              "rooted_dirt",              null, "Earth"),
  b("grass_block",              "grass_block_side",         null, "Earth"),
  b("podzol",                   "podzol_side",              null, "Earth"),
  b("mycelium",                 "mycelium_side",            null, "Earth"),
  b("dirt_path",                "dirt_path_side",           null, "Earth"),
  b("farmland",                 "farmland",                 null, "Earth"),
  b("mud",                      "mud",                      null, "Earth"),
  b("packed_mud",               "packed_mud",               null, "Earth"),
  b("mud_bricks",               "mud_bricks",               null, "Earth"),
  b("clay",                     "clay",                     null, "Earth"),
  b("sand",                     "sand",                     null, "Earth"),
  b("red_sand",                 "red_sand",                 null, "Earth"),
  b("gravel",                   "gravel",                   null, "Earth"),
  b("suspicious_sand",          "suspicious_sand_0",        null, "Earth"),
  b("suspicious_gravel",        "suspicious_gravel_0",      null, "Earth"),
  b("snow_block",               "snow",                     null, "Earth"),
  b("ice",                      "ice",                      null, "Earth"),
  b("packed_ice",               "packed_ice",               null, "Earth"),
  b("blue_ice",                 "blue_ice",                 null, "Earth"),
  b("moss_block",               "moss_block",               null, "Earth"),
  b("pale_moss_block",          "pale_moss_block",          null, "Earth"),

  // ---- Nether ----
  b("netherrack",               "netherrack",               null, "Nether"),
  b("magma_block",              "magma",                    null, "Nether"),
  b("soul_sand",                "soul_sand",                null, "Nether"),
  b("soul_soil",                "soul_soil",                null, "Nether"),
  b("nether_bricks",            "nether_bricks",            null, "Nether"),
  b("cracked_nether_bricks",    "cracked_nether_bricks",    null, "Nether"),
  b("chiseled_nether_bricks",   "chiseled_nether_bricks",   null, "Nether"),
  b("red_nether_bricks",        "red_nether_bricks",        null, "Nether"),
  b("nether_wart_block",        "nether_wart_block",        null, "Nether"),
  b("warped_wart_block",        "warped_wart_block",        null, "Nether"),
  b("crimson_nylium",           "crimson_nylium",           null, "Nether"),
  b("warped_nylium",            "warped_nylium",            null, "Nether"),
  b("basalt",                   "basalt_side",              null, "Nether"),
  b("smooth_basalt",            "smooth_basalt",            null, "Nether"),
  b("polished_basalt",          "polished_basalt_side",     null, "Nether"),
  b("blackstone",               "blackstone",               null, "Nether"),
  b("polished_blackstone",      "polished_blackstone",      null, "Nether"),
  b("chiseled_polished_blackstone", "chiseled_polished_blackstone", null, "Nether"),
  b("gilded_blackstone",        "gilded_blackstone",        null, "Nether"),
  b("polished_blackstone_bricks", "polished_blackstone_bricks", null, "Nether"),
  b("cracked_polished_blackstone_bricks", "cracked_polished_blackstone_bricks", null, "Nether"),
  b("shroomlight",              "shroomlight",              null, "Nether"),
  b("ancient_debris",           "ancient_debris_side",      null, "Nether"),
  b("glowstone",                "glowstone",                null, "Nether"),

  // ---- End ----
  b("end_stone",                "end_stone",                null, "End"),
  b("end_stone_bricks",         "end_stone_bricks",         null, "End"),
  b("purpur_block",             "purpur_block",             null, "End"),
  b("purpur_pillar",            "purpur_pillar",            null, "End"),

  // ---- Overworld ores ----
  b("coal_ore",                 "coal_ore",                 null, "Ores"),
  b("iron_ore",                 "iron_ore",                 null, "Ores"),
  b("copper_ore",               "copper_ore",               null, "Ores"),
  b("gold_ore",                 "gold_ore",                 null, "Ores"),
  b("redstone_ore",             "redstone_ore",             null, "Ores"),
  b("lapis_ore",                "lapis_ore",                null, "Ores"),
  b("diamond_ore",              "diamond_ore",              null, "Ores"),
  b("emerald_ore",              "emerald_ore",              null, "Ores"),
  b("deepslate_coal_ore",       "deepslate_coal_ore",       null, "Ores"),
  b("deepslate_iron_ore",       "deepslate_iron_ore",       null, "Ores"),
  b("deepslate_copper_ore",     "deepslate_copper_ore",     null, "Ores"),
  b("deepslate_gold_ore",       "deepslate_gold_ore",       null, "Ores"),
  b("deepslate_redstone_ore",   "deepslate_redstone_ore",   null, "Ores"),
  b("deepslate_lapis_ore",      "deepslate_lapis_ore",      null, "Ores"),
  b("deepslate_diamond_ore",    "deepslate_diamond_ore",    null, "Ores"),
  b("deepslate_emerald_ore",    "deepslate_emerald_ore",    null, "Ores"),
  b("nether_quartz_ore",        "nether_quartz_ore",        null, "Ores"),
  b("nether_gold_ore",          "nether_gold_ore",          null, "Ores"),

  // ---- Resource blocks ----
  b("coal_block",               "coal_block",               null, "Resource"),
  b("raw_iron_block",           "raw_iron_block",           null, "Resource"),
  b("raw_gold_block",           "raw_gold_block",           null, "Resource"),
  b("raw_copper_block",         "raw_copper_block",         null, "Resource"),
  b("iron_block",               "iron_block",               null, "Resource"),
  b("gold_block",               "gold_block",               null, "Resource"),
  b("diamond_block",            "diamond_block",            null, "Resource"),
  b("emerald_block",            "emerald_block",            null, "Resource"),
  b("lapis_block",              "lapis_block",              null, "Resource"),
  b("redstone_block",           "redstone_block",           null, "Resource"),
  // netherite_block intentionally removed by user request.

  // ---- Copper (4 oxidation × variants, skipping doors/trapdoors/bulbs) ----
  b("copper_block",             "copper_block",             null, "Copper"),
  b("exposed_copper",           "exposed_copper",           null, "Copper"),
  b("weathered_copper",         "weathered_copper",         null, "Copper"),
  b("oxidized_copper",          "oxidized_copper",          null, "Copper"),
  b("cut_copper",               "cut_copper",               null, "Copper"),
  b("exposed_cut_copper",       "exposed_cut_copper",       null, "Copper"),
  b("weathered_cut_copper",     "weathered_cut_copper",     null, "Copper"),
  b("oxidized_cut_copper",      "oxidized_cut_copper",      null, "Copper"),
  b("chiseled_copper",          "chiseled_copper",          null, "Copper"),
  b("exposed_chiseled_copper",  "exposed_chiseled_copper",  null, "Copper"),
  b("weathered_chiseled_copper","weathered_chiseled_copper",null, "Copper"),
  b("oxidized_chiseled_copper", "oxidized_chiseled_copper", null, "Copper"),
  b("copper_grate",             "copper_grate",             null, "Copper"),
  b("exposed_copper_grate",     "exposed_copper_grate",     null, "Copper"),
  b("weathered_copper_grate",   "weathered_copper_grate",   null, "Copper"),
  b("oxidized_copper_grate",    "oxidized_copper_grate",    null, "Copper"),

  // ---- Quartz ----
  b("quartz_block",             "quartz_block_side",        null, "Quartz"),
  b("chiseled_quartz_block",    "chiseled_quartz_block",    null, "Quartz"),
  b("quartz_pillar",            "quartz_pillar",            null, "Quartz"),
  b("smooth_quartz",            "quartz_block_bottom",      "Smooth Quartz", "Quartz"),
  b("quartz_bricks",            "quartz_bricks",            null, "Quartz"),

  // ---- Brick variety ----
  b("bricks",                   "bricks",                   null, "Bricks"),
  b("prismarine",               "prismarine",               null, "Bricks"),
  b("prismarine_bricks",        "prismarine_bricks",        null, "Bricks"),
  b("dark_prismarine",          "dark_prismarine",          null, "Bricks"),

  // ---- Wood ----
  ...woodFamily("oak"),
  ...woodFamily("spruce"),
  ...woodFamily("birch"),
  ...woodFamily("jungle"),
  ...woodFamily("acacia"),
  ...woodFamily("dark_oak"),
  ...woodFamily("mangrove"),
  ...woodFamily("cherry"),
  ...woodFamily("pale_oak"),
  ...stemFamily("crimson"),
  ...stemFamily("warped"),

  // ---- Bamboo + special leaves ----
  b("bamboo_planks",            "bamboo_planks",            null, "Wood"),
  b("bamboo_mosaic",            "bamboo_mosaic",            null, "Wood"),
  b("bamboo_block",             "bamboo_block",             null, "Wood"),
  b("stripped_bamboo_block",    "stripped_bamboo_block",    null, "Wood"),
  b("azalea_leaves",            "azalea_leaves",            null, "Leaves"),
  b("flowering_azalea_leaves",  "flowering_azalea_leaves",  null, "Leaves"),

  // ---- Wool / concrete / concrete powder ----
  ...coloredSet("wool",              "Wool"),
  ...coloredSet("concrete",          "Concrete"),
  ...coloredSet("concrete_powder",   "Concrete Powder"),

  // ---- Terracotta ----
  b("terracotta",               "terracotta",               null, "Terracotta"),
  ...coloredSet("terracotta",        "Terracotta"),
  ...COLORS.map((c) =>
    b(`${c}_glazed_terracotta`, `${c}_glazed_terracotta`, null, "Glazed Terracotta")
  ),

  // ---- Glass ----
  b("glass",                    "glass",                    null, "Glass"),
  b("tinted_glass",             "tinted_glass",             null, "Glass"),
  ...COLORS.map((c) =>
    b(`${c}_stained_glass`, `${c}_stained_glass`, null, "Glass")
  ),

  // ---- Mushroom blocks ----
  b("mushroom_stem",            "mushroom_stem",            null, "Mushroom"),
  b("red_mushroom_block",       "red_mushroom_block",       null, "Mushroom"),
  b("brown_mushroom_block",     "brown_mushroom_block",     null, "Mushroom"),

  // ---- Sculk ----
  b("sculk",                    "sculk",                    null, "Sculk"),
  b("sculk_catalyst",           "sculk_catalyst_top",       null, "Sculk"),

  // ---- Amethyst & froglights ----
  b("amethyst_block",           "amethyst_block",           null, "Amethyst"),
  b("budding_amethyst",         "budding_amethyst",         null, "Amethyst"),
  b("pearlescent_froglight",    "pearlescent_froglight_side", null, "Amethyst"),
  b("verdant_froglight",        "verdant_froglight_side",   null, "Amethyst"),
  b("ochre_froglight",          "ochre_froglight_side",     null, "Amethyst"),

  // ---- Specialty / utility ----
  b("sea_lantern",              "sea_lantern",              null, "Specialty"),
  b("redstone_lamp",            "redstone_lamp",            null, "Specialty"),
  b("jack_o_lantern",           "jack_o_lantern",           null, "Specialty"),
  b("pumpkin",                  "pumpkin_side",             null, "Specialty"),
  b("carved_pumpkin",           "carved_pumpkin",           null, "Specialty"),
  b("melon",                    "melon_side",               null, "Specialty"),
  b("hay_block",                "hay_block_side",           null, "Specialty"),
  b("bone_block",               "bone_block_side",          null, "Specialty"),
  b("bookshelf",                "bookshelf",                null, "Specialty"),
  b("chiseled_bookshelf",       "chiseled_bookshelf_empty", null, "Specialty"),
  b("sponge",                   "sponge",                   null, "Specialty"),
  b("wet_sponge",               "wet_sponge",               null, "Specialty"),
  b("honeycomb_block",          "honeycomb_block",          null, "Specialty"),
  b("honey_block",              "honey_block_side",         null, "Specialty"),
  b("slime_block",              "slime_block",              null, "Specialty"),
  b("dried_kelp_block",         "dried_kelp_side",          null, "Specialty"),
  b("target",                   "target_side",              null, "Specialty"),

  // ---- Functional cubes (oriented blocks shown with iconic face) ----
  b("furnace",                  "furnace_front",            null, "Functional"),
  b("blast_furnace",            "blast_furnace_front",      null, "Functional"),
  b("smoker",                   "smoker_front",             null, "Functional"),
  b("dispenser",                "dispenser_front",          null, "Functional"),
  b("dropper",                  "dropper_front",            null, "Functional"),
  b("observer",                 "observer_front",           null, "Functional"),
  b("crafter",                  "crafter_west",             null, "Functional"),
  b("note_block",               "note_block",               null, "Functional"),
  b("jukebox",                  "jukebox_side",             null, "Functional"),
  b("barrel",                   "barrel_side",              null, "Functional"),
  b("structure_block",          "structure_block",          null, "Functional"),
  b("command_block",            "command_block_back",       null, "Functional"),

  // ---- Coral blocks (live + dead) ----
  b("tube_coral_block",         "tube_coral_block",         null, "Coral"),
  b("brain_coral_block",        "brain_coral_block",        null, "Coral"),
  b("bubble_coral_block",       "bubble_coral_block",       null, "Coral"),
  b("fire_coral_block",         "fire_coral_block",         null, "Coral"),
  b("horn_coral_block",         "horn_coral_block",         null, "Coral"),
  b("dead_tube_coral_block",    "dead_tube_coral_block",    null, "Coral"),
  b("dead_brain_coral_block",   "dead_brain_coral_block",   null, "Coral"),
  b("dead_bubble_coral_block",  "dead_bubble_coral_block",  null, "Coral"),
  b("dead_fire_coral_block",    "dead_fire_coral_block",    null, "Coral"),
  b("dead_horn_coral_block",    "dead_horn_coral_block",    null, "Coral"),
];

module.exports = { ALL_BLOCKS };
