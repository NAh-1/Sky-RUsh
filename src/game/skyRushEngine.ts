import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createBalloonRig,
  createBirdDroneModel,
  createCoinModel,
  createMineModel,
  createPowerUpModel,
  createStormCloudModel,
  createTerrainTexture,
  createWindGustModel,
  type BalloonRig,
} from './models';
import type { SoundEngine } from '../audio/soundEngine';
import type {
  GamePhase,
  HazardType,
  HudSnapshot,
  LeanInputState,
  PowerUpType,
  RunSummary,
} from '../types/game';

const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

const LANE_SPACING = 4.4;
const LANE_HALF_W = 5.4;
const CRUISE_Y = 0.2;
const BALLOON_Z = 0.0;
const SPAWN_Z = -78;
const DESPAWN_Z = 16;

interface ActiveHazard {
  kind: HazardType;
  mesh: THREE.Group;
  bolt?: THREE.Mesh;
  wingL?: THREE.Mesh;
  wingR?: THREE.Mesh;
  prop?: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  baseX: number;
  phase: number;
  radius: number;
  pushDir: 1 | -1;
  hit: boolean;
  nearMissAwarded?: boolean;
}

interface ActiveCoin {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

interface ActivePowerUp {
  kind: PowerUpType;
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface CloudInstance {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  speedMult: number;
}

export class SkyRushEngine {
  private container: HTMLElement;
  private sound: SoundEngine;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onGameOver: (summary: RunSummary) => void;
  private getInputState: (isAttract: boolean) => LeanInputState;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl = false;

  private balloon!: BalloonRig;
  private skyBgColor = new THREE.Color(0x63b3ed);
  private targetSkyColor = new THREE.Color(0x63b3ed);
  private fog!: THREE.FogExp2;
  private terrainMesh!: THREE.Mesh;
  private terrainMat!: THREE.MeshStandardMaterial;

  private cloudInstanced!: THREE.InstancedMesh;
  private clouds: CloudInstance[] = [];
  private laneDashInstanced!: THREE.InstancedMesh;
  private laneDashZ: number[] = [];

  private particleInstanced!: THREE.InstancedMesh;
  private particles: Particle[] = [];

  private hazards: ActiveHazard[] = [];
  private coins: ActiveCoin[] = [];
  private powerUps: ActivePowerUp[] = [];

  private phase: GamePhase = 'attract';
  private frameId = 0;
  private lastMs = performance.now();
  private elapsed = 0;
  private destroyed = false;

  // Player 3-lane flight physics
  private px = 0;
  private py = CRUISE_Y;
  private vx = 0;
  private vy = 0;
  private roll = 0;
  private pitch = 0;
  private windPushX = 0;
  private lastLane = 0;
  private laneDashBurner = 0;
  private invulnTimer = 0;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private laneMarker!: THREE.Mesh;

  // Progression & score
  private distance = 0;
  private altitude = 120;
  private score = 0;
  private coinCount = 0;
  private combo = 1;
  private maxCombo = 1;
  private comboTimer = 0;
  private forwardSpeed = 21;

  // Power-ups
  private shieldActive = false;
  private magnetTimer = 0;
  private thermalTimer = 0;
  private bannerText: string | null = null;
  private bannerTone: HudSnapshot['eventTone'] = 'gold';
  private bannerTimer = 0;

  // Spawners
  private hazardSpawnDist = 0;
  private coinSpawnDist = 0;
  private powerUpSpawnDist = 0;
  private lastHudPushMs = 0;

  private onResizeBound = () => this.handleResize();

  constructor(options: {
    container: HTMLElement;
    sound: SoundEngine;
    getInputState: (isAttract: boolean) => LeanInputState;
    onHudUpdate: (hud: HudSnapshot) => void;
    onGameOver: (summary: RunSummary) => void;
  }) {
    this.container = options.container;
    this.sound = options.sound;
    this.getInputState = options.getInputState;
    this.onHudUpdate = options.onHudUpdate;
    this.onGameOver = options.onGameOver;

    this.initScene();
    this.startLoop();
  }

