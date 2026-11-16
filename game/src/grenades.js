// GULLHAVEN grenades: frag, smoke, flare, Molotov and glare — five tools with
// five different jobs. A flare hangs and blinds whoever faces it; a glare
// flashes white and rings ears for 1.5 s; bots throw smoke, flare and Molotov.
import * as THREE from 'three';

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, key: '4', blurb: 'Explodes. Up to 120 damage.' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, key: '5', blurb: 'A grey cloud that blocks sight for 12 s.' },
  flare: { id: 'flare', name: 'Flare', price: 250, key: '6', blurb: 'Blinds whoever faces it for 3 s.' },
  molotov: { id: 'molotov', name: 'Molotov', price: 300, key: '7', blurb: 'Fire pool. 25 damage per second for 6 s.' },
  glare: { id: 'glare', name: 'Glare Grenade', price: 350, key: '8', blurb: 'White flash. Blinds and rings ears for 1.5 s.' },
};

const GRAVITY = 14;
const THROW_SPEED = 15;
const FRAG_RADIUS = 5;
const FIRE_RADIUS = 3.2;
const FIRE_LIFE = 6;
const FIRE_TICK = 0.5;
const FIRE_DPS = 25;

export function createGrenades(scene, colliders, fx) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mats = {
    frag: new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a1f1f'), roughness: 0.5, metalness: 0.4 }),
    smoke: new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa5a0'), roughness: 0.6, metalness: 0.2 }),
    flare: new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff5a1a'), roughness: 0.35, metalness: 0.2, emissive: new THREE.Color('#a83208'), emissiveIntensity: 1.2 }),
    molotov: new THREE.MeshStandardMaterial({ color: new THREE.Color('#a8321f'), roughness: 0.35, metalness: 0.15, emissive: new THREE.Color('#571505'), emissiveIntensity: 0.6 }),
    glare: new THREE.MeshStandardMaterial({ color: new THREE.Color('#f2f5e8'), roughness: 0.3, metalness: 0.1, emissive: new THREE.Color('#c8cdb2'), emissiveIntensity: 0.9 }),
  };
  const hitBox = new THREE.Box3();
  const pouch = { frag: 0, smoke: 1, flare: 1, molotov: 0, glare: 0 };
  const botPouch = { smoke: 1, flare: 1, molotov: 1 };
  const flying = [];
  const burns = [];
  let burnTick = 0;

  function overlaps(x, y, z) {
    hitBox.min.set(x - 0.09, y - 0.09, z - 0.09);
    hitBox.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const c of colliders) if (hitBox.intersectsBox(c)) return true;
    return false;
  }

  function launch(type, origin, dir, thrower = 'You') {
    const mesh = new THREE.Mesh(geo, mats[type]);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    scene.add(mesh);
    const vel = dir.clone().normalize().multiplyScalar(THROW_SPEED);
    vel.y += 4.5;
    const fuse = type === 'flare' ? 1.1 : type === 'glare' ? 1.3 : type === 'flash' ? 1.3 : 2.2;
    flying.push({ type, mesh, vel, fuse, bounced: false, thrower });
    return true;
  }

  function activate(g, ctx) {
    const pos = g.mesh.position.clone();
    scene.remove(g.mesh);
    if (g.type === 'frag') {
      fx.explosion(pos);
      ctx.sound('explosion');
      ctx.noise(pos, 'explosion', 34);
      for (const bot of ctx.bots) {
        if (!bot.alive || bot.team !== 'keeper') continue;
        const d = Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z);
        if (d < FRAG_RADIUS) ctx.damageBot(bot, Math.max(20, 120 * (1 - d / FRAG_RADIUS)), 'torso', 'You');
      }
      if (ctx.playerAlive) {
        const d = Math.hypot(ctx.playerPos.x - pos.x, ctx.playerPos.z - pos.z);
        if (d < FRAG_RADIUS) ctx.damagePlayer(Math.max(15, 90 * (1 - d / FRAG_RADIUS)), pos, 'Frag');
      }
    } else if (g.type === 'smoke') {
      fx.smoke(pos);
      ctx.sound('smoke');
    } else if (g.type === 'molotov') {
      fx.fire(pos);
      ctx.sound('explosion');
      ctx.noise(pos, 'explosion', 20);
      burns.push({ pos, life: FIRE_LIFE, thrower: g.thrower });
    } else if (g.type === 'glare') {
      fx.glareBurst(pos);
      ctx.sound('glare');
      ctx.noise(pos, 'glare', 18);
      ctx.blind(pos, 1.5);
    } else {
      fx.flareBurst(pos);
      ctx.sound('flare');
      ctx.noise(pos, 'flare', 14);
      ctx.blind(pos, 3.0);
    }
  }

  return {
    inventory: pouch,
    counts() {
      return { frag: pouch.frag, smoke: pouch.smoke, flare: pouch.flare, molotov: pouch.molotov, glare: pouch.glare };
    },
    reset() {
      for (const g of flying) scene.remove(g.mesh);
      flying.length = 0;
      burns.length = 0;
      burnTick = 0;
      pouch.frag = 0;
      pouch.smoke = 1;
      pouch.flare = 1;
      pouch.molotov = 0;
      pouch.glare = 0;
      botPouch.smoke = 1;
      botPouch.flare = 1;
      botPouch.molotov = 1;
    },
    buy(type) {
      if (pouch[type] >= 2) return false;
      pouch[type] += 1;
      return true;
    },
    throw(type, origin, dir) {
      if (pouch[type] <= 0) return false;
      pouch[type] -= 1;
      return launch(type, origin, dir);
    },
    throwBot(type, origin, dir, thrower = 'Bot') {
      if (type !== 'smoke' && type !== 'molotov' && type !== 'flare') return false;
      if (botPouch[type] <= 0) return false;
      botPouch[type] -= 1;
      return launch(type, origin, dir, thrower);
    },
    step(dt, ctx) {
      for (let i = flying.length - 1; i >= 0; i -= 1) {
        const g = flying[i];
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        const p = g.mesh.position;
        const nx = p.x + g.vel.x * dt;
        if (!overlaps(nx, p.y, p.z)) p.x = nx;
        else g.vel.x *= -0.4;
        const nz = p.z + g.vel.z * dt;
        if (!overlaps(p.x, p.y, nz)) p.z = nz;
        else g.vel.z *= -0.4;
        p.y += g.vel.y * dt;
        if (p.y < 0.09) {
          p.y = 0.09;
          g.vel.y *= -0.35;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
          if (!g.bounced) {
            g.bounced = true;
            if (g.type === 'frag') g.fuse = Math.min(g.fuse, 0.6);
            if (g.type === 'smoke') g.fuse = Math.min(g.fuse, 0.5);
            if (g.type === 'flare') g.fuse = Math.min(g.fuse, 0.4);
            if (g.type === 'glare') g.fuse = Math.min(g.fuse, 0.4);
          }
        }
        if (g.fuse <= 0) {
          activate(g, ctx);
          flying.splice(i, 1);
        }
      }
      if (burns.length) {
        burnTick += dt;
        if (burnTick >= FIRE_TICK) {
          burnTick = 0;
          const tickDmg = Math.round(FIRE_DPS * FIRE_TICK);
          for (const f of burns) {
            for (const bot of ctx.bots) {
              if (!bot.alive) continue;
              if (Math.hypot(bot.pos.x - f.pos.x, bot.pos.z - f.pos.z) < FIRE_RADIUS) {
                ctx.damageBot(bot, tickDmg, 'torso', f.thrower);
              }
            }
            if (ctx.playerAlive) {
              const d = Math.hypot(ctx.playerPos.x - f.pos.x, ctx.playerPos.z - f.pos.z);
              if (d < FIRE_RADIUS) ctx.damagePlayer(tickDmg, f.pos, f.thrower);
            }
          }
        }
        for (let i = burns.length - 1; i >= 0; i -= 1) {
          burns[i].life -= dt;
          if (burns[i].life <= 0) burns.splice(i, 1);
        }
      }
    },
  };
}
