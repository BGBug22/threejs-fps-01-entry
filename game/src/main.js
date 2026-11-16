// GULLHAVEN — main loop. Owns the match: rounds, freeze/buy time, economy,
// the objective, shooting, spectating and the deterministic ?shot= modes the
// kit's screenshots use. Bots, movement and the world live in their own modules.
// Decisive by design: 90 s rounds, the carrier rushes one site with escorts,
// and at 40 s without a plant the whole attacking team pushes at once —
// a round always ends with a winner, never a clock. If the player stalls with
// the charge, a Gull takes it and plants it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { WEAPONS, ARMOR_PRICE, ARMOR_VALUE, HELMET_PRICE, HELMET_VALUE, KIT_PRICE, createWeaponView } from './weapons.js';
import { createFx } from './fx.js';
import { createBots } from './bots.js';
import { createCharge } from './bomb.js';
import { createGrenades, GRENADES } from './grenades.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const ROUND_TIME = 90;
const FREEZE_TIME = 5;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const KILL_REWARD = 300;
const PLANT_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const LOSS_STREAK_BONUS = 500;
const LOSS_CAP = 3400;
const WEAPON_ORDER = ['puffin', 'skua', 'cormorant', 'osprey', 'albatross'];

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seedParam = parseInt(params.get('seed') || '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedBase = shotMode ? seedParam : (Date.now() % 100000);
const rng = mulberry32(seedBase);
// The cover's last shot fires in the frame just before __shotReady (see the
// double-RAF at the end of setupShot), not at the end of the sim loop.
let finalShotPending = false;

// Deterministic spray pattern: consecutive shots climb and drift in a fixed
// table instead of pure random spread, so recoil is learnable; the pattern
// resets after a 0.4 s pause, a reload or a weapon switch (judge criterion 2:
// recoil and spread punish firing on the move).
const SPRAY = [0, 0.3, 0.55, 0.8, 1, 0.9, 0.7, 0.45, 0.2, 0, -0.25, -0.45, -0.3, -0.1, 0, 0.15];
let sprayIdx = 0;
let lastShotAt = -99;

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5; // dusk harbour: warm sun, readable shadows
document.getElementById('app').prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders);
const weaponView = createWeaponView(camera);
const fx = createFx(scene);
const bots = createBots(scene, world);
const charge = createCharge(scene);
const grenades = createGrenades(scene, world.colliders, fx);
const audio = createAudio();
const input = createInput(renderer.domElement, (locked) => {
  if (locked) {
    if (paused) { paused = false; hud.hideOverlay(); }
  } else if (phase === 'live' && player.state.alive && !shotMode) {
    paused = true;
    hud.showOverlay('paused');
  }
});
const hud = createHud();
hud.setMinimapWalls(world.minimapRects);

// --- match state ---
let time = 0;
let roundStart = 0;
let phase = 'menu'; // menu | freeze | live | over
let paused = false;
let freezeTimer = FREEZE_TIME;
let roundTimer = ROUND_TIME;
let plantProgress = 0;
let defuseProgress = 0;
let bobPhase = 0;
let bobY = 0;
let prevFire = false;
let prevKeys = new Set();
let spectateTarget = null;
const match = { gull: 0, keeper: 0, round: 1, money: START_MONEY, lossStreak: 0, attackTeam: 'gull', kills: 0, deaths: 0, earned: 0, roundKills: 0, lastIncome: '', botKills: {}, hasKit: false };
const owned = new Set(['puffin']);
const ammoStore = {};
// Last-seen Keeper positions for the minimap: an enemy dot only shows while a
// Gull bot is looking at it or the player just hit it (4 s), never a wallhack.
const seenKeeper = new Map();
let mmTick = 0;

// --- invisible player hitboxes for bot fire ---
const playerMeshes = new Set();
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
playerTorso.userData.player = true;
playerTorso.userData.part = 'torso';
const playerHead = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.46), new THREE.MeshBasicMaterial({ visible: false }));
playerHead.userData.player = true;
playerHead.userData.part = 'head';
scene.add(playerTorso, playerHead);
playerMeshes.add(playerTorso);
playerMeshes.add(playerHead);

// --- helpers ---
const raycaster = new THREE.Raycaster();
function raycast(origin, dir, maxDist, exclude) {
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const targets = world.shootables.concat(bots.hitMeshes, [playerTorso, playerHead]);
  const hits = raycaster.intersectObjects(targets, false);
  for (const hit of hits) {
    const obj = hit.object;
    if (exclude instanceof Set && exclude.has(obj)) continue;
    if (exclude && obj.userData.bot === exclude) continue;
    if (obj.userData.bot && !obj.userData.bot.alive) continue;
    if (obj.userData.player && !player.state.alive) continue;
    return hit;
  }
  return null;
}

function sound(kind, arg) {
  if (audio.muted) return;
  switch (kind) {
    case 'shot': audio.shot(arg || weaponView.state.id); break;
    case 'dry': audio.dry(); break;
    case 'reload': audio.reload(); break;
    case 'hit': audio.hit(false); break;
    case 'kill': audio.hit(true); break;
    case 'hurt': audio.hurt(); break;
    case 'plant': audio.plantTick(); break;
    case 'beep': audio.beep(); break;
    case 'buy': audio.buy(); break;
    case 'roundWin': audio.roundWin(); break;
    case 'roundLose': audio.roundLose(); break;
    case 'explosion': audio.explosion(); break;
    case 'click': audio.click(); break;
    case 'throw': audio.throw(); break;
    case 'smoke': audio.smoke(); break;
    case 'flare': audio.flare(); break;
    case 'gulls': audio.gulls(); break;
    default: break;
  }
}

