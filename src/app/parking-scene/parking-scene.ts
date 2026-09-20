import {
  AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, effect, inject, input, output,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VehicleState, VehicleStatus, VehicleType } from '../models';
import {
  CROSS_X, FLOORS, FLOOR_D, FLOOR_GAP, FLOOR_W, GATE, LANE_Y, RAMP, ROWS, ROW_IDS, RowId,
  SLAB_T, SLOTS_PER_ROW, SLOT_W, SLOT_X0, slotCenter, slotId,
} from '../parking-layout';

type FloorFilter = number | 'all';

interface Pose { x: number; y: number; z: number }

interface VehicleView {
  id: string;
  group: THREE.Group;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  texNormal: THREE.CanvasTexture;
  texSelected: THREE.CanvasTexture;
  from: Pose;
  to: Pose;
  fromFloor: number;
  toFloor: number;
  t0: number;
  dur: number;
  heading: number;
  targetHeading: number;
  pitch: number;
  targetPitch: number;
  status: VehicleStatus;
}

// Floor plan (metres) -> world units. Plan y becomes world z.
const wx = (x: number) => x - FLOOR_W / 2;
const wz = (y: number) => y - FLOOR_D / 2;
const fy = (f: number) => f * FLOOR_GAP;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angleDiff = (to: number, from: number) =>
  ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

