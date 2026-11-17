[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/BGBug22/threejs-fps-01-entry/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/BGBug22/threejs-fps-01-entry/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

Entry for the [make.fun threejs-fps-01 bounty](https://make.fun/bounty/threejs-fps-01) — "Make the best three.js tactical FPS", $1,000 in USDC.

# GULLHAVEN — Tactical FPS

A round-based tactical FPS in the browser, built with three.js 0.187.0 and no
build step: static files, no network, single-player against bots.

**The game.** You are a Gull, attacking a dusk fishing harbour ("Quay 9 —
Gullhaven") with four bot teammates against five Keeper defenders. Plant the
Tide Charge at Lantern Hall (Site A) or the Cannery (Site B), or eliminate the
other team. First to 5 rounds (max 9) takes the quay. Between rounds you earn
money — $300 per kill, $300 for planting, $3,250 for a round win — and spend it
in a five-column requisition menu on better guns (Skua SMG, Cormorant 12
shotgun, Osprey AR, Albatross 7 sniper), armour, a defuse kit, and grenades.

**What the winners do.** Bots play a team plan and say it on the radio
("PLAN: RUSH A — YOU: ENTRY A"), hear gunfire and explosions and walk over to
look, and call every contact by lane name. The attack rushes one site together
from the first second — and if a round is still unplanted at 40 seconds, the
whole team pushes at once, so every round ends with a winner — by elimination, detonation, defuse, or the clock.
If you stall with the charge, a Gull takes it from you and plants it. The
defenders answer the rush with a flare that blinds whoever faces it, a
Molotov that denies the site with fire, and a smoke screen of their own.

**The map.** A 40 × 30 m harbour at dusk: a red-and-white lighthouse tower
sweeping a real beam over the quay, the Cannery's chimney, a beached fishing
boat across the mid lane, lamp posts, wet cobbles, gulls circling overhead,
and giant site signs ("A — LANTERN HALL · SITE A", "B — CANNERY · SITE B").
The sky is orange-red dusk, the teams are sea blue (Gulls) and lantern amber
(Keepers), and every bot is a modelled soldier with a nameplate — not a box.

**Gunplay.** Headshots deal 3.0–3.4× damage, spread grows while moving, recoil
follows a deterministic spray pattern you can learn, and stopping to aim pays.
The Cormorant 12 fires six pellets per pull. Four grenades, all real
simulation: frag (radius damage), smoke (blocks bot sight for 12 s), flare
(blinds whoever faces it for 3 s and lights the lane), Molotov (a fire pool,
25 damage per second for 6 s). A defuse kit halves the defuse channel from
5 s to 2.5 s.

**Structure.** `game/index.html` is the page and HUD; `game/src/` holds one
module per job (`main.js` the match, `bots.js` the AI, `world.js` the map,
`weapons.js` the guns and view model, `grenades.js`, `bomb.js` the Tide
Charge, `fx.js` tracers/smoke/fire/flare, `hud.js`, `player.js`, `input.js`,
`audio.js` synthesised WebAudio, `palette.js`). The simulation runs on a
fixed 1/60 s step, separate from rendering, with all state in one place.

**Play it.** `node serve.ts`, then open http://localhost:8080. Click to play.
WASD move, mouse aim, left click fire, R reload, E plant/defuse, B buy,
1–5 weapons, 4–7 grenades, Tab scoreboard, M mute.

**Screenshots.** Four real renders of the game's own code (`?shot=play|buy|
plant|end`): the cover is a live firefight at Lantern Hall — Molotov burning
at the site, a Keeper dropping at the crosshair under a star muzzle flash.
The third is the plant: Pip (IGL) arming the Tide Charge at Site A under
the ARMING THE CHARGE banner, progress bar at 55%.
