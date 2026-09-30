import * as THREE from 'three';
import { scene } from '../render/renderer';

/* Small voxel particles: dust, chips, sand and smoke. One instanced draw call. */

const MAX = 220;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX);
mesh.count = 0; mesh.frustumCulled = false;
scene.add(mesh);

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; s: number; c: THREE.Color; g: number; floor: number }
const list: P[] = [];

/** Burst of particles thrown upward; `floor` stops them on the ground. */
export function puff(x: number, y: number, z: number, col: string, n = 5, up = 1.4, spread = 1.2, floor = -9) {
  for (let k = 0; k < n && list.length < MAX; k++) {
    list.push({ x, y, z, vx: (Math.random() - 0.5) * spread, vy: up * (0.6 + Math.random() * 0.6), vz: (Math.random() - 0.5) * spread, life: 0.5 + Math.random() * 0.3, s: 0.04 + Math.random() * 0.03, c: new THREE.Color(col), g: 4.5, floor });
  }
}
/** Rising smoke puff (negative gravity). */
export function smoke(x: number, y: number, z: number, col: string, size = 0.07, life = 1.6) {
  if (list.length >= MAX) return;
  list.push({ x, y, z, vx: (Math.random() - 0.5) * 0.25, vy: 0.45 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.25, life, s: size + Math.random() * 0.04, c: new THREE.Color(col), g: -0.2, floor: -9 });
}

const _m = new THREE.Matrix4();
export function tickParticles(dt: number) {
  for (const p of list) {
    p.life -= dt; p.vy -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
  list.forEach((p, k) => { const s = p.s * Math.min(1, p.life * 3); _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); mesh.setMatrixAt(k, _m); mesh.setColorAt(k, p.c); });
  mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
