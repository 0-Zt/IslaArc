import * as THREE from 'three';

/* A small voxel mesher for dense organic shapes (tree crowns, bushes).
   Only faces that touch air are emitted, and every face corner gets voxel ambient occlusion
   (darker where neighbouring voxels crowd it), which is what makes foliage look deep and leafy. */

export class Voxels {
  private m = new Map<string, THREE.Color>();
  constructor(public q: number) {}
  static key(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  set(x: number, y: number, z: number, c: THREE.Color) { this.m.set(Voxels.key(x, y, z), c); }
  has(x: number, y: number, z: number) { return this.m.has(Voxels.key(x, y, z)); }
  del(x: number, y: number, z: number) { this.m.delete(Voxels.key(x, y, z)); }
  get size() { return this.m.size; }
  entries() { return this.m.entries(); }
  /** Fills an ellipsoid (in voxel units, centre may be fractional). `color` gets the normalised position. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: (nx: number, ny: number, nz: number) => THREE.Color | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const nx = (x - cx) / rx, ny = (y - cy) / ry, nz = (z - cz) / rz;
          if (nx * nx + ny * ny + nz * nz > 1) continue;
          const c = color(nx, ny, nz); if (c) this.set(x, y, z, c);
        }
  }
  /** Surface voxels (at least one empty neighbour). */
  surface() {
    const out: [number, number, number][] = [];
    for (const k of this.m.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (!this.has(x + 1, y, z) || !this.has(x - 1, y, z) || !this.has(x, y + 1, z) || !this.has(x, y - 1, z) || !this.has(x, y, z + 1) || !this.has(x, y, z - 1)) out.push([x, y, z]);
    }
    return out;
  }
}

const FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const AO = [0.5, 0.66, 0.83, 1];

/** Builds the mesh. `ox, oy, oz` is where voxel (0,0,0)'s centre sits; `uvScale` maps world units to the detail texture. */
export function meshVoxels(vox: Voxels, ox = 0, oy = 0, oz = 0, uvScale = 2): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const q = vox.q, h = q / 2;
  for (const [k, c] of vox.entries()) {
    const [x, y, z] = k.split(',').map(Number);
    for (const f of FACES) {
      const [nx, ny, nz] = f.n;
      if (vox.has(x + nx, y + ny, z + nz)) continue;
      const base = pos.length / 3, ao: number[] = [];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const ux = f.u[0] * su, uy = f.u[1] * su, uz = f.u[2] * su, vx = f.v[0] * sv, vy = f.v[1] * sv, vz = f.v[2] * sv;
        const s1 = vox.has(x + nx + ux, y + ny + uy, z + nz + uz) ? 1 : 0;
        const s2 = vox.has(x + nx + vx, y + ny + vy, z + nz + vz) ? 1 : 0;
        const cr = vox.has(x + nx + ux + vx, y + ny + uy + vy, z + nz + uz + vz) ? 1 : 0;
        const a = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cr)];
        ao.push(a);
        const px = ox + x * q + (nx + ux + vx) * h, py = oy + y * q + (ny + uy + vy) * h, pz = oz + z * q + (nz + uz + vz) * h;
        pos.push(px, py, pz); nor.push(nx, ny, nz); col.push(c.r * a, c.g * a, c.b * a);
        const ax = Math.abs(nx), ay = Math.abs(ny);
        uv.push((ax ? pz : px) * uvScale, (ay ? pz : py) * uvScale);
      }
      // flip the diagonal so the occlusion gradient does not crease
      if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