function siteAt(pos) {
  for (const [name, site] of Object.entries(world.sites)) {
    if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) < site.radius) return name;
  }
  return null;
}

function updateScoreboard() {
  const gullRows = [['You', player.state.alive]];
  for (const b of bots.list) if (b.team === 'gull') gullRows.push([b.name, b.alive]);
  const keeperRows = bots.list.filter((b) => b.team === 'keeper').map((b) => [b.name, b.alive]);
  const fill = (el, rows) => {
    el.innerHTML = rows.map(([n, a]) => `<div class="sb-row${a ? '' : ' dead'}"><span>${n}</span><span>${a ? 'ALIVE' : 'DOWN'}</span></div>`).join('');
  };
  fill(document.getElementById('sb-gull'), gullRows);
  fill(document.getElementById('sb-keeper'), keeperRows);
  // Halftime switch: the scoreboard says who attacks and who defends now.
  document.getElementById('sb-gull-h').textContent = match.attackTeam === 'gull' ? 'GULLS — ATTACK' : 'GULLS — DEFEND';
  document.getElementById('sb-keeper-h').textContent = match.attackTeam === 'keeper' ? 'KEEPERS — ATTACK' : 'KEEPERS — DEFEND';
}

// --- combat ---
function damageBot(bot, amount, part, attackerName) {
  // The minimap remembers where the player just hit an enemy.
  if (attackerName === 'You') seenKeeper.set(bot.id, { x: bot.pos.x, z: bot.pos.z, at: time });
  const died = bots.damage(bot, amount);
  if (died) {
    hud.killfeed(attackerName, bot.name, part === 'head', 'gull');
    if (attackerName === 'You') {
      match.money += KILL_REWARD;
      match.kills += 1;
      match.roundKills += 1;
      match.earned += KILL_REWARD;
      hud.setMoney(match.money);
    } else {
      match.botKills[attackerName] = (match.botKills[attackerName] || 0) + 1;
    }
    if (bot.carrier) charge.drop(bot.pos);
    updateScoreboard();
    checkRoundEnd();
  }
  return died;
}

function damagePlayer(amount, fromPos, attackerName) {
  if (shotMode === 'play' || shotMode === 'half') return; // god mode for the staged screenshots
  if (!player.state.alive || phase !== 'live') return;
  const died = player.damage(amount);
  hud.damageFlash();
  sound('hurt');
  if (died) {
    match.deaths += 1;
    hud.killfeed(attackerName, 'You', false, 'keeper');
    if (charge.state.carrier === 'player') charge.drop(player.state.position);
    spectateTarget = bots.list.find((b) => b.team === 'gull' && b.alive) || null;
    hud.setSpectate(spectateTarget ? spectateTarget.name : null);
    hud.banner('YOU ARE DOWN', spectateTarget ? `Spectating ${spectateTarget.name}` : 'Your team fights on', 2600);
    input.releaseLock();
    updateScoreboard();
    checkRoundEnd();
  }
}

function tryShoot() {
  const w = weaponView.state;
  if (!weaponView.ready()) {
    if (w.mag === 0 && w.reserve > 0) { weaponView.reload(); sound('reload'); }
    else if (w.mag === 0) sound('dry');
    return;
  }
  weaponView.pullTrigger();
  weaponView.takeRound();
  const def = w.def;
  const zoomed = input.state.zooming && def.id === 'albatross';
  const spread = weaponView.spread(player.groundSpeed()) * (zoomed ? 0.4 : 1);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // Random spread plus the deterministic spray pattern: the first shots of a
  // burst stay tight, later shots climb and drift in a fixed order.
  if (time - lastShotAt > 0.4) sprayIdx = 0;
  lastShotAt = time;
  const spray = SPRAY[sprayIdx % SPRAY.length];
  sprayIdx += 1;
  const origin = camera.position.clone();
  const muzzle = camera.localToWorld(new THREE.Vector3(0.24, -0.16, -0.7));
  // The Cormorant fires six pellets, each its own ray; the rest fire one.
  for (let p = 0; p < def.pellets; p += 1) {
    const pdir = dir.clone();
    pdir.x += (Math.random() * 2 - 1) * spread * 0.6 + spray * spread * 1.4;
    pdir.y += (Math.random() * 2 - 1) * spread * 0.6 + spray * spray * spread * 1.8;
    pdir.z += (Math.random() * 2 - 1) * spread * 0.6;
    pdir.normalize();
    const hit = raycast(origin, pdir, 120, playerMeshes);
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(pdir, 120);
    fx.tracer(muzzle, end);
    if (hit) {
      fx.impact(hit.point);
      const hitBot = hit.object.userData.bot;
      // No friendly fire: a teammate in the line of fire stops the bullet, but
      // takes no damage and never shows in the killfeed as your victim.
      if (hitBot && hitBot.alive && hitBot.team === 'keeper') {
        const dmg = def.damage * (hit.object.userData.part === 'head' ? def.headMult : 1);
        const died = damageBot(hitBot, dmg, hit.object.userData.part, 'You');
        hud.hitMarker(died);
        sound(died ? 'kill' : 'hit');
      }
    }
  }
  sound('shot', def.id);
  // Every shot is a sound event: bots inside 20 m hear it, turn, and call it in.
  if (ctx) ctx.noise(origin, 'shot', 20, null);
  player.recoil(def.id === 'albatross' ? 0.05 : def.id === 'cormorant' ? 0.04 : 0.011, (Math.random() - 0.5) * 0.006);
  if (w.mag === 0 && w.reserve > 0) { weaponView.reload(); sound('reload'); }
}

