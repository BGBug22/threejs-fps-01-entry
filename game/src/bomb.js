// GULLHAVEN Tide Charge: the bomb, reskinned as a harbour charge. Plant 3.5 s,
// detonate in 35 s, defuse in 5 s — 2.5 s with the Defuse Kit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const DETONATE_SECONDS = 35;

export function createCharge(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.24, 0.32),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#14202a'), roughness: 0.55, metalness: 0.45 }),
  );
  body.castShadow = true;
  const lightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }),
  );
  lightMesh.position.set(0.15, 0.14, 0);
  group.add(body, lightMesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 4, 2);
  light.position.y = 0.3;
  group.add(light);
  group.visible = false;
  scene.add(group);

  const charge = {
    state: 'idle',
    carrier: null,
    site: null,
    pos: new THREE.Vector3(),
    detonateIn: DETONATE_SECONDS,
    beepAt: 0,
    blinkAt: 0,
    lightOn: false,
  };

  function placeAt(pos) {
    charge.pos.copy(pos);
    group.position.set(pos.x, 0.13, pos.z);
  }

  return {
    state: charge,
    reset() {
      charge.state = 'carried';
      charge.carrier = 'player';
      charge.site = null;
      charge.detonateIn = DETONATE_SECONDS;
      charge.beepAt = 0;
      group.visible = false;
    },
    drop(pos) {
      charge.state = 'dropped';
      charge.carrier = null;
      placeAt(pos);
      group.visible = true;
    },
    pickup(actor) {
      charge.state = 'carried';
      charge.carrier = actor;
      group.visible = false;
    },
    plant(site, pos) {
      charge.state = 'planted';
      charge.carrier = null;
      charge.site = site;
      charge.detonateIn = DETONATE_SECONDS;
      charge.beepAt = 0;
      placeAt(pos);
      group.visible = true;
    },
    update(dt, ctx) {
      if (charge.state !== 'planted') return;
      charge.detonateIn -= dt;
      const interval = charge.detonateIn > 20 ? 1.0 : charge.detonateIn > 10 ? 0.5 : 0.25;
      charge.beepAt -= dt;
      if (charge.beepAt <= 0) {
        charge.beepAt = interval;
        ctx.sound('beep');
      }
      charge.blinkAt -= dt;
      if (charge.blinkAt <= 0) {
        charge.blinkAt = interval / 2;
        charge.lightOn = !charge.lightOn;
        lightMesh.material.color.setHex(charge.lightOn ? 0xff2a1a : 0xff9a2e);
        light.intensity = charge.lightOn ? 6 : 0;
      }
      if (charge.detonateIn <= 0) ctx.onDetonate();
    },
  };
}