  private detectSoftwareGl(): boolean {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initScene(): void {
    this.isSoftwareGl = this.detectSoftwareGl();

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = this.skyBgColor;
    this.fog = new THREE.FogExp2(0x63b3ed, 0.0115);
    this.scene.fog = this.fog;

    // Studio IBL environment map for metallic brass, gold coins, and glass highlights
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.2, 220);
    this.camera.position.set(0, 17.5, 14.5);
    this.camera.lookAt(0, 0.5, -10.5);

    // 3-point warm/cool outdoor sky lighting rig
    const sunKey = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sunKey.position.set(16, 26, 18);
    sunKey.castShadow = !this.isSoftwareGl;
    sunKey.shadow.mapSize.set(1024, 1024);
    sunKey.shadow.camera.near = 2;
    sunKey.shadow.camera.far = 70;
    const d = 16;
    sunKey.shadow.camera.left = -d;
    sunKey.shadow.camera.right = d;
    sunKey.shadow.camera.top = d;
    sunKey.shadow.camera.bottom = -d;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
    this.scene.add(sunKey);

    const hemiFill = new THREE.HemisphereLight(0xbae6fd, 0xfde68a, 0.95);
    this.scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.65);
    rimLight.position.set(-14, 6, -24);
    this.scene.add(rimLight);

    // Hero Hot Air Balloon
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.balloon = createBalloonRig(maxAniso);
    this.balloon.root.position.set(0, 0, 0);
    this.scene.add(this.balloon.root);

    // 3 Subway-Surfers-style Sky Lane Guide Tracks + Balloon Lane Beacon
    const railMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    [-LANE_SPACING, 0, LANE_SPACING].forEach((lx) => {
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 128), railMat);
      rail.rotation.x = -Math.PI / 2;
      rail.position.set(lx, -1.35, -52);
      this.scene.add(rail);
    });

    this.laneMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.2, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.laneMarker.rotation.x = -Math.PI / 2;
    this.laneMarker.position.set(0, -1.32, BALLOON_Z);
    this.scene.add(this.laneMarker);

