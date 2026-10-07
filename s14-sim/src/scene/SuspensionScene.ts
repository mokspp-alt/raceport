/**
 * 3D-сцена Three.js. Координаты машины (X вперёд, Y влево, Z вверх, мм) переводятся в
 * координаты Three (X вперёд, Y вверх, Z вправо, метры):  three = (X, Z, −Y) / 1000.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VehicleConfig } from '../config/vehicle';
import type { V3 } from '../physics/math';
import type { WheelGeom } from '../physics/kinematics';
import type { Computed } from '../physics/model';
import type { Eval } from '../physics/drift';

const t3 = (v: V3): THREE.Vector3 => new THREE.Vector3(v[0] / 1000, v[2] / 1000, -v[1] / 1000);

/** Цилиндр-«труба» между двумя точками. */
class Link {
  readonly mesh: THREE.Mesh;
  constructor(parent: THREE.Object3D, radius: number, color: number, opts: { emissive?: boolean } = {}) {
    const g = new THREE.CylinderGeometry(radius, radius, 1, 10);
    const m = opts.emissive
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });
    this.mesh = new THREE.Mesh(g, m);
    parent.add(this.mesh);
  }
  set(a: V3, b: V3): void {
    const A = t3(a);
    const B = t3(b);
    const d = B.clone().sub(A);
    const l = d.length();
    this.mesh.position.copy(A).add(B).multiplyScalar(0.5);
    this.mesh.scale.set(1, Math.max(l, 1e-6), 1);
    if (l > 1e-9) this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
}

class Marker {
  readonly mesh: THREE.Mesh;
  constructor(parent: THREE.Object3D, radius: number, color: number) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), new THREE.MeshBasicMaterial({ color }));
    parent.add(this.mesh);
  }
  set(p: V3): void {
    this.mesh.position.copy(t3(p));
  }
}

class WheelView {
  readonly tire: THREE.Mesh;
  readonly rim: THREE.Mesh;
  readonly patch: THREE.Mesh;
  constructor(parent: THREE.Object3D, width: number, radius: number) {
    const w = width / 1000;
    const r = radius / 1000;
    this.tire = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, w, 40),
      new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.9, transparent: true, opacity: 0.85 }),
    );
    this.rim = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.02, 24),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.7, roughness: 0.35 }),
    );
    this.patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.004, w * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    );
    parent.add(this.tire, this.rim, this.patch);
  }
  set(w: WheelGeom): void {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t3(w.spin).normalize());
    // spin уже в системе Three после t3 (вектор, а не точка) — t3 корректно переводит и направления
    for (const m of [this.tire, this.rim]) {
      m.position.copy(t3(w.p.wc));
      m.quaternion.copy(q);
    }
    this.patch.position.copy(t3(w.p.contact));
    this.patch.position.y += 0.003;
    this.patch.rotation.set(0, (w.headingDeg * Math.PI) / 180, 0);
  }
}

