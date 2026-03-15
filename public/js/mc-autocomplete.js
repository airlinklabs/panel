// mc-autocomplete.js — ES module
// Loaded lazily via import() after page load. Does not run at parse time.
// Exports: init(serverUUID) — call once to wire up the input element.

const COMMANDS = {
  advancement: {
    sub: ['grant', 'revoke'],
    grant:  { sub: ['<player>'], '<player>': { sub: ['everything', 'only', 'from', 'through', 'until'] } },
    revoke: { sub: ['<player>'], '<player>': { sub: ['everything', 'only', 'from', 'through', 'until'] } },
  },
  attribute: { sub: ['<player>'] },
  ban: { sub: ['<player>'] },
  'ban-ip': { sub: [] },
  banlist: { sub: ['ips', 'players'] },
  bossbar: { sub: ['add', 'get', 'list', 'remove', 'set'] },
  clear: { sub: ['<player>'] },
  clone: { sub: [] },
  data: { sub: ['get', 'merge', 'modify', 'remove'] },
  datapack: {
    sub: ['disable', 'enable', 'list'],
    enable:  { sub: ['--enabled', '--disabled'] },
    disable: { sub: [] },
    list:    { sub: ['available', 'enabled'] },
  },
  debug: { sub: ['start', 'stop', 'function', 'report'] },
  defaultgamemode: { sub: ['survival', 'creative', 'adventure', 'spectator'] },
  deop: { sub: ['<player>'] },
  difficulty: { sub: ['peaceful', 'easy', 'normal', 'hard'] },
  effect: {
    sub: ['clear', 'give'],
    clear: { sub: ['<player>'] },
    give:  { sub: ['<player>'], '<player>': { sub: ['minecraft:absorption','minecraft:blindness','minecraft:conduit_power','minecraft:darkness','minecraft:dolphins_grace','minecraft:fire_resistance','minecraft:glowing','minecraft:haste','minecraft:health_boost','minecraft:hero_of_the_village','minecraft:hunger','minecraft:instant_damage','minecraft:instant_health','minecraft:invisibility','minecraft:jump_boost','minecraft:levitation','minecraft:luck','minecraft:mining_fatigue','minecraft:nausea','minecraft:night_vision','minecraft:poison','minecraft:regeneration','minecraft:resistance','minecraft:saturation','minecraft:slow_falling','minecraft:slowness','minecraft:speed','minecraft:strength','minecraft:unluck','minecraft:water_breathing','minecraft:weakness','minecraft:wither'] } },
  },
  enchant: { sub: ['<player>'], '<player>': { sub: ['minecraft:aqua_affinity','minecraft:bane_of_arthropods','minecraft:binding_curse','minecraft:blast_protection','minecraft:channeling','minecraft:depth_strider','minecraft:efficiency','minecraft:feather_falling','minecraft:fire_aspect','minecraft:fire_protection','minecraft:flame','minecraft:fortune','minecraft:frost_walker','minecraft:impaling','minecraft:infinity','minecraft:knockback','minecraft:looting','minecraft:loyalty','minecraft:luck_of_the_sea','minecraft:lure','minecraft:mending','minecraft:multishot','minecraft:piercing','minecraft:power','minecraft:projectile_protection','minecraft:protection','minecraft:punch','minecraft:quick_charge','minecraft:respiration','minecraft:riptide','minecraft:sharpness','minecraft:silk_touch','minecraft:smite','minecraft:soul_speed','minecraft:sweeping','minecraft:swift_sneak','minecraft:thorns','minecraft:unbreaking','minecraft:vanishing_curse'] } },
  execute: { sub: ['align','anchored','as','at','facing','if','in','on','positioned','rotated','run','store','summon','unless'] },
  experience: {
    sub: ['add', 'query', 'set'],
    add:   { sub: ['<player>'], '<player>': { sub: ['<amount>'] } },
    set:   { sub: ['<player>'] },
    query: { sub: ['<player>'] },
  },
  fill: { sub: [] },
  forceload: { sub: ['add', 'remove', 'query'] },
  function: { sub: [] },
  gamemode: {
    sub: ['survival', 'creative', 'adventure', 'spectator'],
    survival:  { sub: ['<player>'] },
    creative:  { sub: ['<player>'] },
    adventure: { sub: ['<player>'] },
    spectator: { sub: ['<player>'] },
  },
  gamerule: {
    sub: [
      'announceAdvancements','commandBlockOutput','daylightCycle','disableElytraMovementCheck',
      'disableRaids','displaySleepingPercentage','doEntityDrops','doFireTick',
      'doImmediateRespawn','doInsomnia','doLimitedCrafting','doMobLoot','doMobSpawning',
      'doPatrolSpawning','doTileDrops','doTraderSpawning','doWardenSpawning','doWeatherCycle',
      'drowningDamage','enderPearlsVanishOnDeath','fallDamage','fireDamage','freezeDamage',
      'forgiveDeadPlayers','globalSoundEvents','keepInventory','lavaSourceConversion',
      'logAdminCommands','maxCommandChainLength','maxEntityCramming','mobExplosionDropDecay',
      'mobGriefing','naturalRegeneration','playersSleepingPercentage','projectilesCanBreakBlocks',
      'pvp','randomTickSpeed','reducedDebugInfo','sendCommandFeedback','showDeathMessages',
      'snowAccumulationHeight','spawnRadius','spectatorsGenerateChunks','tntExplosionDropDecay',
      'universalAnger','waterSourceConversion',
    ],
  },
  give: {
    sub: ['<player>'],
    '<player>': { sub: '<items>' },
  },
  help: { sub: [] },
  item: { sub: ['modify', 'replace'] },
  kick: { sub: ['<player>'] },
  kill: { sub: ['<player>', '@a', '@e', '@r', '@s', '@p'] },
  list: { sub: ['uuids'] },
  locate: { sub: ['biome', 'poi', 'structure'] },
  loot: { sub: ['fish', 'give', 'insert', 'replace', 'shoot', 'spawn'] },
  me: { sub: [] },
  msg: { sub: ['<player>'] },
  op: { sub: ['<player>'] },
  pardon: { sub: ['<player>'] },
  'pardon-ip': { sub: [] },
  particle: { sub: [] },
  place: { sub: ['feature', 'jigsaw', 'structure', 'template'] },
  playsound: { sub: [] },
  recipe: {
    sub: ['give', 'take'],
    give: { sub: ['<player>'], '<player>': { sub: ['*'] } },
    take: { sub: ['<player>'] },
  },
  reload: { sub: [] },
  return: { sub: ['fail', 'run', 'value'] },
  ride: { sub: [] },
  'save-all': { sub: ['flush'] },
  'save-off': { sub: [] },
  'save-on': { sub: [] },
  say: { sub: [] },
  schedule: {
    sub: ['clear', 'function'],
    function: { sub: [] },
    clear:    { sub: [] },
  },
  scoreboard: {
    sub: ['objectives', 'players'],
    objectives: { sub: ['add', 'list', 'modify', 'remove', 'setdisplay'] },
    players: { sub: ['add', 'enable', 'get', 'list', 'operation', 'remove', 'reset', 'set'] },
  },
  seed: { sub: [] },
  setblock: { sub: [] },
  setidletimeout: { sub: [] },
  setworldspawn: { sub: [] },
  spawnpoint: { sub: ['<player>'] },
  spreadplayers: { sub: [] },
  stop: { sub: [] },
  stopsound: { sub: ['<player>'] },
  summon: {
    sub: [
      'minecraft:allay','minecraft:armor_stand','minecraft:axolotl','minecraft:bat',
      'minecraft:bee','minecraft:blaze','minecraft:camel','minecraft:cat',
      'minecraft:cave_spider','minecraft:chicken','minecraft:cod','minecraft:cow',
      'minecraft:creeper','minecraft:dolphin','minecraft:donkey','minecraft:drowned',
      'minecraft:elder_guardian','minecraft:enderman','minecraft:endermite','minecraft:evoker',
      'minecraft:fox','minecraft:frog','minecraft:ghast','minecraft:giant','minecraft:goat',
      'minecraft:guardian','minecraft:hoglin','minecraft:horse','minecraft:husk',
      'minecraft:iron_golem','minecraft:llama','minecraft:magma_cube','minecraft:mooshroom',
      'minecraft:mule','minecraft:ocelot','minecraft:panda','minecraft:parrot',
      'minecraft:phantom','minecraft:pig','minecraft:piglin','minecraft:piglin_brute',
      'minecraft:pillager','minecraft:polar_bear','minecraft:pufferfish','minecraft:rabbit',
      'minecraft:ravager','minecraft:salmon','minecraft:sheep','minecraft:shulker',
      'minecraft:silverfish','minecraft:skeleton','minecraft:skeleton_horse','minecraft:slime',
      'minecraft:sniffer','minecraft:snow_golem','minecraft:spider','minecraft:squid',
      'minecraft:stray','minecraft:strider','minecraft:tadpole','minecraft:trader_llama',
      'minecraft:tropical_fish','minecraft:turtle','minecraft:vex','minecraft:villager',
      'minecraft:vindicator','minecraft:wandering_trader','minecraft:warden','minecraft:witch',
      'minecraft:wither','minecraft:wither_skeleton','minecraft:wolf','minecraft:zoglin',
      'minecraft:zombie','minecraft:zombie_horse','minecraft:zombie_villager',
      'minecraft:zombified_piglin',
    ],
  },
  tag: {
    sub: ['<player>'],
    '<player>': { sub: ['add', 'list', 'remove'] },
  },
  team: { sub: ['add', 'empty', 'join', 'leave', 'list', 'modify', 'remove'] },
  teammsg: { sub: [] },
  teleport: {
    sub: ['<player>'],
    '<player>': { sub: ['<player>'] },
  },
  tell: { sub: ['<player>'] },
  tellraw: { sub: ['<player>', '@a', '@e', '@r', '@s', '@p'] },
  time: {
    sub: ['add', 'query', 'set'],
    set:   { sub: ['day', 'midnight', 'night', 'noon', '0', '6000', '12000', '18000'] },
    add:   { sub: [] },
    query: { sub: ['daytime', 'gametime', 'day'] },
  },
  title: {
    sub: ['<player>'],
    '<player>': { sub: ['actionbar', 'clear', 'reset', 'subtitle', 'times', 'title'] },
  },
  tp: {
    sub: ['<player>'],
    '<player>': { sub: ['<player>'] },
  },
  trigger: { sub: [] },
  weather: { sub: ['clear', 'rain', 'thunder'] },
  whitelist: {
    sub: ['add', 'list', 'off', 'on', 'reload', 'remove'],
    add:    { sub: ['<player>'] },
    remove: { sub: ['<player>'] },
    list:   { sub: [] },
    on:     { sub: [] },
    off:    { sub: [] },
    reload: { sub: [] },
  },
  worldborder: {
    sub: ['add', 'center', 'damage', 'get', 'set', 'warning'],
    damage:  { sub: ['amount', 'buffer'] },
    warning: { sub: ['distance', 'time'] },
  },
  xp: {
    sub: ['add', 'query', 'set'],
    add:   { sub: ['<player>'], '<player>': { sub: ['<amount>', '<amount>L'] } },
    set:   { sub: ['<player>'] },
    query: { sub: ['<player>'], '<player>': { sub: ['levels', 'points'] } },
  },
};

