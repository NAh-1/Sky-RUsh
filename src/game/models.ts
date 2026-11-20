import * as THREE from 'three';
import type { PowerUpType } from '../types/game';

/**
 * Generates a crisp procedural striped carnival fabric CanvasTexture for the balloon envelope.
 */
export function createEnvelopeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const stripes = [
    '#e11d48', // crimson
    '#fef3c7', // warm ivory
    '#f59e0b', // marigold gold
    '#0284c7', // sky cobalt
    '#fef3c7', // warm ivory
    '#e11d48',
    '#f59e0b',
    '#0f766e', // deep teal
  ];

  const colW = canvas.width / stripes.length;
  stripes.forEach((color, idx) => {
    ctx.fillStyle = color;
    ctx.fillRect(idx * colW, 0, colW + 1, canvas.height);

    // Subtle vertical gore seam stitching line
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.fillRect(idx * colW, 0, 3, canvas.height);
  });

  // Equatorial ornamental chevron band
  const bandY = canvas.height * 0.44;
  const bandH = canvas.height * 0.13;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, bandY, canvas.width, bandH);

  ctx.fillStyle = '#fbbf24';
  const teeth = 16;
  const toothW = canvas.width / teeth;
  for (let i = 0; i < teeth; i++) {
    ctx.beginPath();
    ctx.moveTo(i * toothW, bandY + bandH);
    ctx.lineTo(i * toothW + toothW * 0.5, bandY + 6);
    ctx.lineTo((i + 1) * toothW, bandY + bandH);
    ctx.closePath();
    ctx.fill();
  }

  // Horizontal ripstop fabric weave lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  for (let y = 24; y < canvas.height; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates procedural woven wicker albedo + bump textures for the gondola basket.
 */
export function createWickerTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = 256;
  b.height = 256;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = '#925a2b';
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#555555';
  bctx.fillRect(0, 0, 256, 256);

  const cell = 16;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const horiz = ((x / cell + y / cell) & 1) === 0;
      ctx.fillStyle = horiz ? '#b4743c' : '#7a4920';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      bctx.fillStyle = horiz ? '#d4d4d4' : '#808080';
      bctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 2);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 2);

  return { map, bumpMap };
}

/**
 * Generates distant patchwork valley ground texture visible far below at low altitudes.
 */
export function createTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2d6a4f';
  ctx.fillRect(0, 0, 512, 512);

  const colors = ['#40916c', '#52b788', '#74c69d', '#a3b18a', '#dad7cd', '#3a7ca5'];
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const x = (i % 8) * 64;
    const y = Math.floor(i / 8) * 64;
    ctx.fillRect(x + 2, y + 2, 60, 60);
  }

  // Winding river ribbon
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(110, 0);
  ctx.bezierCurveTo(190, 170, 320, 310, 260, 512);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface BalloonRig {
  root: THREE.Group;
  envelopeGroup: THREE.Group;
  flameOuter: THREE.Mesh;
  flameInner: THREE.Mesh;
  burnerLight: THREE.PointLight;
  shieldMesh: THREE.Mesh;
  magnetRing: THREE.Mesh;
}

/**
 * Builds the 9-part composite Hero Hot Air Balloon Group.
 * Pivoted neatly around the basket/envelope center of mass for natural banking.
 */