    // Scrolling sky-track dashes along the 3 lanes for top-down speed sensation
    const dashesPerLane = 14;
    const dashCount = dashesPerLane * 3;
    this.laneDashInstanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.04, 2.2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      }),
      dashCount
    );
    this.laneDashInstanced.frustumCulled = false;
    for (let i = 0; i < dashesPerLane; i++) {
      this.laneDashZ.push(-72 + i * 6.5);
    }
    this.scene.add(this.laneDashInstanced);

    // Distant patchwork valley floor
    const terrainTex = createTerrainTexture(maxAniso);
    this.terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTex,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 1,
    });
    this.terrainMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 260), this.terrainMat);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.position.set(0, -32, -55);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    // Instanced volumetric sky clouds kept cleanly BELOW gameplay altitude so top-down view stays clear
    const cloudCount = 60;
    const cloudGeo = new THREE.IcosahedronGeometry(1.7, 2);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.cloudInstanced = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    this.cloudInstanced.frustumCulled = false;

    for (let i = 0; i < cloudCount; i++) {
      const c: CloudInstance = {
        x: (Math.random() - 0.5) * 68,
        y: -7 - Math.random() * 14,
        z: -Math.random() * 120 + 22,
        sx: 1.5 + Math.random() * 2.8,
        sy: 0.55 + Math.random() * 0.7,
        sz: 1.3 + Math.random() * 2.2,
        speedMult: 0.55 + Math.random() * 0.55,
      };
      this.clouds.push(c);
      _color.setHSL(0.56 + Math.random() * 0.04, 0.14, 0.94 + Math.random() * 0.05);
      this.cloudInstanced.setColorAt(i, _color);
    }
    if (this.cloudInstanced.instanceColor) {
      this.cloudInstanced.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.cloudInstanced);

    // Instanced particle pool for sparks, embers, and shield pops
    const maxParticles = 140;
    this.particleInstanced = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      maxParticles
    );
    this.particleInstanced.frustumCulled = false;
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color(0xfbbf24),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, _color.setHex(0xfbbf24));
    }
    this.scene.add(this.particleInstanced);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.onResizeBound);
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    if (phase === 'playing') {
      this.resetRun();
    } else if (phase === 'attract') {
      this.clearEntities();
      this.px = 0;
      this.py = 0.5;
      this.vx = 0;
      this.vy = 0;
      this.altitude = 120;
      this.balloon.root.visible = true;
      this.balloon.shieldMesh.visible = false;
      this.balloon.magnetRing.visible = false;
    }
  }

  private resetRun(): void {
    this.clearEntities();
    this.px = 0;
    this.py = CRUISE_Y;
    this.vx = 0;
    this.vy = 0;
    this.roll = 0;
    this.pitch = 0;
    this.windPushX = 0;
    this.lastLane = 0;
    this.laneDashBurner = 0;
    this.invulnTimer = 0.8;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;

    this.distance = 0;
    this.altitude = 120;
    this.score = 0;
    this.coinCount = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.comboTimer = 0;
    this.forwardSpeed = 17.5;

    this.shieldActive = false;
    this.magnetTimer = 0;
    this.thermalTimer = 0;
    this.bannerText = 'MOVE HEAD LEFT / RIGHT!';
    this.bannerTone = 'cyan';
    this.bannerTimer = 2.0;

    this.hazardSpawnDist = 22;
    this.coinSpawnDist = 10;
    this.powerUpSpawnDist = 64;

    this.balloon.root.visible = true;
    this.balloon.shieldMesh.visible = false;
    this.balloon.magnetRing.visible = false;
    this.sound.playStartFanfare();
  }

  private clearEntities(): void {
    this.hazards.forEach((h) => this.scene.remove(h.mesh));
    this.coins.forEach((c) => this.scene.remove(c.mesh));
    this.powerUps.forEach((p) => this.scene.remove(p.mesh));
    this.hazards = [];
    this.coins = [];
    this.powerUps = [];
  }

  private handleResize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private spawnParticles(
    originX: number,
    originY: number,
    originZ: number,
    count: number,
    hex: number,
    speed = 8
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.pos.set(originX, originY, originZ);
      p.vel.set(
        (Math.random() - 0.5) * speed * 1.4,
        (Math.random() - 0.3) * speed * 1.4,
        (Math.random() - 0.5) * speed
      );
      p.maxLife = 0.45 + Math.random() * 0.45;
      p.life = p.maxLife;
      p.scale = 0.7 + Math.random() * 0.9;
      p.color.setHex(hex);
      spawned++;
    }
  }

  private spawnHazardWave(): void {
    const diff = Math.min(1, this.distance / 1800);
    const lanes: (-1 | 0 | 1)[] = [-1, 0, 1];
    // Shuffle lanes so we always leave at least 1 safe open lane!
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    const blockCount = diff > 0.22 && Math.random() < 0.45 + diff * 0.25 ? 2 : 1;
    const blockedLanes = lanes.slice(0, blockCount);
    const safeLane = lanes[blockCount];

    blockedLanes.forEach((lane, idx) => {
      const x = lane * LANE_SPACING;
      const z = SPAWN_Z - idx * 1.4;
      const roll = Math.random();

      if (roll < 0.36) {
        const mesh = createMineModel();
        const y = CRUISE_Y + 0.7;
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        this.hazards.push({
          kind: 'mine',
          mesh,
          x,
          y,
          z,
          baseX: x,
          phase: Math.random() * Math.PI * 2,
          radius: 1.18,
          pushDir: 1,
          hit: false,
        });
      } else if (roll < 0.66) {
        const { group, bolt } = createStormCloudModel();
        const y = CRUISE_Y + 1.8;
        group.position.set(x, y, z);
        this.scene.add(group);
        this.hazards.push({
          kind: 'storm',
          mesh: group,
          bolt,
          x,
          y,
          z,
          baseX: x,
          phase: Math.random() * Math.PI * 2,
          radius: 1.4,
          pushDir: 1,
          hit: false,
        });
      } else if (roll < 0.88) {
        const { group, wingL, wingR, prop } = createBirdDroneModel();
        const y = CRUISE_Y + 0.75;
        group.position.set(x, y, z);
        this.scene.add(group);
        this.hazards.push({
          kind: 'bird',
          mesh: group,
          wingL,
          wingR,
          prop,
          x,
          y,
          z,
          baseX: x,
          phase: Math.random() * Math.PI * 2,
          radius: 1.1,
          pushDir: lane === -1 ? 1 : -1,
          hit: false,
        });
      } else {
        const pushDir: 1 | -1 = lane === -1 ? 1 : lane === 1 ? -1 : Math.random() < 0.5 ? 1 : -1;
        const mesh = createWindGustModel(pushDir);
        const y = CRUISE_Y + 0.8;
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        this.hazards.push({
          kind: 'gust',
          mesh,
          x,
          y,
          z,
          baseX: x,
          phase: Math.random() * Math.PI * 2,
          radius: 1.8,
          pushDir,
          hit: false,
        });
      }
    });

    // Place a rewarding coin line down the guaranteed open lane
    if (Math.random() < 0.7) {
      const sx = safeLane * LANE_SPACING;
      for (let i = 0; i < 4; i++) {
        const cz = SPAWN_Z - 2 - i * 3.2;
        const cy = CRUISE_Y + 0.65;
        const mesh = createCoinModel();
        mesh.position.set(sx, cy, cz);
        this.scene.add(mesh);
        this.coins.push({ mesh, x: sx, y: cy, z: cz, collected: false });
      }
    }
  }

  private spawnCoinArc(): void {
    const laneChoices: (-1 | 0 | 1)[] = [-1, 0, 1];
    const lane = laneChoices[Math.floor(Math.random() * laneChoices.length)];
    const x = lane * LANE_SPACING;
    const count = 4 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
      const y = CRUISE_Y + 0.65 + Math.sin((i / (count - 1)) * Math.PI) * 0.45;
      const z = SPAWN_Z - i * 3.1;
      const mesh = createCoinModel();
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.coins.push({ mesh, x, y, z, collected: false });
    }
  }

  private spawnPowerUp(): void {
    const kinds: PowerUpType[] = ['shield', 'magnet', 'thermal'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const mesh = createPowerUpModel(kind);
    const lane = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)];
    const x = lane * LANE_SPACING;
    const y = CRUISE_Y + 0.75;
    mesh.position.set(x, y, SPAWN_Z);
    this.scene.add(mesh);
    this.powerUps.push({ kind, mesh, x, y, z: SPAWN_Z, collected: false });
  }

  private setBanner(text: string, tone: HudSnapshot['eventTone'], duration = 1.8): void {
    this.bannerText = text;
    this.bannerTone = tone;
    this.bannerTimer = duration;
  }

  private startLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      const now = performance.now();
      const rawDt = (now - this.lastMs) / 1000;
      this.lastMs = now;
      const dt = Math.min(rawDt, 0.05);

      this.step(dt, now);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private step(dt: number, nowMs: number): void {
    this.elapsed += dt;
    const isAttract = this.phase === 'attract';
    const input = this.getInputState(isAttract);

    // Hitstop freeze on impact
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    // Smooth sky color gradient as altitude climbs
    const altNorm = Math.min(1, (this.altitude - 120) / 2200);
    if (altNorm < 0.35) {
      this.targetSkyColor.setHex(0x63b3ed).lerp(_color.setHex(0x38bdf8), altNorm / 0.35);
    } else if (altNorm < 0.7) {
      this.targetSkyColor.setHex(0x38bdf8).lerp(_color.setHex(0xf97316), (altNorm - 0.35) / 0.35);
    } else {
      this.targetSkyColor.setHex(0xf97316).lerp(_color.setHex(0x1e1b4b), (altNorm - 0.7) / 0.3);
    }
    this.skyBgColor.lerp(this.targetSkyColor, 1 - Math.exp(-1.5 * dt));
    this.fog.color.copy(this.skyBgColor);

    // Scroll valley floor & fade out into clouds at higher altitude
    const scrollSpeed = this.phase === 'playing' ? this.forwardSpeed : 11;
    const tex = this.terrainMat.map;
    if (tex) {
      tex.offset.y -= scrollSpeed * dt * 0.008;
    }
    this.terrainMesh.position.y = -30 - Math.min(28, (this.altitude - 120) * 0.045);
    this.terrainMat.opacity = Math.max(0, 1 - (this.altitude - 120) / 950);

    // Update Instanced clouds (kept safely below playfield)
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.z += scrollSpeed * c.speedMult * dt;
      if (c.z > 24) {
        c.z = -105 - Math.random() * 25;
        c.x = (Math.random() - 0.5) * 68;
        c.y = -7 - Math.random() * 14;
      }
      _vec3.set(c.x, c.y, c.z);
      _quat.identity();
      _scale.set(c.sx, c.sy, c.sz);
      _mat4.compose(_vec3, _quat, _scale);
      this.cloudInstanced.setMatrixAt(i, _mat4);
    }
    this.cloudInstanced.instanceMatrix.needsUpdate = true;

    // Update scrolling lane dashes along Left / Center / Right tracks
    const laneXs = [-LANE_SPACING, 0, LANE_SPACING];
    let dashIdx = 0;
    for (let i = 0; i < this.laneDashZ.length; i++) {
      this.laneDashZ[i] += scrollSpeed * dt;
      if (this.laneDashZ[i] > 19) {
        this.laneDashZ[i] -= this.laneDashZ.length * 6.5;
      }
      for (let l = 0; l < 3; l++) {
        _vec3.set(laneXs[l], -1.33, this.laneDashZ[i]);
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_vec3, _quat, _scale);
        this.laneDashInstanced.setMatrixAt(dashIdx++, _mat4);
      }
    }
    this.laneDashInstanced.instanceMatrix.needsUpdate = true;

    if (this.phase === 'attract') {
      // Gentle scenic 3-lane demo autopilot in Attract Mode
      this.px = Math.sin(this.elapsed * 0.65) * LANE_SPACING * 0.85 + input.x * 1.5;
      this.py = CRUISE_Y + 0.35 + Math.cos(this.elapsed * 0.9) * 0.35;
      this.laneMarker.position.x = this.px;
      this.roll = THREE.MathUtils.damp(this.roll, -Math.cos(this.elapsed * 0.65) * 0.14, 6, dt);
      this.pitch = THREE.MathUtils.damp(this.pitch, 0.04, 6, dt);
      this.animateBalloon(dt, 0.42, false);
      this.sound.updateFlightLoops(false, 0, 0.2, false);
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'gameover') {
      this.sound.updateFlightLoops(false, 0, 0, false);
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    // --- ACTIVE 3-LANE SUBWAY SURFERS GAMEPLAY (Top-Down View, Head Left/Center/Right) ---
    const difficulty = Math.min(1, this.distance / 1800);
    const targetSpeed = 17.5 + difficulty * 25 + (this.thermalTimer > 0 ? 14 : 0);
    this.forwardSpeed = THREE.MathUtils.damp(this.forwardSpeed, targetSpeed, 3.8, dt);

    if (input.targetLane !== this.lastLane) {
      this.lastLane = input.targetLane;
      this.laneDashBurner = 0.25;
      this.sound.playTap();
    }
    if (this.laneDashBurner > 0) this.laneDashBurner = Math.max(0, this.laneDashBurner - dt);

    this.windPushX = THREE.MathUtils.damp(this.windPushX, 0, 4.5, dt);
    const targetX = THREE.MathUtils.clamp(
      input.targetLane * LANE_SPACING + this.windPushX,
      -LANE_HALF_W,
      LANE_HALF_W
    );
    const prevX = this.px;
    this.px = THREE.MathUtils.damp(this.px, targetX, 18, dt);
    this.vx = (this.px - prevX) / Math.max(dt, 0.001);

    // Automatic smooth cruising altitude (rises safely over obstacles during Thermal Updraft)
    const targetY =
      CRUISE_Y +
      (this.thermalTimer > 0 ? 3.2 : 0) +
      Math.sin(this.elapsed * 2.4) * 0.22;
    this.py = THREE.MathUtils.damp(this.py, targetY, 8.5, dt);
    this.laneMarker.position.set(this.px, -1.32, BALLOON_Z);

    this.roll = THREE.MathUtils.damp(this.roll, -this.vx * 0.022, 12, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.thermalTimer > 0 ? 0.09 : 0.03, 8, dt);

    const burnerIntensity =
      this.thermalTimer > 0 ? 1.25 : this.laneDashBurner > 0 ? 0.72 : 0.36;
    this.animateBalloon(dt, burnerIntensity, this.thermalTimer > 0 || this.laneDashBurner > 0);
    this.sound.updateFlightLoops(true, burnerIntensity, difficulty, false);

    // Timers & distance
    this.distance += this.forwardSpeed * dt;
    this.altitude += this.forwardSpeed * 0.48 * dt;
    this.score += this.forwardSpeed * dt * 2.2;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    if (this.thermalTimer > 0) this.thermalTimer = Math.max(0, this.thermalTimer - dt);
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) this.bannerText = null;
    }
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) this.combo = 1;
    }

    this.balloon.shieldMesh.visible = this.shieldActive;
    if (this.shieldActive) {
      this.balloon.shieldMesh.rotation.y += dt * 1.4;
    }
    this.balloon.magnetRing.visible = this.magnetTimer > 0;
    if (this.magnetTimer > 0) {
      this.balloon.magnetRing.rotation.z += dt * 3.5;
    }

    // Spawning waves scaled by escalating difficulty
    const hazardGap = THREE.MathUtils.lerp(24, 15, difficulty);
    this.hazardSpawnDist -= this.forwardSpeed * dt;
    if (this.hazardSpawnDist <= 0) {
      this.spawnHazardWave();
      this.hazardSpawnDist = hazardGap * (0.88 + Math.random() * 0.25);
    }

    this.coinSpawnDist -= this.forwardSpeed * dt;
    if (this.coinSpawnDist <= 0) {
      this.spawnCoinArc();
      this.coinSpawnDist = 20 + Math.random() * 10;
    }

    this.powerUpSpawnDist -= this.forwardSpeed * dt;
    if (this.powerUpSpawnDist <= 0) {
      this.spawnPowerUp();
      this.powerUpSpawnDist = 68 + Math.random() * 32;
    }

    // Update Hazards + Proximity Warning + Near Miss + Lane Collision
    let nearHazard = false;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.z += this.forwardSpeed * dt;
      h.phase += dt * 2.5;

      if (h.kind === 'mine') {
        h.mesh.rotation.y += dt * 0.9;
        h.mesh.rotation.x += dt * 0.45;
        h.mesh.position.set(h.x, h.y + Math.sin(h.phase) * 0.22, h.z);
      } else if (h.kind === 'storm') {
        h.mesh.position.set(h.x, h.y, h.z);
        if (h.bolt) {
          h.bolt.visible = Math.sin(this.elapsed * 22 + h.phase) > -0.35;
        }
      } else if (h.kind === 'bird') {
        h.x = h.baseX + Math.sin(h.phase * 0.85) * 0.55 * h.pushDir;
        h.mesh.position.set(h.x, h.y + Math.cos(h.phase * 1.4) * 0.2, h.z);
        const flap = Math.sin(this.elapsed * 16 + h.phase) * 0.55;
        if (h.wingL) h.wingL.rotation.z = flap;
        if (h.wingR) h.wingR.rotation.z = -flap;
        if (h.prop) h.prop.rotation.z += dt * 28;
      } else if (h.kind === 'gust') {
        h.mesh.rotation.x += dt * 3.2 * h.pushDir;
        h.mesh.position.set(h.x, h.y, h.z);
      }

      const dx = this.px - h.x;
      const dy = this.py + 0.7 - h.y;
      const dz = h.z - BALLOON_Z;

      if (h.kind !== 'gust' && dz < -2 && dz > -28 && this.thermalTimer <= 0) {
        if (Math.abs(dx) < 1.95) {
          nearHazard = true;
        }
      }

      // Near-miss bonus when grazing past an obstacle in an adjacent lane
      if (!h.hit && !h.nearMissAwarded && h.kind !== 'gust' && dz > 1.8 && dz < 4.5) {
        h.nearMissAwarded = true;
        if (Math.abs(dx) >= 1.5 && Math.abs(dx) < 5.2) {
          this.score += 50;
        }
      }

      // Collision check near balloon Z plane (soars safely over obstacles during Thermal Updraft)
      if (!h.hit && Math.abs(dz) < 1.35) {
        if (h.kind === 'gust') {
          if (Math.abs(dx) < 1.8 && Math.abs(dy) < 2.2) {
            h.hit = true;
            this.windPushX = h.pushDir * 2.8;
            this.setBanner(h.pushDir > 0 ? 'CROSSWIND PUSH →' : '← CROSSWIND PUSH', 'cyan', 0.9);
          }
        } else if (this.thermalTimer <= 0) {
          const hitBolt = h.kind === 'storm' && Math.abs(dx) < 1.35;
          const hitBody = Math.abs(dx) < 1.45 && Math.abs(dy) < 2.1;

          if (hitBody || hitBolt) {
            h.hit = true;
            if (this.invulnTimer <= 0) {
              if (this.shieldActive) {
                this.shieldActive = false;
                this.invulnTimer = 1.4;
                this.hitstopTimer = 0.045;
                this.shakeIntensity = 0.55;
                this.sound.playShieldPop();
                this.spawnParticles(this.px, this.py + 1, BALLOON_Z, 26, 0x2dd4bf, 11);
                this.setBanner('SHIELD ABSORBED HIT!', 'cyan', 1.5);
                this.scene.remove(h.mesh);
                this.hazards.splice(i, 1);
                continue;
              } else {
                // Crash -> Game Over
                this.hitstopTimer = 0.065;
                this.shakeIntensity = 0.9;
                this.sound.playCrash();
                this.spawnParticles(this.px, this.py + 1, BALLOON_Z, 38, 0xf97316, 13);
                this.balloon.root.visible = false;
                this.phase = 'gameover';
                const reason =
                  h.kind === 'storm'
                    ? 'Struck by Storm Lightning'
                    : h.kind === 'bird'
                    ? 'Clipped by Sky Patrol Drone'
                    : 'Hit a Floating Sky Mine';
                this.onGameOver({
                  score: Math.round(this.score),
                  altitude: Math.round(this.altitude),
                  coins: this.coinCount,
                  maxCombo: this.maxCombo,
                  reason,
                });
                return;
              }
            }
          }
        }
      }

      if (h.z > DESPAWN_Z) {
        this.scene.remove(h.mesh);
        this.hazards.splice(i, 1);
      }
    }

    if (nearHazard) {
      this.sound.playWarningBeep();
    }

    // Update Coins (with Magnet Attraction!)
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.z += this.forwardSpeed * dt;
      c.mesh.rotation.y += dt * 3.8;

      const dx = this.px - c.x;
      const dy = this.py + 0.7 - c.y;
      const dz = BALLOON_Z - c.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (this.magnetTimer > 0 && dist < 14 && c.z < BALLOON_Z + 4) {
        const pull = 26 * dt;
        c.x += (dx / Math.max(0.1, dist)) * pull;
        c.y += (dy / Math.max(0.1, dist)) * pull;
        c.z += (dz / Math.max(0.1, dist)) * pull;
      }

      c.mesh.position.set(c.x, c.y, c.z);

      if (!c.collected && dist < 2.05) {
        c.collected = true;
        this.coinCount += 1;
        this.combo = this.comboTimer > 0 ? Math.min(10, this.combo + 1) : 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.comboTimer = 2.8;
        this.score += 100 * this.combo;
        this.sound.playCoin(this.combo);
        this.spawnParticles(c.x, c.y, c.z, 10, 0xfacc15, 7);
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }

      if (c.z > DESPAWN_Z) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    // Update Power-Ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.z += this.forwardSpeed * dt;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.set(p.x, p.y + Math.sin(this.elapsed * 3 + i) * 0.25, p.z);

      const dist = Math.hypot(this.px - p.x, this.py + 0.8 - p.y, p.z - BALLOON_Z);
      if (!p.collected && dist < 2.25) {
        p.collected = true;
        this.sound.playPowerUp(p.kind);
        if (p.kind === 'shield') {
          this.shieldActive = true;
          this.setBanner('SHIELD BUBBLE ACTIVE', 'cyan', 2.0);
          this.spawnParticles(p.x, p.y, p.z, 18, 0x2dd4bf, 9);
        } else if (p.kind === 'magnet') {
          this.magnetTimer = 9.0;
          this.setBanner('COIN MAGNET ACTIVE', 'rose', 2.0);
          this.spawnParticles(p.x, p.y, p.z, 18, 0xf43f5e, 9);
        } else {
          this.thermalTimer = 3.5;
          this.score += 450;
          this.altitude += 65;
          this.setBanner('THERMAL UPDRAFT +450', 'amber', 2.0);
          this.spawnParticles(p.x, p.y, p.z, 22, 0xfb923c, 10);
        }
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
        continue;
      }

      if (p.z > DESPAWN_Z) {
        this.scene.remove(p.mesh);
        this.powerUps.splice(i, 1);
      }
    }

    this.updateParticles(dt);
    this.updateCamera(dt);

    // Throttled HUD sync (~20fps for crisp UI without React churn)
    if (nowMs - this.lastHudPushMs > 50) {
      this.lastHudPushMs = nowMs;
      this.onHudUpdate({
        score: Math.round(this.score),
        altitude: Math.round(this.altitude),
        speedKmh: Math.round(this.forwardSpeed * 3.1),
        coins: this.coinCount,
        combo: this.combo,
        comboTimer: this.comboTimer,
        shieldActive: this.shieldActive,
        magnetTimer: this.magnetTimer,
        thermalTimer: this.thermalTimer,
        nearHazard,
        eventBanner: this.bannerText,
        eventTone: this.bannerTone,
      });
    }
  }

  private animateBalloon(dt: number, burnerLevel: number, emitEmbers: boolean): void {
    this.balloon.root.position.set(this.px, this.py, BALLOON_Z);
    this.balloon.root.rotation.set(this.pitch, 0, this.roll);

    // Blink softly during post-shield invulnerability
    if (this.invulnTimer > 0 && this.phase === 'playing') {
      this.balloon.root.visible = Math.floor(this.invulnTimer * 16) % 2 === 0;
    } else if (this.phase !== 'gameover') {
      this.balloon.root.visible = true;
    }

    // Flickering burner flame & dynamic light
    const flicker = 0.88 + Math.sin(this.elapsed * 38) * 0.12 + Math.cos(this.elapsed * 53) * 0.08;
    const flameScale = Math.max(0.05, burnerLevel * flicker);
    this.balloon.flameOuter.scale.set(
      0.7 + burnerLevel * 0.55,
      flameScale * 1.35,
      0.7 + burnerLevel * 0.55
    );
    this.balloon.flameInner.scale.set(
      0.6 + burnerLevel * 0.45,
      flameScale * 1.15,
      0.6 + burnerLevel * 0.45
    );
    this.balloon.flameOuter.visible = burnerLevel > 0.08;
    this.balloon.flameInner.visible = burnerLevel > 0.08;
    this.balloon.burnerLight.intensity = burnerLevel * 2.4 * flicker;

    // Gentle envelope squash-stretch breathing with burner thrust
    const swell = 1 + Math.min(0.06, burnerLevel * 0.045);
    this.balloon.envelopeGroup.scale.set(swell, 1 + (swell - 1) * 0.6, swell);

    if (emitEmbers && Math.random() < dt * 26) {
      this.spawnParticles(this.px, this.py - 0.1, 0, 1, 0xfb923c, 2.6);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleInstanced.setMatrixAt(i, _mat4);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.pos.z += this.forwardSpeed * 0.35 * dt;
      const ratio = p.life / p.maxLife;
      const s = p.scale * ratio;
      _euler.set(p.life * 4, p.life * 3, 0);
      _quat.setFromEuler(_euler);
      _scale.set(s, s, s);
      _mat4.compose(p.pos, _quat, _scale);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, p.color);
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
  }

  private updateCamera(dt: number): void {
    const targetFov =
      this.phase === 'attract'
        ? 52
        : this.thermalTimer > 0
        ? 60
        : 54 + Math.min(6, (this.forwardSpeed - 17.5) * 0.24);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 4, dt);
      this.camera.updateProjectionMatrix();
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.01) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 7, dt);
    }

    // High overhead top-down angle keeping the full balloon visible in the lower viewport
    // while giving a clear, long view down all 3 lanes ahead
    const camTargetX = this.phase === 'attract' ? this.px * 0.1 : this.px * 0.16;
    const camTargetY = (this.phase === 'attract' ? 11.5 : 17.5) + shakeY;
    const camTargetZ = this.phase === 'attract' ? 13.5 : 14.5;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camTargetX + shakeX, 6, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camTargetY, 6, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camTargetZ, 6, dt);

    if (this.phase === 'attract') {
      this.camera.lookAt(this.px * 0.12, 1.0, -4.0);
    } else {
      this.camera.lookAt(this.px * 0.1, 0.5, -10.5);
    }
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResizeBound);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