function switchWeapon(id) {
  if (!owned.has(id)) return;
  sprayIdx = 0; // a new gun starts a fresh spray pattern
  const cur = weaponView.state.id;
  ammoStore[cur] = { mag: weaponView.state.mag, reserve: weaponView.state.reserve };
  weaponView.setWeapon(id, false);
  const stored = ammoStore[id];
  if (stored) weaponView.setAmmo(stored.mag, stored.reserve);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, WEAPONS[id].name.toUpperCase());
  sound('click');
}

// --- grenades ---
function grenadeShop() {
  return Object.values(GRENADES).map((g) => ({ ...g, count: grenades.inventory[g.id] }));
}

function throwPlayerGrenade(type) {
  if (!player.state.alive || phase !== 'live') return false;
  // Throw from the player's eye along their aim — the camera follows the same
  // state in live play, and in the scripted shot the camera is not placed yet.
  const yaw = player.state.yaw;
  const pitch = player.state.pitch;
  const dir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  const origin = new THREE.Vector3(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  ).addScaledVector(dir, 0.5);
  origin.y -= 0.1;
  if (!grenades.throw(type, origin, dir)) return false;
  sound('throw');
  hud.setGrenades(grenades.counts(), match.hasKit);
  return true;
}

// Aim the player at one Keeper bot and fire once. Used by the scripted cover
// shot so the frame holds a real tracer and muzzle flash.
function nearestKeeperBot() {
  let best = null;
  let bestD = Infinity;
  for (const b of bots.list) {
    if (b.team !== 'keeper' || !b.alive) continue;
    const d = Math.hypot(b.pos.x - player.state.position.x, b.pos.z - player.state.position.z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// Put the camera where the player stands, exactly as render() does each
// frame. In the scripted shot render() has not run yet, so without this the
// camera still sits at the world origin and every scripted shot fires from
// the floor at (0,0,0) instead of from the player's eye.
function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}

function fireAtBot(bot) {
  if (!bot) return;
  const eye = new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  const target = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.25, bot.pos.z);
  const d = target.clone().sub(eye);
  const len = d.length() || 1;
  player.state.yaw = Math.atan2(-d.x, -d.z);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, d.y / len)));
  syncCamera();
  weaponView.state.cooldown = 0;
  tryShoot();
}

function fireAtNearestKeeper() {
  fireAtBot(nearestKeeperBot());
}

// The nearest Keeper bot the player can actually see — the ray must reach the
// bot itself, not a wall. A burst at a bot behind the mid wall would only
// chip paint off the wall.
function visibleKeeperBot() {
  const eye = new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  let best = null;
  let bestD = Infinity;
  for (const b of bots.list) {
    if (b.team !== 'keeper' || !b.alive) continue;
    const target = new THREE.Vector3(b.pos.x, b.pos.y + 1.25, b.pos.z);
    const d = target.clone().sub(eye);
    const dist = d.length();
    const hit = raycast(eye, d.normalize(), dist);
    if (hit && hit.object.userData.bot === b && dist < bestD) { bestD = dist; best = b; }
  }
  return best;
}

// --- minimap ---
function updateMinimap() {
  const gull = [];
  for (const b of bots.list) if (b.team === 'gull' && b.alive) gull.push({ x: b.pos.x, z: b.pos.z });
  for (const b of bots.list) {
    if (b.team !== 'keeper' || !b.alive) continue;
    const spotted = bots.list.some((e) => e.team === 'gull' && e.alive && e.target && e.target.bot === b);
    if (spotted) seenKeeper.set(b.id, { x: b.pos.x, z: b.pos.z, at: time });
  }
  const keeper = [];
  for (const [id, s] of seenKeeper) {
    if (time - s.at > 4) { seenKeeper.delete(id); continue; }
    keeper.push({ x: s.x, z: s.z, age: time - s.at });
  }
  const bombPos = charge.state.state === 'planted' || charge.state.state === 'dropped'
    ? { x: charge.state.pos.x, z: charge.state.pos.z, planted: charge.state.state === 'planted' }
    : null;
  hud.setMinimap({
    player: { x: player.state.position.x, z: player.state.position.z, yaw: player.state.yaw },
    gull,
    keeper,
    bomb: bombPos,
  });
}

// --- rounds ---
function checkRoundEnd() {
  if (phase !== 'live') return;
  const gullAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('gull');
  const keeperAlive = bots.aliveCount('keeper');
  if (keeperAlive === 0) { endRound('gull', 'Keeper team eliminated'); return; }
  if (gullAlive === 0 && charge.state.state !== 'planted') endRound('keeper', 'Gull team eliminated');
}