export function createBalloonRig(maxAnisotropy: number): BalloonRig {
  const root = new THREE.Group();
  const envelopeGroup = new THREE.Group();
  root.add(envelopeGroup);

  const envTex = createEnvelopeTexture(maxAnisotropy);
  const wickerTex = createWickerTextures(maxAnisotropy);

  // 1. Primary Envelope Silhouette (LatheGeometry teardrop profile)
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -0.55),
    new THREE.Vector2(0.42, -0.55),
    new THREE.Vector2(0.65, -0.25),
    new THREE.Vector2(0.95, 0.25),
    new THREE.Vector2(1.22, 0.85),
    new THREE.Vector2(1.32, 1.45),
    new THREE.Vector2(1.22, 2.02),
    new THREE.Vector2(0.92, 2.48),
    new THREE.Vector2(0.45, 2.78),
    new THREE.Vector2(0.0, 2.86),
  ];
  const envGeo = new THREE.LatheGeometry(profile, 28);
  const envMat = new THREE.MeshStandardMaterial({
    map: envTex,
    roughness: 0.65,
    metalness: 0.04,
  });
  const envelopeMesh = new THREE.Mesh(envGeo, envMat);
  envelopeMesh.position.y = 0.72;
  envelopeMesh.castShadow = true;
  envelopeMesh.receiveShadow = true;
  envelopeGroup.add(envelopeMesh);

  // 2. Crown Brass Cap & Vent Valve at Envelope Apex
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.2,
  });
  const crownCap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.14, 16), brassMat);
  crownCap.position.y = 3.58;
  crownCap.castShadow = true;
  envelopeGroup.add(crownCap);

  const crownFinial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), brassMat);
  crownFinial.position.y = 3.69;
  envelopeGroup.add(crownFinial);

  // 3. Lower Skirt Heat-Shield Collar Ring
  const skirtRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.055, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 })
  );
  skirtRing.rotation.x = Math.PI / 2;
  skirtRing.position.y = 0.17;
  envelopeGroup.add(skirtRing);

  // 4. 4 Suspension Steel Cables connecting Skirt Collar to Basket Corners
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.85,
    roughness: 0.3,
  });
  const cableOffsets = [
    [-0.29, -0.29],
    [0.29, -0.29],
    [-0.29, 0.29],
    [0.29, 0.29],
  ];
  cableOffsets.forEach(([ox, oz]) => {
    const start = new THREE.Vector3(ox * 1.12, 0.16, oz * 1.12);
    const end = new THREE.Vector3(ox, -0.52, oz);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 6), cableMat);
    cable.position.copy(start).addScaledVector(dir, 0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    root.add(cable);
  });

  // 5. Brass Dual Propane Burner Assembly
  const burnerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.28), brassMat);
  burnerFrame.position.y = -0.25;
  root.add(burnerFrame);

  const nozzleL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 12), brassMat);
  nozzleL.position.set(-0.08, -0.17, 0);
  const nozzleR = nozzleL.clone();
  nozzleR.position.x = 0.08;
  root.add(nozzleL, nozzleR);

  // 6. Dynamic Burner Flame Cones + Light
  const flameOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.55, 14),
    new THREE.MeshBasicMaterial({
      color: 0xff7b00,
      transparent: true,
      opacity: 0.88,
    })
  );
  flameOuter.position.y = 0.08;
  root.add(flameOuter);

  const flameInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.34, 12),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.96,
    })
  );
  flameInner.position.y = 0.03;
  root.add(flameInner);

  const burnerLight = new THREE.PointLight(0xff9e2c, 1.4, 8, 2);
  burnerLight.position.set(0, 0.05, 0);
  root.add(burnerLight);

  // 7. Woven Wicker Gondola Basket + Hardwood Trim
  const basketMat = new THREE.MeshStandardMaterial({
    map: wickerTex.map,
    bumpMap: wickerTex.bumpMap,
    bumpScale: 0.04,
    roughness: 0.9,
    metalness: 0.0,
  });
  const basketBody = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.52, 0.66), basketMat);
  basketBody.position.y = -0.78;
  basketBody.castShadow = true;
  basketBody.receiveShadow = true;
  root.add(basketBody);

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x5c3416,
    roughness: 0.38,
    metalness: 0.05,
  });
  const basketRim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.09, 0.74), rimMat);
  basketRim.position.y = -0.52;
  basketRim.castShadow = true;
  root.add(basketRim);

  // 8. Corner Ballast Sandbags
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xd6bfa2, roughness: 0.88 });
  [
    [-0.35, -0.74, 0.16],
    [0.35, -0.74, -0.16],
  ].forEach(([bx, by, bz]) => {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), bagMat);
    bag.scale.set(0.75, 1.25, 0.75);
    bag.position.set(bx, by, bz);
    root.add(bag);
  });

  // 9. Shield Bubble & Magnet Halo (toggled by power-ups)
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.95, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  shieldMesh.position.y = 1.05;
  shieldMesh.visible = false;
  root.add(shieldMesh);

  const magnetRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.65, 0.06, 10, 32),
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.8,
    })
  );
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.position.y = -0.35;
  magnetRing.visible = false;
  root.add(magnetRing);

  return {
    root,
    envelopeGroup,
    flameOuter,
    flameInner,
    burnerLight,
    shieldMesh,
    magnetRing,
  };
}

/**
 * Floating Naval Sky Mine (Composite 11-part metal sphere + riveted collar + spikes + beacon).
 */
export function createMineModel(): THREE.Group {
  const g = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.82,
    roughness: 0.36,
  });
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.4,
    metalness: 0.65,
    roughness: 0.25,
  });

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.82, 20, 18), ironMat);
  core.castShadow = true;
  g.add(core);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.08, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.22 })
  );
  g.add(collar);

  const spikeGeo = new THREE.ConeGeometry(0.16, 0.56, 8);
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.7, 0.7, 0],
    [-0.7, 0.7, 0],
    [0.7, -0.7, 0],
    [-0.7, -0.7, 0],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  dirs.forEach(([dx, dy, dz]) => {
    const v = new THREE.Vector3(dx, dy, dz).normalize();
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.copy(v).multiplyScalar(0.95);
    spike.quaternion.setFromUnitVectors(up, v);
    g.add(spike);
  });

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  beacon.position.y = 0.88;
  g.add(beacon);

  return g;
}

/**
 * Storm Cloud with jagged glowing lightning bolt strike below.
 */