class FrontSideView {
  lcaF: Link;
  lcaR: Link;
  ucaF: Link;
  ucaR: Link;
  kingpinBody: Link;
  steerArm1: Link;
  steerArm2: Link;
  spindle: Link;
  tieRod: Link;
  axisLine: Link;
  trailLine: Link;
  wc: Marker;
  axisGround: Marker;
  lbj: Marker;
  ubj: Marker;
  otr: Marker;
  itr: Marker;
  constructor(parent: THREE.Object3D) {
    this.lcaF = new Link(parent, 0.009, 0x4f8fd6);
    this.lcaR = new Link(parent, 0.009, 0x4f8fd6);
    this.ucaF = new Link(parent, 0.008, 0x6fb0f0);
    this.ucaR = new Link(parent, 0.008, 0x6fb0f0);
    this.kingpinBody = new Link(parent, 0.012, 0xb9c2cf);
    this.steerArm1 = new Link(parent, 0.007, 0xb9c2cf);
    this.steerArm2 = new Link(parent, 0.007, 0xb9c2cf);
    this.spindle = new Link(parent, 0.009, 0xb9c2cf);
    this.tieRod = new Link(parent, 0.008, 0xe0a030);
    this.axisLine = new Link(parent, 0.0035, 0xff3fa0, { emissive: true });
    this.trailLine = new Link(parent, 0.004, 0xff9a3c, { emissive: true });
    this.wc = new Marker(parent, 0.016, 0xffffff);
    this.axisGround = new Marker(parent, 0.02, 0xff3fa0);
    this.lbj = new Marker(parent, 0.013, 0xe6edf7);
    this.ubj = new Marker(parent, 0.013, 0xe6edf7);
    this.otr = new Marker(parent, 0.012, 0xffc060);
    this.itr = new Marker(parent, 0.012, 0xffc060);
  }
  set(w: WheelGeom): void {
    const p = w.p;
    this.lcaF.set(p.lcaFront, p.lbj);
    this.lcaR.set(p.lcaRear, p.lbj);
    this.ucaF.set(p.ucaFront, p.ubj);
    this.ucaR.set(p.ucaRear, p.ubj);
    this.kingpinBody.set(p.lbj, p.ubj);
    this.steerArm1.set(p.lbj, p.otr);
    this.steerArm2.set(p.ubj, p.otr);
    this.spindle.set(p.wc, p.lbj);
    this.tieRod.set(p.itr, p.otr);
    // ось поворота: от точки на земле до 120 мм выше верхней шаровой
    const a: V3 = [p.ubj[0] - p.lbj[0], p.ubj[1] - p.lbj[1], p.ubj[2] - p.lbj[2]];
    const al = Math.hypot(...a);
    const top: V3 = [p.ubj[0] + (a[0] / al) * 120, p.ubj[1] + (a[1] / al) * 120, p.ubj[2] + (a[2] / al) * 120];
    this.axisLine.set(p.axisGround, top);
    this.trailLine.set(p.contact, p.axisGround);
    this.wc.set(p.wc);
    this.axisGround.set(p.axisGround);
    this.lbj.set(p.lbj);
    this.ubj.set(p.ubj);
    this.otr.set(p.otr);
    this.itr.set(p.itr);
  }
}

class RearSideView {
  arms: Link[] = [];
  constructor(parent: THREE.Object3D) {
    for (let i = 0; i < 5; i++) this.arms.push(new Link(parent, 0.008, 0x7a8696));
  }
  set(w: WheelGeom): void {
    const p = w.p;
    this.arms[0].set(p.lcaFront, p.lbj);
    this.arms[1].set(p.lcaRear, p.lbj);
    this.arms[2].set(p.ucaFront, p.ubj);
    this.arms[3].set(p.ucaRear, p.ubj);
    this.arms[4].set(p.lbj, p.ubj);
  }
}

export type CameraPreset = 'free' | 'top' | 'side' | 'front-left';