const ITEMS = [
  'minecraft:acacia_boat','minecraft:acacia_log','minecraft:acacia_planks','minecraft:acacia_sapling',
  'minecraft:acacia_slab','minecraft:acacia_stairs','minecraft:air','minecraft:allium',
  'minecraft:amethyst_shard','minecraft:ancient_debris','minecraft:andesite','minecraft:apple',
  'minecraft:armor_stand','minecraft:arrow','minecraft:axolotl_bucket','minecraft:azure_bluet',
  'minecraft:bamboo','minecraft:bamboo_block','minecraft:barrel','minecraft:barrier',
  'minecraft:beacon','minecraft:bedrock','minecraft:beef','minecraft:birch_log',
  'minecraft:birch_planks','minecraft:black_dye','minecraft:blackstone','minecraft:blaze_powder',
  'minecraft:blaze_rod','minecraft:blue_dye','minecraft:blue_ice','minecraft:bone',
  'minecraft:bone_block','minecraft:bone_meal','minecraft:book','minecraft:bookshelf',
  'minecraft:bow','minecraft:bowl','minecraft:bread','minecraft:brewing_stand',
  'minecraft:brick','minecraft:brown_dye','minecraft:brown_mushroom','minecraft:bucket',
  'minecraft:cactus','minecraft:cake','minecraft:campfire','minecraft:carrot',
  'minecraft:cartography_table','minecraft:chainmail_boots','minecraft:chainmail_chestplate',
  'minecraft:chainmail_helmet','minecraft:chainmail_leggings','minecraft:charcoal',
  'minecraft:cherry_log','minecraft:cherry_planks','minecraft:chest','minecraft:chicken',
  'minecraft:chorus_fruit','minecraft:clay','minecraft:clay_ball','minecraft:clock',
  'minecraft:coal','minecraft:coal_block','minecraft:coal_ore','minecraft:cobblestone',
  'minecraft:cobblestone_slab','minecraft:cobblestone_stairs','minecraft:cobweb',
  'minecraft:cocoa_beans','minecraft:compass','minecraft:composter','minecraft:conduit',
  'minecraft:cooked_beef','minecraft:cooked_chicken','minecraft:cooked_cod',
  'minecraft:cooked_mutton','minecraft:cooked_porkchop','minecraft:cooked_rabbit',
  'minecraft:cooked_salmon','minecraft:copper_block','minecraft:copper_ingot',
  'minecraft:coral_block','minecraft:crafting_table','minecraft:crossbow','minecraft:cyan_dye',
  'minecraft:dark_oak_log','minecraft:dark_oak_planks','minecraft:dark_prismarine',
  'minecraft:daylight_detector','minecraft:dead_bush','minecraft:deepslate',
  'minecraft:deepslate_coal_ore','minecraft:deepslate_diamond_ore','minecraft:diamond',
  'minecraft:diamond_axe','minecraft:diamond_boots','minecraft:diamond_chestplate',
  'minecraft:diamond_helmet','minecraft:diamond_hoe','minecraft:diamond_leggings',
  'minecraft:diamond_ore','minecraft:diamond_pickaxe','minecraft:diamond_shovel',
  'minecraft:diamond_sword','minecraft:diorite','minecraft:dirt','minecraft:dispenser',
  'minecraft:dropper','minecraft:dye','minecraft:echo_shard','minecraft:egg',
  'minecraft:elytra','minecraft:emerald','minecraft:emerald_block','minecraft:emerald_ore',
  'minecraft:enchanted_golden_apple','minecraft:enchanting_table','minecraft:end_crystal',
  'minecraft:end_rod','minecraft:end_stone','minecraft:end_stone_bricks',
  'minecraft:ender_chest','minecraft:ender_eye','minecraft:ender_pearl',
  'minecraft:experience_bottle','minecraft:farmland','minecraft:feather',
  'minecraft:fermented_spider_eye','minecraft:fern','minecraft:fire_charge',
  'minecraft:firework_rocket','minecraft:firework_star','minecraft:fishing_rod',
  'minecraft:flint','minecraft:flint_and_steel','minecraft:flower_pot',
  'minecraft:furnace','minecraft:ghast_tear','minecraft:glass','minecraft:glass_bottle',
  'minecraft:glass_pane','minecraft:glistering_melon_slice','minecraft:glowstone',
  'minecraft:glowstone_dust','minecraft:gold_block','minecraft:gold_ingot',
  'minecraft:gold_nugget','minecraft:gold_ore','minecraft:golden_apple',
  'minecraft:golden_axe','minecraft:golden_boots','minecraft:golden_carrot',
  'minecraft:golden_chestplate','minecraft:golden_helmet','minecraft:golden_hoe',
  'minecraft:golden_leggings','minecraft:golden_pickaxe','minecraft:golden_shovel',
  'minecraft:golden_sword','minecraft:granite','minecraft:grass','minecraft:grass_block',
  'minecraft:gravel','minecraft:gray_dye','minecraft:green_dye','minecraft:grindstone',
  'minecraft:gunpowder','minecraft:hay_block','minecraft:heart_of_the_sea',
  'minecraft:honey_block','minecraft:honey_bottle','minecraft:honeycomb','minecraft:hopper',
  'minecraft:ice','minecraft:iron_axe','minecraft:iron_bars','minecraft:iron_block',
  'minecraft:iron_boots','minecraft:iron_chestplate','minecraft:iron_helmet',
  'minecraft:iron_hoe','minecraft:iron_ingot','minecraft:iron_leggings',
  'minecraft:iron_nugget','minecraft:iron_ore','minecraft:iron_pickaxe',
  'minecraft:iron_shovel','minecraft:iron_sword','minecraft:item_frame',
  'minecraft:jack_o_lantern','minecraft:jungle_log','minecraft:jungle_planks',
  'minecraft:kelp','minecraft:ladder','minecraft:lantern','minecraft:lapis_block',
  'minecraft:lapis_lazuli','minecraft:lapis_ore','minecraft:lava_bucket',
  'minecraft:lead','minecraft:leather','minecraft:leather_boots',
  'minecraft:leather_chestplate','minecraft:leather_helmet','minecraft:leather_leggings',
  'minecraft:lectern','minecraft:light_blue_dye','minecraft:light_gray_dye',
  'minecraft:light_weighted_pressure_plate','minecraft:lime_dye','minecraft:loom',
  'minecraft:magenta_dye','minecraft:magma_block','minecraft:magma_cream',
  'minecraft:mangrove_log','minecraft:mangrove_planks','minecraft:melon',
  'minecraft:melon_seeds','minecraft:melon_slice','minecraft:minecart',
  'minecraft:moss_block','minecraft:moss_carpet','minecraft:mud','minecraft:mud_bricks',
  'minecraft:mushroom_stew','minecraft:mutton','minecraft:name_tag','minecraft:nautilus_shell',
  'minecraft:nether_brick','minecraft:nether_bricks','minecraft:nether_quartz_ore',
  'minecraft:nether_star','minecraft:nether_wart','minecraft:nether_wart_block',
  'minecraft:netherite_axe','minecraft:netherite_block','minecraft:netherite_boots',
  'minecraft:netherite_chestplate','minecraft:netherite_helmet','minecraft:netherite_hoe',
  'minecraft:netherite_ingot','minecraft:netherite_leggings','minecraft:netherite_pickaxe',
  'minecraft:netherite_scrap','minecraft:netherite_shovel','minecraft:netherite_sword',
  'minecraft:netherrack','minecraft:note_block','minecraft:oak_boat','minecraft:oak_log',
  'minecraft:oak_planks','minecraft:oak_sapling','minecraft:oak_slab','minecraft:oak_stairs',
  'minecraft:observer','minecraft:obsidian','minecraft:orange_dye','minecraft:packed_ice',
  'minecraft:painting','minecraft:paper','minecraft:phantom_membrane','minecraft:pink_dye',
  'minecraft:piston','minecraft:poisonous_potato','minecraft:polished_andesite',
  'minecraft:polished_basalt','minecraft:polished_blackstone','minecraft:polished_diorite',
  'minecraft:polished_granite','minecraft:porkchop','minecraft:potato',
  'minecraft:prismarine','minecraft:prismarine_crystals','minecraft:prismarine_shard',
  'minecraft:pufferfish','minecraft:pumpkin','minecraft:pumpkin_pie',
  'minecraft:pumpkin_seeds','minecraft:purple_dye','minecraft:purpur_block',
  'minecraft:quartz','minecraft:quartz_block','minecraft:rabbit','minecraft:rabbit_foot',
  'minecraft:rabbit_hide','minecraft:rabbit_stew','minecraft:raw_copper',
  'minecraft:raw_gold','minecraft:raw_iron','minecraft:red_dye','minecraft:red_mushroom',
  'minecraft:red_sand','minecraft:redstone','minecraft:redstone_block',
  'minecraft:redstone_lamp','minecraft:redstone_ore','minecraft:redstone_torch',
  'minecraft:repeater','minecraft:respawn_anchor','minecraft:rose_bush',
  'minecraft:rotten_flesh','minecraft:salmon','minecraft:sand','minecraft:sandstone',
  'minecraft:scaffolding','minecraft:seagrass','minecraft:sea_lantern',
  'minecraft:sea_pickle','minecraft:shears','minecraft:shield','minecraft:shroomlight',
  'minecraft:slimeball','minecraft:smithing_table','minecraft:smoker','minecraft:snow',
  'minecraft:snow_block','minecraft:snowball','minecraft:soul_sand','minecraft:soul_soil',
  'minecraft:spider_eye','minecraft:spruce_log','minecraft:spruce_planks',
  'minecraft:stick','minecraft:sticky_piston','minecraft:stone','minecraft:stone_axe',
  'minecraft:stone_bricks','minecraft:stone_hoe','minecraft:stone_pickaxe',
  'minecraft:stone_shovel','minecraft:stone_sword','minecraft:string',
  'minecraft:stripped_oak_log','minecraft:sugar','minecraft:sugar_cane',
  'minecraft:suspicious_stew','minecraft:sweet_berries','minecraft:target',
  'minecraft:tinted_glass','minecraft:tnt','minecraft:tnt_minecart',
  'minecraft:totem_of_undying','minecraft:torch','minecraft:trident',
  'minecraft:tropical_fish','minecraft:turtle_egg','minecraft:turtle_helmet',
  'minecraft:twisting_vines','minecraft:verdant_froglight','minecraft:vine',
  'minecraft:warped_fungus','minecraft:warped_log','minecraft:warped_planks',
  'minecraft:warped_stem','minecraft:water_bucket','minecraft:weeping_vines',
  'minecraft:wheat','minecraft:wheat_seeds','minecraft:white_dye','minecraft:white_wool',
  'minecraft:wither_rose','minecraft:wither_skeleton_skull','minecraft:yellow_dye',
  'minecraft:zombie_head',
];

