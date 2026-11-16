// GULLHAVEN Quay 9: a dusk fishing harbour — Lantern Hall (A) and Cannery (B),
// a red-and-white lighthouse with a sweeping beam, a beached boat, fish-market
// stalls along the south wall, wet cobbles, gulls circling overhead.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WAYPOINTS = [
  [0, 12.5, [1, 2, 5]],
  [-8, 9, [0, 3, 5]],
  [8, 9, [0, 4, 5]],
  [-16, 7, [1, 6, 14]],
  [16, 7, [2, 7, 15]],
  [0, 5, [0, 1, 2, 8]],
  [-16, -6, [3, 9, 14]],
  [16, -6, [4, 10, 15]],
  [0, -6, [5, 8, 16, 17]],
  [-13, -10, [6, 16, 11]],
  [13, -10, [7, 17, 12]],
  [-8, -13, [9, 13, 16]],
  [8, -13, [10, 13, 17]],
  [0, -13, [11, 12, 8]],
  [-16, 0, [3, 6]],
  [16, 0, [4, 7]],
  [-8, -10, [8, 9, 11]],
  [8, -10, [8, 10, 12]],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 45, 130);

  const mats = {};
  for (const name of ['canvas', 'surface', 'hairline', 'ink', 'muted', 'accent', 'amber']) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'amber' ? 0.5 : 0.92,
      metalness: name === 'accent' || name === 'amber' ? 0.25 : 0.04,
    });
  }
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a85a28'), roughness: 0.8, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d2c1e'), roughness: 0.95, metalness: 0.05 });
  const tealMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0f7f96'), roughness: 0.75, metalness: 0.2 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff7a1a'), emissive: new THREE.Color('#ff6a00'), emissiveIntensity: 2.2, roughness: 0.6,
  });

  function cobbleTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#4a3220';
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const v = 0.55 + rnd() * 0.5;
        g.fillStyle = `rgb(${Math.floor(96 * v)},${Math.floor(70 * v)},${Math.floor(46 * v)})`;
        g.beginPath();
        g.roundRect(x * 32 + 2, y * 32 + 2, 28, 28, 7);
        g.fill();
      }
    }
    const texture = new THREE.CanvasTexture(c);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 8);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const floorMat = new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.72, metalness: 0.18 });

  function signTexture(big, small, bg, fg) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = fg;
    g.font = '900 190px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(big, 36, 138);
    g.font = '800 54px "Segoe UI", system-ui, sans-serif';
    g.fillText(small, 300, 140);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const colliders = [];
  const shootables = [];
  const minimapRects = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (h >= 1) minimapRects.push({ x, z, w, d });
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, mat, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = Math.max(rTop, rBottom);
    minimapRects.push({ x, z, w: half * 2, d: half * 2 });
    colliders.push(new THREE.Box3(new THREE.Vector3(x - half, y - h / 2, z - half), new THREE.Vector3(x + half, y + h / 2, z + half)));
    shootables.push(mesh);
    return mesh;
  }

  box(40.4, 0.4, 30.4, 0, -0.2, 0, floorMat);
  box(0.4, 5, 30.4, -20.2, 2.5, 0, mats.surface);
  box(0.4, 5, 30.4, 20.2, 2.5, 0, mats.surface);
  box(40.4, 5, 0.4, 0, 2.5, -15.2, mats.surface);
  box(40.4, 5, 0.4, 0, 2.5, 15.2, mats.surface);

  box(4, 4, 0.5, -18, 2, -2, mats.surface);
  box(10.5, 4, 0.5, -7.75, 2, -2, mats.surface);
  box(10.5, 4, 0.5, 7.75, 2, -2, mats.surface);
  box(4, 4, 0.5, 18, 2, -2, mats.surface);
  box(5.4, 0.8, 0.6, 0, 4.2, -2, mats.hairline);

  box(4.6, 3.4, 2.4, -15.5, 1.7, -12.8, rustMat);
  const lampMouth = box(2.4, 1.2, 0.3, -15.5, 1.0, -11.5, glowMat, false);
  lampMouth.castShadow = false;
  cylinder(0.4, 0.4, 5.0, -17.2, 2.5, -13.6, darkMat);
  cylinder(0.4, 0.4, 4.2, -13.2, 2.1, -13.8, darkMat);
  box(4.8, 0.5, 3.2, -13, 0.25, -7.4, mats.hairline);
  box(1.2, 1.1, 1.2, -8.6, 0.55, -11.4, mats.hairline);
  cylinder(0.55, 0.55, 1.1, -10.4, 0.55, -12.6, tealMat);
  cylinder(0.55, 0.55, 1.1, -11.6, 0.55, -13.2, rustMat);

  box(6.4, 4.2, 3.0, 14.5, 2.1, -12.6, mats.surface);
  box(6.8, 0.4, 3.4, 14.5, 4.4, -12.6, darkMat);
  cylinder(0.5, 0.7, 7.5, 18.2, 3.75, -13.4, darkMat);
  box(5.6, 0.5, 0.5, 13.2, 5.0, -11.0, mats.hairline, false);
  box(1.4, 1.1, 1.4, 9.6, 0.55, -11.2, mats.hairline);
  box(1.4, 1.1, 1.4, 11.2, 0.55, -12.8, mats.hairline);
  box(1.4, 1.1, 1.4, 16.8, 0.55, -10.8, tealMat);

  const towerRed = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d63a2f'), roughness: 0.6, metalness: 0.1 });
  const towerWhite = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f5efe4'), roughness: 0.6, metalness: 0.05 });
  const TOWER_X = -17.6;
  const TOWER_Z = -13.4;
  for (let i = 0; i < 4; i += 1) {
    cylinder(1.05, 1.15, 2.5, TOWER_X, 1.25 + i * 2.5, TOWER_Z, i % 2 === 0 ? towerRed : towerWhite, 20);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 0.5, 20), darkMat);
  gallery.position.set(TOWER_X, 10.25, TOWER_Z);
  gallery.castShadow = true;
  gallery.receiveShadow = true;
  group.add(gallery);
  const towerLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd23e'), emissive: new THREE.Color('#ffb300'), emissiveIntensity: 4, roughness: 0.3 }),
  );
  towerLamp.position.set(TOWER_X, 11, TOWER_Z);
  group.add(towerLamp);
  const towerLight = new THREE.PointLight(new THREE.Color('#ffb300'), 40, 30, 1.6);
  towerLight.position.set(TOWER_X, 11, TOWER_Z);
  scene.add(towerLight);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9a8'), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 20, 1, true), beamMat);
  beam.position.set(TOWER_X, 11, TOWER_Z);
  group.add(beam);
  const beamUp = new THREE.Vector3(0, 1, 0);
  const beamDir = new THREE.Vector3();
  const beamSpot = new THREE.SpotLight(new THREE.Color('#ffe9a8'), 90, 45, 0.22, 0.5, 1.4);
  beamSpot.position.set(TOWER_X, 11, TOWER_Z);
  beamSpot.target.position.set(TOWER_X + 20, 0, TOWER_Z);
  scene.add(beamSpot, beamSpot.target);
  let beamAngle = -0.6;

  const hull = box(7.5, 1.8, 2.6, 0, 0.9, 7.2, rustMat);
  hull.rotation.y = 0.12;
  box(7.9, 0.5, 3.0, 0, 1.9, 7.2, darkMat);
  cylinder(0.09, 0.12, 6.5, 0.4, 4.6, 7.2, darkMat, 8);
  box(1.1, 1.0, 1.1, -2.6, 2.2, 7.0, tealMat);

  box(6, 2.6, 2.4, -10, 1.3, 4.2, tealMat);
  box(6, 2.6, 2.4, 10, 1.3, 4.2, rustMat);
  box(2.4, 2.6, 6, -17.6, 1.3, -6.5, mats.surface);
  box(2.4, 2.6, 6, 17.6, 1.3, -6.5, mats.surface);
  box(1.2, 1.2, 1.2, -5, 0.6, 7.0, mats.hairline);
  box(1.2, 1.2, 1.2, 5, 0.6, 7.0, mats.hairline);
  box(1.2, 1.2, 1.2, -3.8, 0.6, -5.6, mats.hairline);
  box(1.2, 1.2, 1.2, 3.8, 0.6, -5.6, mats.hairline);
  box(1.2, 2.4, 1.2, 0, 1.2, 9.6, mats.hairline);
  box(2.2, 0.9, 1.2, -7, 0.45, -12.4, mats.hairline);
  box(2.2, 0.9, 1.2, 7, 0.45, -12.4, mats.hairline);
  for (const [bx, bz] of [[-12, 1.5], [12, 1.5], [-5.5, -8.5], [5.5, -8.5]]) {
    box(1.6, 0.7, 1.6, bx, 0.35, bz, darkMat);
  }
  for (const [bx, bz, mat] of [[-14.5, 6.5, mats.amber], [14.5, 6.5, mats.accent], [-2, -11.5, mats.amber], [2, -11.5, mats.accent]]) {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 9), mat);
    buoy.position.set(bx, 0.32, bz);
    buoy.castShadow = true;
    group.add(buoy);
  }

  function marketStall(x, z, mat) {
    box(2.2, 1.05, 1.2, x, 0.53, z, mats.surface);
    box(2.2, 0.12, 1.2, x, 1.12, z, darkMat);
    for (const [px, pz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) {
      cylinder(0.05, 0.05, 1.1, x + px, 1.7, z + pz, darkMat, 6);
    }
    const awning = box(2.5, 0.08, 1.7, x, 2.25, z, mat);
    awning.rotation.x = 0.16;
    box(0.9, 0.5, 0.7, x - 0.5, 1.42, z, mats.amber);
    box(0.7, 0.4, 0.6, x + 0.55, 1.38, z, mats.accent);
  }
  const stallRow = [
    [-12, 13, mats.amber], [-5, 13.2, mats.accent],
    [5, 13.2, mats.amber], [12, 13, mats.accent],
  ];
  for (const [sx, sz, smat] of stallRow) marketStall(sx, sz, smat);
  const hullB = box(5.2, 1.4, 2.0, -14, 0.7, 11, rustMat);
  hullB.rotation.y = -0.35;
  box(5.5, 0.4, 2.3, -14, 1.5, 11, darkMat).rotation.y = -0.35;
  cylinder(0.08, 0.1, 4.6, -13.2, 3.2, 11, darkMat, 8);
  for (const [cx, cz] of [[-2.5, 13.4], [2.5, 13.4], [0, 13.6]]) {
    box(1.1, 1.0, 1.1, cx, 0.5, cz, mats.hairline);
  }
  for (const [rx, rz] of [[-8.5, 12.6], [8.5, 12.6]]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 18), darkMat);
    coil.position.set(rx, 0.14, rz);
    coil.rotation.x = -Math.PI / 2;
    coil.castShadow = true;
    group.add(coil);
  }

  const plateA = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.22 }));
  plateA.rotation.x = -Math.PI / 2;
  plateA.position.set(-13, 0.02, -10);
  group.add(plateA);
  const plateB = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.22 }));
  plateB.rotation.x = -Math.PI / 2;
  plateB.position.set(13, 0.02, -10);
  group.add(plateB);

  const craneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8452c'), roughness: 0.72 });
  const craneDark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2c22'), roughness: 0.8 });
  const crateTeal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1f6f6b'), roughness: 0.66 });
  const crateRust = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a4a28'), roughness: 0.7 });
  box(1.1, 8.5, 1.1, 17.6, 4.25, 8, craneMat);
  box(1.7, 0.9, 1.7, 17.6, 8.9, 8, craneDark);
  const jib = box(7.5, 0.5, 0.6, 14.6, 9.1, 8, craneMat);
  jib.rotation.z = 0.06;
  box(2.2, 0.5, 0.6, 19.4, 9.0, 8, craneDark);
  cylinder(0.03, 0.03, 4.6, 11.4, 6.7, 8, craneDark, 6);
  box(0.7, 0.5, 0.7, 11.4, 4.2, 8, crateRust);
  box(0.9, 0.3, 0.9, 11.4, 3.9, 8, craneDark);
  const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 5), craneDark);
  hookLine.position.set(11.4, 2.9, 8);
  group.add(hookLine);
  box(2.4, 1.1, 1.2, 18.6, 0.55, 2, crateTeal);
  box(2.4, 1.1, 1.2, 18.6, 1.65, 2, crateRust);
  box(2.4, 1.1, 1.2, 18.6, 0.55, 6.2, crateRust);
  box(2.4, 1.1, 1.2, 18.4, 0.55, 12.5, crateTeal);
  box(1.2, 1.0, 1.2, 18.6, 0.5, 10.5, crateTeal);
  box(1.2, 1.0, 1.2, -18.6, 0.5, 6.5, crateRust);

  function addSign(texture, w, h, x, y, z, ry = 0) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    sign.position.set(x, y, z);
    sign.rotation.y = ry;
    group.add(sign);
    return sign;
  }
  addSign(signTexture('A', 'LANTERN HALL · SITE A', '#0b1d20', '#7de3f0'), 9.5, 2.4, -13, 3.6, -14.9);
  addSign(signTexture('B', 'CANNERY · SITE B', '#1d130b', '#ffb45e'), 9.5, 2.4, 13, 3.6, -14.9);
  addSign(signTexture('9', 'QUAY 9 — GULLHAVEN', '#3a1e08', '#ffe9c4'), 6.5, 1.6, 0, 3.5, -1.68);

  const gulls = [];
  const gullMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f5efe4'), side: THREE.DoubleSide });
  for (let i = 0; i < 5; i += 1) {
    const bird = new THREE.Group();
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), gullMat);
    wingL.position.x = -0.32;
    wingL.rotation.z = 0.5;
    const wingR = wingL.clone();
    wingR.position.x = 0.32;
    wingR.rotation.z = -0.5;
    bird.add(wingL, wingR);
    bird.userData = { r: 9 + i * 1.6, h: 13 + i * 0.9, a: (i / 5) * Math.PI * 2, speed: 0.12 + i * 0.015 };
    scene.add(bird);
    gulls.push(bird);
  }

  const sky = new THREE.HemisphereLight(new THREE.Color('#ffb37a'), new THREE.Color('#4a2c1c'), 2.0);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ff8c3a'), 4.6);
  sun.position.set(-26, 9, 14);
  sun.target.position.set(6, 0, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a9cc6'), 1.2);
  fill.position.set(12, 14, -14);
  scene.add(fill);
  const hallLight = new THREE.PointLight(new THREE.Color('#ff6a00'), 22, 14, 1.8);
  hallLight.position.set(-15.5, 1.6, -11.2);
  scene.add(hallLight);
  const canneryLight = new THREE.PointLight(new THREE.Color('#39c2d7'), 10, 12, 1.8);
  canneryLight.position.set(14.5, 4.5, -11);
  scene.add(canneryLight);
  for (const [lx, lz] of [[-10, 2], [10, 2], [-10, -8], [10, -8]]) {
    cylinder(0.07, 0.09, 3.4, lx, 1.7, lz, darkMat, 8);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd9a0'), emissive: new THREE.Color('#ffb300'), emissiveIntensity: 3, roughness: 0.4 }),
    );
    lamp.position.set(lx, 3.5, lz);
    group.add(lamp);
    const pl = new THREE.PointLight(new THREE.Color('#ffb300'), 9, 10, 1.8);
    pl.position.set(lx, 3.4, lz);
    scene.add(pl);
  }

  const waypoints = WAYPOINTS.map(([x, z, links]) => ({ p: new THREE.Vector3(x, 0, z), links }));

  return {
    colliders,
    shootables,
    group,
    waypoints,
    minimapRects,
    sites: {
      A: { center: new THREE.Vector3(-13, 0, -10), radius: 4.5, name: 'Lantern Hall' },
      B: { center: new THREE.Vector3(13, 0, -10), radius: 4.5, name: 'Cannery' },
    },
    spawns: {
      attack: [
        new THREE.Vector3(-6, 0, 12.5),
        new THREE.Vector3(-3, 0, 13.3),
        new THREE.Vector3(0, 0, 12.5),
        new THREE.Vector3(3, 0, 13.3),
        new THREE.Vector3(6, 0, 12.5),
      ],
      defend: [
        new THREE.Vector3(-7, 0, -12.5),
        new THREE.Vector3(-3.5, 0, -13.3),
        new THREE.Vector3(0, 0, -12.5),
        new THREE.Vector3(3.5, 0, -13.3),
        new THREE.Vector3(7, 0, -12.5),
      ],
    },
    step(dt, t) {
      beamAngle += dt * 0.25;
      const bx = TOWER_X + Math.cos(beamAngle) * 20;
      const bz = TOWER_Z + Math.sin(beamAngle) * 20;
      beamSpot.target.position.set(bx, 0, bz);
      beamDir.set(bx - TOWER_X, -11, bz - TOWER_Z).normalize();
      beam.quaternion.setFromUnitVectors(beamUp, beamDir);
      beam.position.set(TOWER_X + beamDir.x * 13, 11 + beamDir.y * 13, TOWER_Z + beamDir.z * 13);
      for (const bird of gulls) {
        const u = bird.userData;
        u.a += dt * u.speed;
        bird.position.set(TOWER_X + Math.cos(u.a) * u.r, u.h, TOWER_Z + Math.sin(u.a) * u.r);
        bird.rotation.y = -u.a;
        bird.rotation.z = Math.sin(t * 2 + u.r) * 0.12;
      }
    },
  };
}