export class SuspensionScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private wheels: Record<'FL' | 'FR' | 'RL' | 'RR', WheelView>;
  private frontViews: { L: FrontSideView; R: FrontSideView };
  private rearViews: { L: RearSideView; R: RearSideView };
  private rackHousing: Link;
  private rackBar: Link;
  private cgMarker!: THREE.Group;
  private forceArrows: THREE.ArrowHelper[] = [];
  private velArrows: THREE.ArrowHelper[] = [];

  constructor(private container: HTMLElement, private cfg: VehicleConfig) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0e1116);
    this.scene.add(this.root);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a1d24, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(10, 40, 0x3a4352, 0x252b36);
    grid.position.set(-cfg.wheelbase / 2000, 0, 0);
    this.scene.add(grid);

    this.buildBody();
    const tf = cfg.tires.front;
    const tr = cfg.tires.rear;
    const rF = (tf.rimInch * 25.4) / 2 + (tf.width * tf.aspect) / 100;
    const rR = (tr.rimInch * 25.4) / 2 + (tr.width * tr.aspect) / 100;
    this.wheels = {
      FL: new WheelView(this.root, tf.width, rF),
      FR: new WheelView(this.root, tf.width, rF),
      RL: new WheelView(this.root, tr.width, rR),
      RR: new WheelView(this.root, tr.width, rR),
    };
    this.frontViews = { L: new FrontSideView(this.root), R: new FrontSideView(this.root) };
    this.rearViews = { L: new RearSideView(this.root), R: new RearSideView(this.root) };
    this.rackHousing = new Link(this.root, 0.026, 0x3a4352);
    this.rackBar = new Link(this.root, 0.012, 0xe0e6ef);

    for (let i = 0; i < 4; i++) {
      const fa = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, 0xe66767, 0.08, 0.05);
      const va = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, 0x1fc28b, 0.08, 0.05);
      fa.visible = va.visible = false;
      this.root.add(fa, va);
      this.forceArrows.push(fa);
      this.velArrows.push(va);
    }

    // центр тяжести: шар с «прицелом» и линия на землю
    this.cgMarker = new THREE.Group();
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    ring.rotation.x = Math.PI / 2;
    this.cgMarker.add(sph, ring);
    this.scene.add(this.cgMarker);

    this.setCamera('front-left');
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  private buildBody(): void {
    const L = 4.52;
    const W = 1.69;
    const cx = 0.95 - L / 2; // центр кузова: свес перед осью ≈ 0.95 м
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.12, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: 0x5aa0dc, transparent: true, opacity: 0.55 });
    const add = (w: number, h: number, d: number, x: number, y: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, 0);
      this.scene.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edge);
      e.position.copy(m.position);
      this.scene.add(e);
    };
    add(L, 0.42, W, cx, 0.5); // нижняя часть кузова
    add(2.0, 0.42, W * 0.88, cx - 0.35, 0.92); // салон
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(p: CameraPreset): void {
    const c = this.camera;
    const tgt = this.controls.target;
    const mid = -this.cfg.wheelbase / 2000;
    if (p === 'top') {
      tgt.set(mid, 0, 0);
      c.position.set(mid - 0.001, 7, 0);
    } else if (p === 'side') {
      tgt.set(mid, 0.4, 0);
      c.position.set(mid, 0.6, 6.5);
    } else if (p === 'front-left') {
      tgt.set(0, 0.3, -0.6);
      c.position.set(1.8, 1.0, -2.0);
    } else {
      tgt.set(mid, 0.4, 0);
      c.position.set(mid + 3.6, 2.4, -4.2);
    }
    this.controls.update();
  }

  /** Стрелки: сила шины (красная) и направление скольжения колеса (зелёная). */
  private updateArrows(ev: Eval | null): void {
    const order = ['FL', 'FR', 'RL', 'RR'];
    for (let i = 0; i < 4; i++) {
      const fa = this.forceArrows[i];
      const va = this.velArrows[i];
      const w = ev?.wheels.find((x) => x.id === order[i]);
      if (!w) {
        fa.visible = va.visible = false;
        continue;
      }
      const o = t3(w.contact);
      o.y = 0.01;
      const fl = Math.hypot(w.Fbody[0], w.Fbody[1]);
      fa.visible = fl > 1;
      if (fa.visible) {
        fa.position.copy(o);
        fa.setDirection(new THREE.Vector3(w.Fbody[0], 0, -w.Fbody[1]).normalize());
        fa.setLength(Math.max(0.12, fl / 5000), 0.09, 0.05);
      }
      va.visible = true;
      va.position.copy(o).setY(0.02);
      va.setDirection(new THREE.Vector3(w.velDir[0], 0, -w.velDir[1]).normalize());
      va.setLength(0.55, 0.09, 0.05);
    }
  }

  update(m: Computed, ev: Eval | null = null): void {
    this.updateArrows(ev);
    this.cgMarker.position.set(m.cg.xMm / 1000, m.cg.zMm / 1000, 0);
    this.wheels.FL.set(m.front.L);
    this.wheels.FR.set(m.front.R);
    this.wheels.RL.set(m.rear.L);
    this.wheels.RR.set(m.rear.R);
    this.frontViews.L.set(m.front.L);
    this.frontViews.R.set(m.front.R);
    this.rearViews.L.set(m.rear.L);
    this.rearViews.R.set(m.rear.R);
    const hw = this.cfg.front.rackHalfWidth + this.cfg.front.rackHalfStroke + 40;
    const zr = m.front.L.p.itr[2];
    this.rackHousing.set([m.front.L.p.itr[0], hw, zr], [m.front.L.p.itr[0], -hw, zr]);
    this.rackBar.set(m.front.L.p.itr, m.front.R.p.itr);
  }
}