// Cached player list for this session — fetched once on first input focus.
let players = null;
let fetchPending = false;

export function fetchPlayersIfNeeded(serverUUID) {
  if (players !== null || fetchPending) return;
  fetchPending = true;
  fetch(`/server/${serverUUID}/players`, { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .then(data => {
      players = Array.isArray(data.players)
        ? data.players.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean)
        : [];
    })
    .catch(() => { players = []; })
    .finally(() => { fetchPending = false; });
}

function getPlayers() {
  return players || [];
}

// Walk the command tree given an array of tokens and return valid completions
// for the last (possibly partial) token.
function resolveCompletions(tokens) {
  if (!tokens.length) return [];

  const partial = tokens[tokens.length - 1];
  const prior = tokens.slice(0, -1);

  // Typing the command name itself
  if (prior.length === 0) {
    return Object.keys(COMMANDS).filter(c => c.startsWith(partial) && c !== partial);
  }

  const cmdName = prior[0];
  const cmdDef = COMMANDS[cmdName];
  if (!cmdDef) return [];

  // Walk down the tree following prior tokens after the command name.
  // If a token matches '<player>', resolve against live player list.
  let node = cmdDef;
  for (const tok of prior.slice(1)) {
    if (!node) return [];
    const playerList = getPlayers();

    if (playerList.includes(tok) && node['<player>']) {
      node = node['<player>'];
    } else if (node[tok]) {
      node = node[tok];
    } else if (node['<player>']) {
      node = node['<player>'];
    } else {
      return [];
    }
  }

  if (!node || !node.sub) return [];

  // Resolve the sub list — replace '<player>' with live names, '<items>' with item list
  const candidates = node.sub === '<items>'
    ? ITEMS
    : node.sub.flatMap(s => {
        if (s === '<player>') return getPlayers();
        return [s];
      });

  return candidates.filter(c => c.startsWith(partial) && c !== partial);
}

// Returns the suffix to append for ghost text (desktop).
export function getGhostSuggestion(value) {
  if (!value.trim()) return '';
  const tokens = value.split(' ');
  const completions = resolveCompletions(tokens);
  if (!completions.length) return '';
  return completions[0].slice(tokens[tokens.length - 1].length);
}

// Returns up to 6 completions for the mobile suggestion bar.
export function getSuggestions(value) {
  if (!value.trim()) return [];
  return resolveCompletions(value.split(' ')).slice(0, 6);
}

// Wire up the input element for desktop (ghost text, Tab to accept).
export function initDesktop(inputEl) {
  let currentSuffix = '';

  function update() {
    const ghostTyped = document.getElementById('ghost-typed');
    const ghostSuggestion = document.getElementById('ghost-suggestion');
    if (!ghostTyped || !ghostSuggestion) return;

    const val = inputEl.value;
    if (!val) {
      ghostTyped.textContent = '';
      ghostSuggestion.textContent = '';
      currentSuffix = '';
      return;
    }

    const suffix = getGhostSuggestion(val);
    currentSuffix = suffix;
    ghostTyped.textContent = val;
    ghostSuggestion.textContent = suffix;
  }

  function accept() {
    if (!currentSuffix) return;
    inputEl.value = inputEl.value + currentSuffix + ' ';
    update();
  }

  inputEl.addEventListener('input', update);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); accept(); }
  });
}

// Wire up the suggestion bar for mobile.
export function initMobile(inputEl, serverUUID) {
  const bar = document.getElementById('suggestion-bar');
  const list = document.getElementById('suggestion-list');
  if (!bar || !list) return;

  function update() {
    const matches = getSuggestions(inputEl.value);
    if (!matches.length) { bar.classList.add('hidden'); return; }

    bar.classList.remove('hidden');
    list.innerHTML = '';
    matches.forEach(match => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shrink-0 px-2.5 py-1 rounded-md bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-mono transition-colors whitespace-nowrap';
      btn.textContent = match;
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const tokens = inputEl.value.split(' ');
        tokens[tokens.length - 1] = match;
        inputEl.value = tokens.join(' ') + ' ';
        bar.classList.add('hidden');
        inputEl.focus();
        update();
      });
      list.appendChild(btn);
    });
  }

  inputEl.addEventListener('input', update);
  inputEl.addEventListener('blur', () => setTimeout(() => bar.classList.add('hidden'), 150));
  inputEl.addEventListener('focus', () => { if (inputEl.value) update(); });
}