const TYPE_SCALE: Record<VehicleType, [number, number, number]> = {
  Sedan: [1, 1, 1],
  SUV: [1.05, 1.22, 1.03],
  Hatchback: [0.96, 1, 0.9],
  Van: [1.08, 1.4, 1.2],
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

@Component({
  selector: 'app-parking-scene',
  template: `
    <div class="frame" #host>
      <canvas #canvas aria-label="3D view of the hotel parking floors"></canvas>
      <div class="legend">
        <span><i class="key tracked"></i>Tracked vehicle</span>
        <span><i class="key other"></i>Other parked car</span>
      </div>
      <p class="hint">Drag to rotate, scroll to zoom, click a car to select it</p>
    </div>
  `,
  styleUrl: './parking-scene.css',
})
export class ParkingScene implements AfterViewInit, OnDestroy {
  readonly vehicles = input.required<VehicleState[]>();
  readonly selectedId = input<string | null>(null);
  readonly floorFilter = input<FloorFilter>('all');
  readonly reservedSlots = input<string[]>([]);
  readonly animMs = input(4500);
  /** Change this number to send the camera back to its starting view. */
  readonly resetTick = input(0);
  readonly vehicleClicked = output<string>();

  @ViewChild('host', { static: true }) private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private zone = inject(NgZone);
  private ready = false;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  private controls!: OrbitControls;
  private resizeObs?: ResizeObserver;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  private floorGroups: THREE.Group[] = [];
  private rampMeshes: THREE.Mesh[] = [];
  private slabMats: THREE.MeshStandardMaterial[] = [];
  private views = new Map<string, VehicleView>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private camTween?: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number };
  private filter: FloorFilter = 'all';
  private selected: string | null = null;
  private downAt = { x: 0, y: 0 };

  private geo = {
    body: new THREE.BoxGeometry(1.9, 0.7, 4.4),
    cabin: new THREE.BoxGeometry(1.72, 0.55, 2.3),
    roof: new THREE.BoxGeometry(1.74, 0.08, 2.34),
    wheel: new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14).rotateZ(Math.PI / 2),
    light: new THREE.BoxGeometry(0.36, 0.16, 0.06),
    shadow: new THREE.PlaneGeometry(2.5, 5.1).rotateX(-Math.PI / 2),
  };
  private glassMat = new THREE.MeshStandardMaterial({ color: 0x33474f, roughness: 0.3, metalness: 0.3 });
  private wheelMat = new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.9 });
  private headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  private tailMat = new THREE.MeshBasicMaterial({ color: 0xe5372b });
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

  constructor() {
    effect(() => {
      const list = this.vehicles();
      if (this.ready) this.applyVehicles(list);
    });
    effect(() => {
      const id = this.selectedId();
      if (this.ready) this.applySelection(id);
    });
    effect(() => {
      const f = this.floorFilter();
      if (this.ready) {
        this.applyFilter(f);
        this.flyTo(f);
      }
    });
    effect(() => {
      this.resetTick();
      if (this.ready) this.flyTo(this.floorFilter());
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initRenderer();
      this.buildWorld();
      this.ready = true;
      this.applyFilter(this.floorFilter());
      this.jumpTo(this.floorFilter());
      this.applyVehicles(this.vehicles());
      this.applySelection(this.selectedId());
      this.renderer.setAnimationLoop(this.frame);
    });
  }

  ngOnDestroy(): void {
    this.ready = false;
    this.renderer?.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    this.controls?.dispose();
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.renderer?.dispose();
  }

  // ---------------------------------------------------------------- setup

  private initRenderer(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.hostRef.nativeElement);
    this.resize();

    this.scene.add(new THREE.HemisphereLight(0xdfeaf0, 0x22313a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-30, 60, 40);
    this.scene.add(sun);
  }

  private resize(): void {
    const el = this.hostRef.nativeElement;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildWorld(): void {
    const reserved = new Set(this.reservedSlots());
    FLOORS.forEach((f) => {
      const g = this.buildFloor(f.index, reserved);
      this.floorGroups.push(g);
      this.scene.add(g);
    });
    for (let k = 0; k < FLOORS.length - 1; k++) this.buildRamp(k);
  }

  // ---------------------------------------------------------------- floors

  private buildFloor(f: number, reserved: Set<string>): THREE.Group {
    const g = new THREE.Group();
    g.position.y = fy(f);

    // Slab, with an opening where the ramp passes through (upper floors only).
    const shape = new THREE.Shape();
    shape.moveTo(-FLOOR_W / 2, -FLOOR_D / 2);
    shape.lineTo(FLOOR_W / 2, -FLOOR_D / 2);
    shape.lineTo(FLOOR_W / 2, FLOOR_D / 2);
    shape.lineTo(-FLOOR_W / 2, FLOOR_D / 2);
    shape.closePath();
    if (f > 0) {
      const hole = new THREE.Path();
      const x0 = wx(RAMP.x0), x1 = wx(RAMP.x1), z0 = wz(RAMP.yLow), z1 = wz(RAMP.yHigh);
      hole.moveTo(x0, z0); hole.lineTo(x0, z1); hole.lineTo(x1, z1); hole.lineTo(x1, z0); hole.closePath();
      shape.holes.push(hole);
    }
    const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: SLAB_T, bevelEnabled: false });
    slabGeo.rotateX(Math.PI / 2); // shape y -> world z, thickness goes downward from y=0
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x3e4d56, roughness: 0.92, transparent: true, opacity: 0.55, depthWrite: false });
    this.slabMats.push(slabMat);
    g.add(new THREE.Mesh(slabGeo, slabMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), new THREE.LineBasicMaterial({ color: 0x8ca9b6 })));

    // Painted markings (slot lines, lane dashes, gate line).
    const slotLines: number[] = [];
    const laneDash: number[] = [];
    const gateLine: number[] = [];
    const Y = 0.03;
    const rect = (arr: number[], xa: number, za: number, xb: number, zb: number) =>
      arr.push(xa, Y, za, xb, Y, za, xb, Y, zb, xa, Y, za, xb, Y, zb, xa, Y, zb);

    for (const id of ROW_IDS) {
      const { y0, y1 } = ROWS[id];
      const xa = wx(SLOT_X0), xb = wx(SLOT_X0 + SLOTS_PER_ROW * SLOT_W);
      for (let i = 0; i <= SLOTS_PER_ROW; i++) {
        const x = wx(SLOT_X0 + i * SLOT_W);
        rect(slotLines, x - 0.05, wz(y0), x + 0.05, wz(y1));
      }
      rect(slotLines, xa, wz(y0) - 0.05, xb, wz(y0) + 0.05);
      rect(slotLines, xa, wz(y1) - 0.05, xb, wz(y1) + 0.05);
    }
    for (const laneY of [LANE_Y[1], LANE_Y[2]]) {
      for (let x = 1; x < RAMP.x0 - 2; x += 3.4) rect(laneDash, wx(x), wz(laneY) - 0.07, wx(x + 1.7), wz(laneY) + 0.07);
    }
    for (let y = LANE_Y[1] + 1; y < LANE_Y[2] - 1; y += 3.4) {
      rect(laneDash, wx(CROSS_X) - 0.07, wz(y), wx(CROSS_X) + 0.07, wz(y + 1.7));
    }
    if (f === 0) rect(gateLine, wx(GATE.x + 0.4), wz(6.2), wx(GATE.x + 1.2), wz(11.8));

    g.add(this.paint(slotLines, 0xc7d2d8));
    g.add(this.paint(laneDash, 0xc79a4a));
    if (f === 0) g.add(this.paint(gateLine, 0x35a39b));

    // Pillars.
    const pillarH = FLOOR_GAP - SLAB_T;
    const pillarGeo = new THREE.BoxGeometry(0.9, pillarH, 0.9);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x748893, roughness: 0.8 });
    for (let k = 0; k <= 4; k++) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(wx(SLOT_X0 + k * 4 * SLOT_W), pillarH / 2, wz(17));
      g.add(p);
    }

    // Low kerb around the edge (with a gap at the gate on the ground floor).
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x8397a2, roughness: 0.8 });
    const kerb = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), kerbMat);
      m.position.set(x, 0.25, z);
      g.add(m);
    };
    kerb(FLOOR_W, 0.4, 0, -FLOOR_D / 2 + 0.2);
    kerb(FLOOR_W, 0.4, 0, FLOOR_D / 2 - 0.2);
    kerb(0.4, FLOOR_D, FLOOR_W / 2 - 0.2, 0);
    if (f === 0) {
      kerb(0.4, 6, -FLOOR_W / 2 + 0.2, wz(3));
      kerb(0.4, FLOOR_D - 12, -FLOOR_W / 2 + 0.2, wz(12 + (FLOOR_D - 12) / 2));
      const postMat = new THREE.MeshStandardMaterial({ color: 0xc79a4a, roughness: 0.5 });
      for (const y of [6.2, 11.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), postMat);
        post.position.set(wx(GATE.x + 0.1), 0.75, wz(y));
        g.add(post);
      }
      const gate = this.textSprite('Entry / Exit', 'rgba(255,255,255,0.85)', 9, 34);
      gate.position.set(wx(GATE.x) - 5.5, 1.6, wz(GATE.y));
      g.add(gate);
    } else {
      kerb(0.4, FLOOR_D, -FLOOR_W / 2 + 0.2, 0);
    }

    // Labels.
    const title = this.textSprite(FLOORS[f].name, 'rgba(255,255,255,0.9)', 8.5, 40);
    title.position.set(wx(9), 1.4, wz(FLOOR_D) + 3.4);
    g.add(title);
    for (const id of ROW_IDS) {
      const s = this.textSprite(`Row ${id}`, 'rgba(160,184,196,0.9)', 3.4, 28);
      s.position.set(wx(SLOT_X0) - 2.4, 0.5, wz((ROWS[id].y0 + ROWS[id].y1) / 2));
      g.add(s);
    }

    // Other parked cars (demo filler so the floor looks lived in).
    const rng = mulberry32(4100 + f * 17);
    const muted = ['#7d8d97', '#94a4b0', '#6b7b86', '#a3b1bb', '#87969f', '#7b8a94'];
    const kinds: VehicleType[] = ['Sedan', 'SUV', 'Hatchback', 'Sedan', 'Van'];
    for (const row of ROW_IDS) {
      for (let n = 1; n <= SLOTS_PER_ROW; n++) {
        if (rng() > 0.36 || reserved.has(slotId(f, row, n))) continue;
        const c = slotCenter(row, n);
        const car = this.makeCar(muted[Math.floor(rng() * muted.length)], kinds[Math.floor(rng() * kinds.length)], false);
        car.position.set(wx(c.x) + (rng() - 0.5) * 0.2, 0.03, wz(c.y));
        car.rotation.y = (row === 'A' || row === 'C' ? Math.PI : 0) + (rng() - 0.5) * 0.06;
        g.add(car);
      }
    }
    return g;
  }

  private buildRamp(k: number): void {
    const len = RAMP.yHigh - RAMP.yLow;
    const ang = Math.atan2(FLOOR_GAP, len);
    const dirZ = k % 2 === 0 ? 1 : -1; // even ramps climb toward the front, odd ramps toward the back
    const width = RAMP.x1 - RAMP.x0;
    const mat = new THREE.MeshStandardMaterial({ color: 0x566872, roughness: 0.9 });
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, Math.hypot(len, FLOOR_GAP)), mat);
    ramp.rotation.x = -dirZ * ang;
    const midTop = new THREE.Vector3(wx(RAMP.xc), fy(k) + FLOOR_GAP / 2, wz((RAMP.yLow + RAMP.yHigh) / 2));
    const normal = new THREE.Vector3(0, Math.cos(ang), -dirZ * Math.sin(ang));
    ramp.position.copy(midTop).addScaledVector(normal, -0.25);

    const dashMat = new THREE.MeshBasicMaterial({ color: 0xc79a4a });
    const dashLen = Math.hypot(len, FLOOR_GAP);
    for (let i = 0; i < 7; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 1.5), dashMat);
      d.position.set(0, 0.26, -dashLen / 2 + (i + 0.5) * (dashLen / 7));
      ramp.add(d);
    }
    ramp.add(new THREE.LineSegments(new THREE.EdgesGeometry(ramp.geometry), new THREE.LineBasicMaterial({ color: 0x8ca9b6 })));
    this.rampMeshes.push(ramp);
    this.scene.add(ramp);
  }

  private paint(verts: number[], color: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  }

  // ---------------------------------------------------------------- cars

  private mat(color: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 });
      this.materials.set(color, m);
    }
    return m;
  }

  private makeCar(color: string, type: VehicleType, detailed: boolean): THREE.Group {
    const car = new THREE.Group();
    const inner = new THREE.Group();
    const [sw, sh, sl] = TYPE_SCALE[type];
    inner.scale.set(sw, sh, sl);
    car.add(inner);

    const bodyMat = this.mat(color);
    const body = new THREE.Mesh(this.geo.body, bodyMat);
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(this.geo.cabin, this.glassMat);
    cabin.position.set(0, 1.25, -0.15);
    const roof = new THREE.Mesh(this.geo.roof, bodyMat);
    roof.position.set(0, 1.55, -0.15);
    inner.add(body, cabin, roof);

    if (detailed) {
      for (const sx of [-0.95, 0.95]) {
        for (const sz of [-1.4, 1.4]) {
          const w = new THREE.Mesh(this.geo.wheel, this.wheelMat);
          w.position.set(sx, 0.38, sz);
          inner.add(w);
        }
      }
      for (const sx of [-0.6, 0.6]) {
        const h = new THREE.Mesh(this.geo.light, this.headMat);
        h.position.set(sx, 0.75, 2.2);
        const t = new THREE.Mesh(this.geo.light, this.tailMat);
        t.position.set(sx, 0.8, -2.2);
        inner.add(h, t);
      }
    }
    const shadow = new THREE.Mesh(this.geo.shadow, this.shadowMat);
    shadow.position.y = 0.02;
    car.add(shadow);
    return car;
  }

  private makeLabelTexture(text: string, bg: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 72;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(4, 4, 248, 64, 14);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '700 29px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 38);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private textSprite(text: string, color: string, worldWidth: number, fontPx: number): THREE.Sprite {
    const c = document.createElement('canvas');
    const g0 = c.getContext('2d')!;
    const font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g0.font = font;
    const w = Math.ceil(g0.measureText(text).width) + 20;
    const h = Math.ceil(fontPx * 1.5);
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(worldWidth, worldWidth * (h / w), 1);
    return s;
  }

  // ---------------------------------------------------------------- data

  private poseOf(v: VehicleState): Pose {
    return { x: wx(v.x), y: fy(v.floor) + 0.03, z: wz(v.y) };
  }

  private currentPose(view: VehicleView, now: number): Pose {
    const u = Math.min(1, Math.max(0, (now - view.t0) / view.dur));
    const e = this.ease(u);
    return { x: lerp(view.from.x, view.to.x, e), y: lerp(view.from.y, view.to.y, e), z: lerp(view.from.z, view.to.z, e) };
  }

  private ease(u: number): number {
    return 0.5 * u + 0.5 * (u * u * (3 - 2 * u));
  }

  private applyVehicles(list: VehicleState[]): void {
    const now = performance.now();
    for (const v of list) {
      const pose = this.poseOf(v);
      let view = this.views.get(v.id);

      if (!view) {
        view = this.createView(v, pose);
        this.views.set(v.id, view);
        continue;
      }

      const start = this.currentPose(view, now);
      const dx = pose.x - start.x;
      const dz = pose.z - start.z;
      const dist = Math.hypot(dx, dz);
      const reversingOut = v.status === 'Leaving' && view.status === 'Parked';

      view.fromFloor = view.toFloor;
      view.toFloor = v.floor;
      view.from = start;
      view.to = pose;
      view.t0 = now;
      view.dur = this.animMs();
      if (dist > 0.05) {
        if (!reversingOut) view.targetHeading = Math.atan2(dx, dz);
        const dh = pose.y - start.y;
        view.targetPitch = Math.abs(dh) > 0.5 ? -Math.atan2(dh, dist) : 0;
      }
      view.status = v.status;
    }
  }

  private createView(v: VehicleState, pose: Pose): VehicleView {
    const group = this.makeCar(v.color, v.type, true);
    group.rotation.order = 'YXZ';
    group.userData['vehicleId'] = v.id;
    group.position.set(pose.x, pose.y, pose.z);

    // Face the way the car would have driven into its slot.
    let heading = v.status === 'Leaving' ? -Math.PI / 2 : Math.PI / 2;
    if (v.slot) {
      const row = v.slot.slice(v.slot.indexOf('-') + 1, v.slot.indexOf('-') + 2) as RowId;
      heading = row === 'A' || row === 'C' ? Math.PI : 0;
    }
    group.rotation.y = heading;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.7, 3.2, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }),
    );
    ring.position.y = 0.06;
    ring.visible = false;
    group.add(ring);

    const texNormal = this.makeLabelTexture(v.plate, '#17242b');
    const texSelected = this.makeLabelTexture(v.plate, '#a8772e');
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texNormal, transparent: true, depthTest: false }));
    label.renderOrder = 10;
    ring.renderOrder = 9;
    label.scale.set(7.4, 2.08, 1);
    label.position.y = 3.6;
    group.add(label);
    this.scene.add(group);

    return {
      id: v.id, group, ring, label, texNormal, texSelected,
      from: pose, to: pose, fromFloor: v.floor, toFloor: v.floor,
      t0: performance.now(), dur: 1,
      heading, targetHeading: heading, pitch: 0, targetPitch: 0,
      status: v.status,
    };
  }

  private applySelection(id: string | null): void {
    this.selected = id;
    for (const view of this.views.values()) {
      const on = view.id === id;
      view.ring.visible = on;
      view.label.material.map = on ? view.texSelected : view.texNormal;
      view.label.material.needsUpdate = true;
    }
  }

  private applyFilter(f: FloorFilter): void {
    this.filter = f;
    this.floorGroups.forEach((g, i) => (g.visible = f === 'all' || f === i));
    this.rampMeshes.forEach((r, k) => (r.visible = f === 'all' || f === k || f === k + 1));
    const solid = f !== 'all';
    this.slabMats.forEach((m) => {
      m.opacity = solid ? 1 : 0.55;
      m.depthWrite = solid;
      m.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- camera

  private viewFor(f: FloorFilter): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const aspect = this.camera.aspect || 1.6;
    const k = Math.min(2.2, Math.max(1, 1.5 / aspect));
    if (f === 'all') {
      const target = new THREE.Vector3(0, FLOOR_GAP, 2);
      return { target, pos: target.clone().add(new THREE.Vector3(54, 46, 80).multiplyScalar(0.7 * k)) };
    }
    const target = new THREE.Vector3(0, fy(f), 0);
    return { target, pos: target.clone().add(new THREE.Vector3(26, 36, 50).multiplyScalar(0.85 * k)) };
  }

  private jumpTo(f: FloorFilter): void {
    const v = this.viewFor(f);
    this.camera.position.copy(v.pos);
    this.controls.target.copy(v.target);
    this.controls.update();
  }

  private flyTo(f: FloorFilter): void {
    const v = this.viewFor(f);
    this.camTween = {
      p0: this.camera.position.clone(), p1: v.pos,
      t0: this.controls.target.clone(), t1: v.target,
      start: performance.now(), dur: 900,
    };
  }

  // ---------------------------------------------------------------- picking

  private onPointerDown = (e: PointerEvent): void => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return; // it was a drag
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.views.values()].filter((v) => v.group.visible).map((v) => v.group);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData['vehicleId']) o = o.parent;
    if (o) this.zone.run(() => this.vehicleClicked.emit(o!.userData['vehicleId'] as string));
  };

  // ---------------------------------------------------------------- frame loop

  private frame = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    if (this.camTween) {
      const t = Math.min(1, (now - this.camTween.start) / this.camTween.dur);
      const e = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.camTween.p0, this.camTween.p1, e);
      this.controls.target.lerpVectors(this.camTween.t0, this.camTween.t1, e);
      if (t >= 1) this.camTween = undefined;
    }

    const k = 1 - Math.exp(-dt * 7);
    for (const v of this.views.values()) {
      const u = Math.min(1, Math.max(0, (now - v.t0) / v.dur));
      const e = this.ease(u);
      v.group.position.set(lerp(v.from.x, v.to.x, e), lerp(v.from.y, v.to.y, e), lerp(v.from.z, v.to.z, e));
      if (u >= 1) v.targetPitch = 0;
      v.heading += angleDiff(v.targetHeading, v.heading) * k;
      v.pitch += (v.targetPitch - v.pitch) * k;
      v.group.rotation.set(v.pitch, v.heading, 0);
      v.group.visible = this.filter === 'all' || v.fromFloor === this.filter || v.toFloor === this.filter;
      if (v.ring.visible) v.ring.scale.setScalar(1 + 0.07 * Math.sin(now / 260));
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