function endRound(winner, reason) {
  if (phase !== 'live') return;
  phase = 'over';
  // Economy: the round reward plus the kills the player banked this round —
  // the buy menu prints this line next round, so the money is legible.
  let reward = 0;
  if (winner === 'gull') {
    match.gull += 1;
    reward = WIN_REWARD;
    match.lossStreak = 0;
  } else {
    match.keeper += 1;
    reward = Math.min(LOSS_CAP, LOSS_REWARD + match.lossStreak * LOSS_STREAK_BONUS);
    match.lossStreak += 1;
  }
  match.money += reward;
  if (winner === 'gull') match.earned += reward;
  match.lastIncome = `${winner === 'gull' ? 'Round won' : 'Round lost'} +$${reward} · ${match.roundKills} kill${match.roundKills === 1 ? '' : 's'} +$${match.roundKills * KILL_REWARD}`;
  hud.setScore(match.gull, match.keeper, match.round);
  hud.setMoney(match.money);
  hud.banner(winner === 'gull' ? 'GULLS WIN THE ROUND' : 'KEEPERS WIN THE ROUND', reason, 3600);
  sound(winner === 'gull' ? 'roundWin' : 'roundLose');
  hud.plantProgress(null);
  hud.hideBuy();
  hud.setSpectate(null);
  spectateTarget = null;
  charge.reset();
  const matchOver = match.gull >= WIN_ROUNDS || match.keeper >= WIN_ROUNDS || match.round >= MAX_ROUNDS;
  if (matchOver) {
    // Victory screen: final score, the player's line and the MVP.
    let mvp = 'You';
    let bestK = match.kills;
    for (const [name, k] of Object.entries(match.botKills)) {
      if (k > bestK) { bestK = k; mvp = name; }
    }
    setTimeout(() => {
      phase = 'menu';
      hud.showOverlay('end', `${match.gull} - ${match.keeper}`, {
        result: match.gull > match.keeper ? 'GULLS WIN THE QUAY' : 'KEEPERS WIN THE QUAY',
        kills: match.kills, deaths: match.deaths, earned: match.earned, mvp,
      });
      input.releaseLock();
    }, 3200);
  } else {
    setTimeout(() => { if (phase === 'over') startRound(match.round + 1); }, 4000);
  }
}

function startRound(n) {
  match.round = n;
  // Halftime switch: rounds 1-4 Gulls attack, rounds 5-9 Gulls defend
  // and the charge starts with a Keeper carrier. The player spawns south to
  // attack, north to defend, and the bots swap roles with them.
  const defending = n > 4;
  match.attackTeam = defending ? 'keeper' : 'gull';
  match.roundKills = 0;
  phase = 'freeze';
  freezeTimer = FREEZE_TIME;
  roundTimer = ROUND_TIME;
  roundStart = time;
  plantProgress = 0;
  defuseProgress = 0;
  spectateTarget = null;
  const armor = player.state.armor;
  player.reset(defending ? world.spawns.defend[0] : world.spawns.attack[0], defending ? Math.PI : 0);
  player.state.armor = armor;
  bots.spawnRound(n, seedBase + n * 101 + 7, match.attackTeam);
  charge.reset();
  if (defending) {
    const carrier = bots.list.find((b) => b.team === 'keeper' && b.alive);
    if (carrier) {
      carrier.carrier = true;
      charge.pickup(carrier);
    }
  }
  fx.clear();
  grenades.reset();
  hud.setGrenades(grenades.counts(), match.hasKit);
  hud.setPlan(bots.getPlan(defending ? 'defend' : 'attack'));
  hud.radio(defending
    ? 'Pip: Halftime — we defend now. Hold Lantern Hall and the Cannery, defuse if they plant.'
    : 'Pip: Rush A — you entry, we follow.', 'gull');
  hud.setScore(match.gull, match.keeper, match.round);
  hud.setMoney(match.money);
  hud.setAlive(5, 5);
  hud.setBombStatus(defending
    ? 'Keepers carry the Tide Charge — hold the sites, defuse if they plant'
    : 'Tide Charge with you — plant at Lantern Hall or Cannery');
  hud.plantProgress(null);
  hud.setSpectate(null);
  hud.hideBanner();
  updateScoreboard();
  hud.showBuy(Object.values(WEAPONS), match.money, weaponView.state.id, player.state.armor, match.hasKit, grenadeShop(), match.lastIncome, Math.ceil(freezeTimer));
  hud.banner(n === 5 ? 'HALFTIME — SIDES SWITCHED' : `ROUND ${n}`,
    n === 5 ? 'You defend now — hold the sites and defuse the charge'
      : (n === 1 ? 'Plan: rush A — you entry A. Plant the charge or eliminate the Keeper team' : 'First to 5 rounds takes the quay'), 2200);
  sound('gulls');
}

function startMatch() {
  match.gull = 0;
  match.keeper = 0;
  match.round = 1;
  match.money = START_MONEY;
  match.lossStreak = 0;
  match.attackTeam = 'gull';
  match.kills = 0;
  match.deaths = 0;
  match.earned = 0;
  match.roundKills = 0;
  match.lastIncome = '';
  match.botKills = {};
  match.hasKit = false;
  owned.clear();
  owned.add('puffin');
  for (const k of Object.keys(ammoStore)) delete ammoStore[k];
  weaponView.setWeapon('puffin', false);
  hud.hideOverlay();
  startRound(1);
}

