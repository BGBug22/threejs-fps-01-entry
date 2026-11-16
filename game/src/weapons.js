// GULLHAVEN arsenal: five sea-bird guns, from the free Puffin P9 to the scoped
// Albatross 7. The Cormorant 12 is a true shotgun — six pellets, six rays.
// The viewmodel is a modelled gun, not a box, with a deterministic spray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  puffin: {
    id: 'puffin', name: 'Puffin P9', price: 0, damage: 26, headMult: 3.2,
    mag: 15, reserve: 60, gap: 0.21, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, auto: false, zoom: 1, pellets: 1,
    blurb: 'Reliable. Free.',
  },
  skua: {
    id: 'skua', name: 'Skua SMG', price: 1500, damage: 24, headMult: 3.0,
    mag: 28, reserve: 112, gap: 0.075, reloadTime: 1.7,
    spreadStill: 0.006, spreadMove: 0.035, auto: true, zoom: 1, pellets: 1,
    blurb: 'Close quarters hose.',
  },
  cormorant: {
    id: 'cormorant', name: 'Cormorant 12', price: 2700, damage: 14, headMult: 3.0,
    mag: 6, reserve: 30, gap: 0.85, reloadTime: 2.4,
    spreadStill: 0.02, spreadMove: 0.045, auto: false, zoom: 1, pellets: 6,
    blurb: 'Six pellets. Deletes up close.',
  },
  osprey: {
    id: 'osprey', name: 'Osprey AR', price: 3100, damage: 36, headMult: 3.4,
    mag: 25, reserve: 75, gap: 0.105, reloadTime: 2.0,
    spreadStill: 0.003, spreadMove: 0.026, auto: true, zoom: 1, pellets: 1,
    blurb: 'Hard hitting, loud.',
  },
  albatross: {
    id: 'albatross', name: 'Albatross 7', price: 4750, damage: 110, headMult: 2.0,
    mag: 5, reserve: 20, gap: 1.4, reloadTime: 3.0,
    spreadStill: 0.0006, spreadMove: 0.05, auto: false, zoom: 2.6, pellets: 1,
    blurb: 'One shot. Scope it.',
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 50;
export const HELMET_PRICE = 1000;
export const HELMET_VALUE = 100;
export const KIT_PRICE = 400;

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2a33'), roughness: 0.6, metalness: 0.3 });

  const gun = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.46), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.44), grip);
  barrel.position.set(0, 0.03, -0.42);
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), accent);
  brake.position.set(0, 0.03, -0.66);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), accent);
  magazine.position.set(0, -0.13, 0.02);
  magazine.rotation.x = 0.25;
  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), grip);
  foregrip.position.set(0, -0.09, -0.3);
  foregrip.rotation.x = 0.3;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), dark);
  stock.position.set(0, -0.02, 0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.1), accent);
  sight.position.set(0, 0.085, -0.08);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.3), body);
  rail.position.set(0, 0.06, -0.28);
  gun.add(receiver, barrel, brake, magazine, foregrip, stock, sight, rail);
  gun.scale.setScalar(1.15);
  gun.position.set(0.28, -0.25, -0.46);
  camera.add(gun);

  function starTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.fillStyle = '#ffd23e';
    g.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? 62 : 14;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, 16, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(c);
  }
  const muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
  );
  muzzleFlash.position.set(0.28, -0.22, -1.0);
  muzzleFlash.visible = false;
  camera.add(muzzleFlash);
  const muzzleLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  muzzleLight.position.set(0.28, -0.2, -0.7);
  camera.add(muzzleLight);

  const gunState = { id: 'puffin', def: WEAPONS.puffin, mag: WEAPONS.puffin.mag, reserve: WEAPONS.puffin.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, inspectLeft: 0 };

  function step(dt) {
    gunState.cooldown = Math.max(0, gunState.cooldown - dt);
    gunState.flash = Math.max(0, gunState.flash - dt);
    gunState.kick += (0 - gunState.kick) * Math.min(1, dt * 14);
    gun.position.z = -0.46 + gunState.kick;
    gun.rotation.x = gunState.kick * 2.2;
    muzzleFlash.visible = gunState.flash > 0;
    muzzleFlash.rotation.z = gunState.flash * 30;
    muzzleLight.intensity = gunState.flash > 0 ? 22 : 0;
    if (gunState.reloadLeft > 0) {
      gunState.reloadLeft = Math.max(0, gunState.reloadLeft - dt);
      gun.rotation.x = -0.55 * Math.min(1, (gunState.def.reloadTime - gunState.reloadLeft) * 2);
      if (gunState.reloadLeft === 0) {
        const need = gunState.def.mag - gunState.mag;
        const take = Math.min(need, gunState.reserve);
        gunState.mag += take;
        gunState.reserve -= take;
      }
    } else if (gunState.inspectLeft > 0) {
      gunState.inspectLeft = Math.max(0, gunState.inspectLeft - dt);
      const p = Math.sin((0.9 - gunState.inspectLeft) / 0.9 * Math.PI);
      gun.rotation.x = -0.85 * p;
      gun.rotation.z = 0.45 * p;
      gun.position.y = -0.25 - 0.04 * p;
    } else {
      gun.rotation.z = 0;
      gun.position.y = -0.25;
    }
  }

  return {
    state: gunState,
    step,
    setWeapon(id, keepAmmo = true) {
      const def = WEAPONS[id];
      if (!def) return;
      const wasSame = gunState.id === id;
      const oldMag = gunState.mag;
      gunState.id = id;
      gunState.def = def;
      if (keepAmmo && wasSame) {
        gunState.mag = Math.min(def.mag, oldMag);
      } else {
        gunState.mag = def.mag;
        gunState.reserve = def.reserve;
      }
      gunState.cooldown = 0;
      gunState.reloadLeft = 0;
      gunState.flash = 0;
      gunState.kick = 0;
    },
    setAmmo(mag, reserve) {
      gunState.mag = mag;
      gunState.reserve = reserve;
    },
    ready() {
      return gunState.mag > 0 && gunState.cooldown === 0 && gunState.reloadLeft === 0;
    },
    pullTrigger() {
      gunState.cooldown = gunState.def.gap;
      gunState.flash = 0.2;
      gunState.kick = gunState.id === 'albatross' ? 0.12 : gunState.id === 'cormorant' ? 0.09 : 0.055;
      muzzleFlash.visible = true;
      muzzleLight.intensity = 22;
    },
    takeRound() {
      if (gunState.mag <= 0) return false;
      gunState.mag -= 1;
      return true;
    },
    reload() {
      if (gunState.reloadLeft > 0 || gunState.mag === gunState.def.mag || gunState.reserve === 0) return false;
      gunState.reloadLeft = gunState.def.reloadTime;
      return true;
    },
    inspect() {
      if (gunState.reloadLeft > 0 || gunState.cooldown > 0 || gunState.inspectLeft > 0) return false;
      gunState.inspectLeft = 0.9;
      return true;
    },
    spread(speed) {
      return gunState.def.spreadStill + Math.min(1, speed / 5.4) * gunState.def.spreadMove;
    },
    refill() {
      gunState.mag = gunState.def.mag;
      gunState.reserve = gunState.def.reserve;
      gunState.cooldown = 0;
      gunState.reloadLeft = 0;
      gunState.flash = 0;
      gunState.kick = 0;
    },
  };
}