export function createStormCloudModel(): { group: THREE.Group; bolt: THREE.Mesh } {
  const group = new THREE.Group();
  const darkCloudMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x1e293b,
    emissiveIntensity: 0.35,
    roughness: 0.92,
    metalness: 0.02,
  });

  const puffs: [number, number, number, number][] = [
    [0, 0.15, 0, 1.05],
    [-0.95, -0.05, 0.1, 0.82],
    [0.95, -0.05, -0.1, 0.82],
    [-0.48, 0.42, -0.15, 0.74],
    [0.52, 0.38, 0.15, 0.74],
  ];
  puffs.forEach(([x, y, z, r]) => {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), darkCloudMat);
    puff.position.set(x, y, z);
    puff.scale.set(1.15, 0.78, 0.9);
    puff.castShadow = true;
    group.add(puff);
  });

  // Jagged lightning bolt below cloud
  const boltCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.35, 0),
    new THREE.Vector3(-0.28, -1.0, 0.05),
    new THREE.Vector3(0.24, -1.55, -0.05),
    new THREE.Vector3(-0.18, -2.35, 0),
  ]);
  const bolt = new THREE.Mesh(
    new THREE.TubeGeometry(boltCurve, 12, 0.11, 6, false),
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    })
  );
  group.add(bolt);

  return { group, bolt };
}

/**
 * Mechanical Sky Bird / Patrol Drone with animated wings and spinning propeller.
 */
export function createBirdDroneModel(): {
  group: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  prop: THREE.Mesh;
} {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.75,
    roughness: 0.28,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    metalness: 0.45,
    roughness: 0.4,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 8, 12), hullMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  const wingGeo = new THREE.BoxGeometry(1.15, 0.06, 0.36);
  wingGeo.translate(0.55, 0, 0);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0.12, 0.05, 0);
  group.add(wingL);

  const wingRGeo = new THREE.BoxGeometry(1.15, 0.06, 0.36);
  wingRGeo.translate(-0.55, 0, 0);
  const wingR = new THREE.Mesh(wingRGeo, wingMat);
  wingR.position.set(-0.12, 0.05, 0);
  group.add(wingR);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.26, 0.06), hullMat);
  tail.position.set(0, 0.18, -0.52);
  group.add(tail);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2a55 })
  );
  eye.position.set(0, 0.08, 0.48);
  group.add(eye);

  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 })
  );
  prop.position.set(0, 0, 0.62);
  group.add(prop);

  return { group, wingL, wingR, prop };
}

/**
 * Swirling Wind Gust Stream that pushes the balloon left or right.
 */
export function createWindGustModel(pushDir: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const swirlMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.55,
    roughness: 0.2,
  });

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95 - i * 0.18, 0.07, 8, 24, Math.PI * 1.4),
      swirlMat
    );
    ring.position.x = (i - 1) * 0.7 * pushDir;
    ring.rotation.y = Math.PI / 2;
    ring.rotation.z = i * 0.9;
    g.add(ring);
  }

  // Directional wind arrow cone indicating push vector
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.8, 12),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    })
  );
  arrow.rotation.z = pushDir > 0 ? -Math.PI / 2 : Math.PI / 2;
  arrow.position.x = pushDir * 0.65;
  g.add(arrow);

  return g;
}

/**
 * Milled Gold Coin Collectible.
 */
export function createCoinModel(): THREE.Group {
  const g = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.28,
    metalness: 0.92,
    roughness: 0.18,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    metalness: 0.95,
    roughness: 0.12,
  });

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20), goldMat);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.065, 8, 24), rimMat);
  g.add(rim);

  const coreBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), rimMat);
  coreBadge.scale.set(1, 1, 0.45);
  g.add(coreBadge);

  return g;
}

/**
 * Distinct 3-part Power-Up Models (Shield, Magnet, Thermal Updraft).
 */
export function createPowerUpModel(kind: PowerUpType): THREE.Group {
  const g = new THREE.Group();

  if (kind === 'shield') {
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x0d9488,
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.2,
      })
    );
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.07, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 })
    );
    const ring2 = ring1.clone();
    ring2.rotation.x = Math.PI / 2;
    g.add(core, ring1, ring2);
  } else if (kind === 'magnet') {
    const uCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, 0.42, 0),
      new THREE.Vector3(-0.36, -0.22, 0),
      new THREE.Vector3(0, -0.52, 0),
      new THREE.Vector3(0.36, -0.22, 0),
      new THREE.Vector3(0.36, 0.42, 0),
    ]);
    const body = new THREE.Mesh(
      new THREE.TubeGeometry(uCurve, 20, 0.15, 10, false),
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xbe123c,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.4,
      })
    );
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
    });
    const tipL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12), tipMat);
    tipL.position.set(-0.36, 0.48, 0);
    const tipR = tipL.clone();
    tipR.position.x = 0.36;
    g.add(body, tipL, tipR);
  } else {
    // Thermal Updraft: swirling upward golden flame spiral
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const ang = t * Math.PI * 4;
      const r = 0.65 * (1 - t * 0.45);
      pts.push(new THREE.Vector3(Math.cos(ang) * r, (t - 0.5) * 1.4, Math.sin(ang) * r));
    }
    const spiral = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.08, 8, false),
      new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: 0xea580c,
        emissiveIntensity: 0.9,
        roughness: 0.25,
      })
    );
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.85, 12),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.0,
        roughness: 0.2,
      })
    );
    g.add(spiral, arrow);
  }

  return g;
}