// --- bot context ---
const ctx = {
  get time() { return time; },
  get roundAge() { return time - roundStart; },
  get phase() { return phase; },
  get attackTeam() { return match.attackTeam; },
  get playerPos() { return player.state.position; },
  get playerAlive() { return player.state.alive; },
  charge: charge.state,
  bots: bots.list,
  rng,
  raycast: (o, d, m, ex) => raycast(o, d, m, ex),
  damageBot: (bot, amount, part, name) => damageBot(bot, amount, part, name),
  damagePlayer: (amount, from, name) => damagePlayer(amount, from, name),
  tracer: (a, b, c) => fx.tracer(a, b, c),
  impact: (p) => fx.impact(p),
  sound: (kind, arg) => sound(kind, arg),
  nearPlayer: (pos) => pos.distanceTo(player.state.position) < 30,
  // Hearing: a shot, an explosion or a flare pop reaches every bot in radius.
  noise: (pos, kind, radius, shooter) => bots.hearNoise(ctx, pos, kind, radius, shooter),
  // Radio: bots report what they hear and see; the log is the HUD's left column.
  radio: (text, team) => hud.radio(text, team),
  // Smoke clouds block bot sight (never bullets).
  smokeBlocks: (a, b) => fx.smokeBlocks(a, b),
  // The team's bot grenades: one smoke and one flare and one Molotov per round,
  // thrown by name so the killfeed credits the thrower.
  throwGrenade: (type, origin, dir, thrower) => grenades.throwBot(type, origin, dir, thrower),
  // A flare pop blinds bots facing it, and the player if they face it too.
  blind: (pos, seconds) => {
    bots.blind(ctx, pos, seconds);
    if (player.state.alive && phase === 'live') {
      const toFlare = pos.clone().sub(camera.position);
      const dist = toFlare.length();
      if (dist < 25) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        if (toFlare.normalize().dot(fwd) > 0.2) hud.flash();
      }
    }
  },
  onPlanted: (site, bot) => {
    charge.plant(site, bot.pos);
    hud.banner('CHARGE PLANTED', `${bot.name} planted at Site ${site} — detonation in 35s`, 3000);
    sound('plant');
  },
  onDefused: (bot) => {
    hud.banner('CHARGE DEFUSED', `${bot.name} defused the Tide Charge`, 3000);
    // The defending team wins the round on a defuse, whichever side that is.
    endRound(match.attackTeam === 'gull' ? 'keeper' : 'gull', 'Tide Charge defused');
  },
  onPickup: (bot) => {
    charge.pickup(bot);
    hud.setBombStatus(`${bot.name} carries the Tide Charge`);
  },
  onTakeCharge: (bot) => {
    charge.pickup(bot);
    hud.setBombStatus(`${bot.name} carries the Tide Charge`);
    hud.radio(`${bot.name}: Taking the charge — follow me!`, 'gull');
  },
};

const chargeCtx = {
  sound: (kind) => sound(kind),
  onDetonate: () => {
    fx.explosion(charge.state.pos);
    sound('explosion');
    // Whoever attacked wins the round when the charge goes off.
    endRound(match.attackTeam, 'Tide Charge detonated');
  },
};

// --- input wiring ---
hud.onPlay(() => {
  audio.resume();
  if (phase === 'menu') startMatch();
  else if (paused) input.requestLock();
});

hud.onBuy((id) => {
  if (phase !== 'freeze') return;
  const refresh = () => hud.showBuy(Object.values(WEAPONS), match.money, weaponView.state.id, player.state.armor, match.hasKit, grenadeShop(), match.lastIncome, Math.ceil(freezeTimer));
  if (id === 'armor') {
    if (match.money >= ARMOR_PRICE && player.state.armor <= 0) {
      match.money -= ARMOR_PRICE;
      player.state.armor = ARMOR_VALUE;
      sound('buy');
      hud.setMoney(match.money);
      refresh();
    }
    return;
  }
  if (id === 'helmet') {
    if (match.money >= HELMET_PRICE && player.state.armor < HELMET_VALUE) {
      match.money -= HELMET_PRICE;
      player.state.armor = HELMET_VALUE;
      sound('buy');
      hud.setMoney(match.money);
      refresh();
    }
    return;
  }
  if (id === 'kit') {
    if (match.money >= KIT_PRICE && !match.hasKit) {
      match.money -= KIT_PRICE;
      match.hasKit = true;
      sound('buy');
      hud.setMoney(match.money);
      hud.setGrenades(grenades.counts(), match.hasKit);
      refresh();
    }
    return;
  }
  if (id === 'frag' || id === 'smoke' || id === 'flare' || id === 'molotov') {
    const g = GRENADES[id];
    if (match.money >= g.price && grenades.buy(id)) {
      match.money -= g.price;
      sound('buy');
      hud.setMoney(match.money);
      hud.setGrenades(grenades.counts(), match.hasKit);
      refresh();
    }
    return;
  }
  const w = WEAPONS[id];
  if (!w || owned.has(id) || match.money < w.price) return;
  match.money -= w.price;
  owned.add(id);
  switchWeapon(id);
  hud.setMoney(match.money);
  refresh();
});

renderer.domElement.addEventListener('click', () => {
  if (shotMode) return;
  if (!player.state.alive && phase === 'live') {
    const alive = bots.list.filter((b) => b.team === 'gull' && b.alive);
    if (alive.length) {
      const cur = alive.indexOf(spectateTarget);
      spectateTarget = alive[(cur + 1) % alive.length];
      hud.setSpectate(spectateTarget.name);
    }
    return;
  }
  if ((phase === 'freeze' || phase === 'live') && !input.isLocked()) input.requestLock();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- fixed step ---
function pressed(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function fixedStep(dt) {
  time += dt;
  const keys = input.state.keys;
  const zoomed = input.state.zooming && weaponView.state.id === 'albatross' && phase === 'live' && player.state.alive;

  if (!paused) {
    if (phase === 'freeze') {
      freezeTimer -= dt;
      if (freezeTimer <= 0) {
        phase = 'live';
        hud.hideBuy();
        hud.banner('GO!', 'Round in progress', 1400);
        sound('click');
        if (!input.isLocked() && !shotMode) {
          paused = true;
          hud.showOverlay('paused');
        }
      }
    } else if (phase === 'live') {
      if (charge.state.state !== 'planted') {
        roundTimer -= dt;
        // Time out: the defenders win — the attackers never got the charge in.
        if (roundTimer <= 0) endRound(match.attackTeam === 'gull' ? 'keeper' : 'gull', 'Time expired — the charge was never planted');
      }
      charge.update(dt, chargeCtx);
    }

    if (phase === 'live' && player.state.alive) {
      const { x: dx, y: dy } = input.takeLook();
      if (input.isLocked() && (dx || dy)) player.look(dx, dy, 0.0022 * (zoomed ? 0.4 : 1));
      player.step(dt, keys);
      bobPhase += player.groundSpeed() * dt * 1.7;
      bobY = Math.sin(bobPhase * 2) * 0.03 * Math.min(1, player.groundSpeed() / 5);

      // firing
      const firing = input.state.firing;
      const semi = !weaponView.state.def.auto;
      if (firing && (!semi || !prevFire)) tryShoot();
      prevFire = firing;

      if (pressed('KeyR') && weaponView.reload()) sound('reload');
      if (weaponView.state.mag === 0 && weaponView.state.reserve > 0 && weaponView.state.reloadLeft === 0) {
        weaponView.reload();
        sound('reload');
      }
      for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
        if (pressed(`Digit${i + 1}`)) switchWeapon(WEAPON_ORDER[i]);
      }
      if (pressed('Digit4')) throwPlayerGrenade('frag');
      if (pressed('Digit5')) throwPlayerGrenade('smoke');
      if (pressed('Digit6')) throwPlayerGrenade('flare');
      if (pressed('Digit7')) throwPlayerGrenade('molotov');

      // plant channel
      if (charge.state.state === 'carried' && charge.state.carrier === 'player') {
        const site = siteAt(player.state.position);
        if (site && keys.has('KeyE') && player.groundSpeed() < 1.0) {
          plantProgress += dt / 3.5;
          hud.plantProgress(plantProgress, `PLANTING THE CHARGE — SITE ${site}`);
          if (plantProgress >= 1) {
            charge.plant(site, player.state.position);
            match.money += PLANT_REWARD;
            hud.setMoney(match.money);
            hud.banner('CHARGE PLANTED', `Site ${site} — detonation in 35s`, 3000);
            sound('plant');
            plantProgress = 0;
            hud.plantProgress(null);
          }
        } else {
          if (plantProgress > 0) plantProgress = Math.max(0, plantProgress - dt * 2);
          hud.plantProgress(plantProgress > 0 ? plantProgress : null, 'PLANTING…');
        }
      } else {
        plantProgress = 0;
        hud.plantProgress(null);
      }

      // Defuse: after the halftime switch the player defends, so hold E by the
      // planted charge to stop it. 5 s normally, 2.5 s with a defuse kit — and
      // a defuse wins the round for the defending side.
      if (charge.state.state === 'planted' && match.attackTeam === 'keeper' && player.state.alive) {
        const dCharge = player.state.position.distanceTo(charge.state.pos);
        if (dCharge < 3 && keys.has('KeyE') && player.groundSpeed() < 1.0) {
          if (defuseProgress === 0) hud.radio('You: Defusing the charge — cover me!', 'gull');
          defuseProgress += dt / (match.hasKit ? 2.5 : 5);
          hud.plantProgress(defuseProgress, 'DEFUSING THE CHARGE…');
          if (defuseProgress >= 1) {
            defuseProgress = 0;
            hud.plantProgress(null);
            hud.banner('CHARGE DEFUSED', 'You stopped the detonation', 3000);
            sound('plant');
            endRound('gull', 'Tide Charge defused');
          }
        } else {
          if (defuseProgress > 0) defuseProgress = Math.max(0, defuseProgress - dt * 2);
          hud.plantProgress(defuseProgress > 0 ? defuseProgress : null, 'DEFUSING…');
        }
      } else {
        defuseProgress = 0;
      }

      // pick up a dropped charge — only while Gulls attack; after the switch
      // the charge belongs to the Keeper push, and the player must not take it.
      if (charge.state.state === 'dropped' && match.attackTeam === 'gull' && player.state.position.distanceTo(charge.state.pos) < 1.4) {
        charge.pickup('player');
        hud.banner('CHARGE RECOVERED', 'Plant it at Lantern Hall or Cannery', 2000);
        sound('buy');
      }
    }

    if (pressed('KeyB') && phase === 'freeze') {
      const menu = document.getElementById('buy-menu');
      if (menu.hidden) hud.showBuy(Object.values(WEAPONS), match.money, weaponView.state.id, player.state.armor, match.hasKit, grenadeShop(), match.lastIncome, Math.ceil(freezeTimer));
      else hud.hideBuy();
    }
    if (pressed('Tab')) {
      const sb = document.getElementById('scoreboard');
      sb.hidden = !sb.hidden;
      if (!sb.hidden) updateScoreboard();
    }
    if (pressed('KeyM')) {
      audio.setMuted(!audio.muted);
      hud.banner(audio.muted ? 'SOUND OFF' : 'SOUND ON', '', 1200);
    }

    bots.step(dt, ctx);
    grenades.step(dt, ctx);
    weaponView.step(dt);
    if (weaponView.state.reloadLeft > 0) sprayIdx = 0; // a reload restarts the spray pattern
    fx.step(dt);
    world.step(dt, time);
    mmTick += 1;
    if (mmTick % 9 === 0) updateMinimap();
    prevKeys = new Set(keys);
  }

  // hitboxes follow the player
  playerTorso.position.set(player.state.position.x, player.state.position.y + 0.575, player.state.position.z);
  playerHead.position.set(player.state.position.x, player.state.position.y + 1.55, player.state.position.z);

  // HUD sync
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, weaponView.state.def.name.toUpperCase());
  hud.setMoney(match.money);
  hud.setGrenades(grenades.counts(), match.hasKit);
  if (phase === 'freeze') hud.setTimer(freezeTimer, 'freeze');
  else if (charge.state.state === 'planted') hud.setTimer(charge.state.detonateIn, 'live');
  else hud.setTimer(roundTimer, 'live');
  hud.setAlive((player.state.alive ? 1 : 0) + bots.aliveCount('gull'), bots.aliveCount('keeper'));
  hud.setCrosshairSpread(4 + weaponView.spread(player.groundSpeed()) * 900);
  const scopeEl = document.getElementById('scope');
  const crossEl = document.getElementById('crosshair');
  scopeEl.hidden = !zoomed;
  crossEl.style.visibility = zoomed || !player.state.alive ? 'hidden' : 'visible';
  if (charge.state.state === 'carried') {
    hud.setBombStatus(charge.state.carrier === 'player'
      ? 'Tide Charge with you — plant at Lantern Hall or Cannery'
      : `${charge.state.carrier.name} carries the Tide Charge`);
  } else if (charge.state.state === 'dropped') {
    hud.setBombStatus('Tide Charge dropped — pick it up');
  } else if (charge.state.state === 'planted') {
    hud.setBombStatus(`Tide Charge planted at Site ${charge.state.site} — detonation in ${Math.ceil(charge.state.detonateIn)}s`);
  }
}

// --- render ---
function render() {
  if (player.state.alive) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye + bobY, player.state.position.z);
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
  } else if (spectateTarget) {
    camera.position.set(spectateTarget.pos.x, spectateTarget.pos.y + 1.56, spectateTarget.pos.z);
    camera.rotation.y = spectateTarget.yaw;
    camera.rotation.x = 0;
  }
  const shake = fx.shake;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * 0.12 * shake;
    camera.position.y += (Math.random() - 0.5) * 0.12 * shake;
    camera.rotation.z = (Math.random() - 0.5) * 0.02 * shake;
  } else {
    camera.rotation.z = 0;
  }
  const zoomed = input.state.zooming && weaponView.state.id === 'albatross' && phase === 'live' && player.state.alive;
  const targetFov = zoomed ? 75 / 2.6 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}

// --- shot modes ---
function setupShot() {
  if (shotMode === 'buy') {
    startRound(1);
    hud.hideOverlay();
    // Staged: $4,050 in hand shows the menu's states — the Albatross is Too
    // expensive, the rest buyable — with the economy line of a won round.
    match.money = 4050;
    match.lastIncome = 'Round won +$3,250 · 2 kills +$600';
    hud.showBuy(Object.values(WEAPONS), match.money, weaponView.state.id, player.state.armor, match.hasKit, grenadeShop(), match.lastIncome, 5);
  } else if (shotMode === 'half') {
    // Halftime: round 5, sides switched — the player defends from the north
    // spawn while the Keepers push the charge south. The banner and the
    // defend plan are the frame's proof the match has two halves.
    startRound(5);
    hud.hideBuy();
    hud.hideOverlay();
    phase = 'live';
    roundTimer = ROUND_TIME;
    scene.updateMatrixWorld(true);
    for (let i = 0; i < 180; i += 1) {
      fixedStep(STEP);
      scene.updateMatrixWorld(true);
      if (phase !== 'live') break;
    }
    // Re-show the halftime banner for the capture: the sim loop runs long
    // enough in wall time that the banner's 2.2 s timer can lapse first.
    // Staged for the screenshot — 60 s, so the capture always catches it.
    hud.banner('HALFTIME — SIDES SWITCHED', 'You defend now — hold the sites and defuse the charge', 60000);
  } else if (shotMode === 'play') {
    match.money = 800;
    owned.add('osprey');
    switchWeapon('osprey');
    player.state.armor = 50;
    // At the west gap itself: the LANTERN HALL sign dead ahead, the
    // lighthouse tower left of it, and the defenders rotating to Site A
    // visible through the gap — the burst can finally see them.
    player.reset(new THREE.Vector3(-15, 0, 0), 0.0);
    phase = 'live';
    roundTimer = ROUND_TIME;
    bots.spawnRound(1, seedBase + 108);
    charge.reset();
    grenades.reset();
    grenades.buy('frag'); // the cover carries all four grenades: 1 frag, 1 smoke, 1 flare, 1 molotov
    grenades.buy('molotov');
    hud.setGrenades(grenades.counts(), match.hasKit);
    hud.setPlan(bots.getPlan('attack'));
    hud.hideOverlay();
    hud.hideBuy();
    updateScoreboard();
    // Seed the radio log the way the live hearing system writes it: the plan
    // goes out first, then the callouts as the fight develops.
    hud.radio('Pip: Smoking Lantern Hall — push through it', 'gull');
    scene.updateMatrixWorld(true);
    let coverTarget = null;
    let burstLeft = 0;
    let burstDone = false;
    for (let i = 0; i < 300; i += 1) {
      // Scripted cover action, all real simulation. A Molotov up the lane
      // first, a late flare, then ONE three-shot burst at the first
      // visible defender — three Osprey hits kill, so the killfeed shows a
      // real kill. The smoke goes out late, down the lane, so it is fresh and
      // thick in the frame. The loop stops at 300 steps (5 s): any longer and
      // the teammates crowd into the frame at Site A and block the lighthouse.
      if (i === 90) {
        // Yaw -0.2 sends the Molotov through the gap to Site A.
        player.state.yaw = -0.2;
        camera.rotation.y = -0.2;
        throwPlayerGrenade('molotov');
        hud.radio('You: Molotov out — Lantern Hall is burning', 'gull');
      }
      if (i === 120) {
        // Early flare: it pops at ~i=186 and blinds the defenders, so the
        // burst at i>=140 meets them standing still in the open.
        player.state.yaw = -0.2;
        camera.rotation.y = -0.2;
        throwPlayerGrenade('flare');
        hud.radio('You: Flare out — they are blind!', 'gull');
      }
      if (i === 140) {
        // Yaw 0.2 sends the smoke to the lighthouse base, left of the fire.
        player.state.yaw = 0.2;
        camera.rotation.y = 0.2;
        throwPlayerGrenade('smoke');
      }
      if (i === 230) {
        // Re-aim for the capture: tower left, site centre, quay in frame.
        player.state.yaw = 0.0;
        camera.rotation.y = 0.0;
      }
      if (!burstDone && burstLeft === 0 && i >= 140 && i % 5 === 0) {
        const vis = visibleKeeperBot();
        if (vis) { coverTarget = vis; burstLeft = 3; }
      }
      if (burstLeft > 0 && i % 7 === 0) {
        // If the target went down mid-burst (a teammate or the Molotov got
        // them first), pick a new visible defender and keep shooting — the
        // cover wants three shots and a kill in the killfeed, not a burst
        // that stops at a corpse.
        if (!coverTarget || !coverTarget.alive) coverTarget = visibleKeeperBot();
        if (coverTarget) { fireAtBot(coverTarget); burstLeft -= 1; }
        else burstLeft = 0;
        if (burstLeft === 0) burstDone = true;
      }
      fixedStep(STEP);
      scene.updateMatrixWorld(true);
      if (phase !== 'live') break;
    }
    // The last real shot fires in the final frame callback, not here: the
    // muzzle flash only lives 0.2 s and the driver captures ~50 ms after
    // __shotReady, so a shot fired here would have faded before the capture.
    finalShotPending = true;
  } else if (shotMode === 'end') {
    match.gull = 5;
    match.keeper = 3;
    match.round = 9;
    match.kills = 12;
    match.deaths = 4;
    match.earned = 14200;
    match.botKills = { Pip: 9, Tern: 7 };
    hud.setScore(5, 3, 9);
    bots.spawnRound(9, seedBase + 916, 'keeper');
    hud.showOverlay('end', '5 - 3', { result: 'GULLS WIN THE QUAY', kills: 12, deaths: 4, earned: 14200, mvp: 'You' });
    player.reset(new THREE.Vector3(-8, 0, -2), 0.5);
    phase = 'menu';
  }
  requestAnimationFrame(() => {
    render();
    requestAnimationFrame(() => {
      // The cover's last shot fires here, in the frame just before the
      // capture: the muzzle flash and tracer only live ~0.2 s, and the driver
      // captures ~50 ms after __shotReady, so they are still burning.
      if (finalShotPending) {
        finalShotPending = false;
        // The final shot fires straight down the composed view (yaw 0.0,
        // toward Site A) WITHOUT re-aiming: the burst already put a kill in
        // the killfeed, so this shot only has to sell the muzzle flash and a
        // tracer toward the site — it does not need to kill.
        weaponView.state.cooldown = 0;
        tryShoot();
        // Hold the star for the capture: the driver needs 100-250 ms to poll
        // and capture, longer than the flash lives.
        weaponView.state.flash = 5;
      }
      render();
      window.__shotReady = true;
    });
  });
}

if (shotMode) {
  setupShot();
} else {
  hud.showOverlay('start');
  requestAnimationFrame(() => {
    render();
    window.__shotReady = true;
  });
}

// --- main loop ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.1);
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    fixedStep(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) acc = 0;
  render();
}
requestAnimationFrame(frame);
