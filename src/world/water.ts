import * as THREE from 'three';
import { scene } from '../render/renderer';
import { N, tileAt } from './island';

/* Stylised water: a see-through turquoise shelf around the island that deepens to blue,
   pixel-stepped colour bands, foam that laps at the shore and a few twinkling highlights.
   A sandy seabed underneath shows through the shallows. One draw call each, no extra passes.

   A small texture stores, for each spot of the sea, how far it is from the nearest land.
   It is rebuilt whenever the island changes shape. */

const RES = 4;                // texels per tile
const MAXD = 4.5;             // distance (in tiles) where the sea is fully deep
const S = N * RES;
const shoreData = new Uint8Array(S * S * 4);
const shoreTex = new THREE.DataTexture(shoreData, S, S, THREE.RGBAFormat);
shoreTex.magFilter = THREE.LinearFilter; shoreTex.minFilter = THREE.LinearFilter;
shoreTex.wrapS = shoreTex.wrapT = THREE.ClampToEdgeWrapping;

export function updateWater() {
  // land cells, then distance from every texel to the nearest land cell (as a box)
  const isLand = (i: number, j: number) => { const t = tileAt(i, j); return !!t && t.type !== 'puente'; }; // the sea runs under bridges
  const W = Math.ceil(MAXD) + 1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / RES, py = (y + 0.5) / RES;
    let best = MAXD * MAXD;
    const ci = Math.floor(px), cj = Math.floor(py);
    for (let j = cj - W; j <= cj + W; j++) for (let i = ci - W; i <= ci + W; i++) {
      if (!isLand(i, j)) continue;
      const dx = Math.max(i - px, 0, px - (i + 1)), dy = Math.max(j - py, 0, py - (j + 1));
      const d = dx * dx + dy * dy; if (d < best) best = d;
    }
    const v = Math.min(1, Math.sqrt(best) / MAXD);
    const o = (y * S + x) * 4;
    shoreData[o] = shoreData[o + 1] = shoreData[o + 2] = Math.round(v * 255); shoreData[o + 3] = 255;
  }
  shoreTex.needsUpdate = true;
}

const uniforms = { uTime: { value: 0 }, uShore: { value: shoreTex }, uN: { value: N } };

/** Adds the world position and the shore-distance lookup to a Lambert material. */
function withShore(mat: THREE.MeshLambertMaterial, fragment: string, emissive = '') {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime; uniform sampler2D uShore; uniform float uN;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); } // colours below are written in sRGB
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float shoreDist(vec2 xz) {
  vec2 uv = (xz + uN * 0.5) / uN;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uShore, uv).r;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragment}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`);
  };
  return mat;
}

/* ---------- surface ---------- */
const waterMat = withShore(new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }), `
  vec2 cell = floor(vWPos.xz * 8.0) / 8.0;                  // pixel grid: 8 texels per tile
  float d = shoreDist(cell + 0.0625);
  float wob = (hash21(cell) - 0.5) * 0.05;                    // ragged pixel edges between bands
  float band = floor(clamp(d + wob, 0.0, 1.0) * 5.0) / 5.0;  // stepped colour bands
  vec3 shallow = lin(vec3(0.42, 0.86, 0.84)), mid = lin(vec3(0.22, 0.60, 0.86)), deep = lin(vec3(0.17, 0.45, 0.78));
  vec3 col = band < 0.5 ? mix(shallow, mid, band * 2.0) : mix(mid, deep, (band - 0.5) * 2.0);
  // gentle ripples: slow diagonal lines drifting across the sea
  float rip = sin(cell.x * 1.7 + cell.y * 0.9 + uTime * 0.9) * sin(cell.y * 1.3 - uTime * 0.6);
  col *= 0.96 + 0.06 * step(0.55, rip);
  // foam: a fixed rim on the shore plus waves rolling in toward it
  float wave = fract(d * 3.2 + uTime * 0.18);
  float foam = step(d, 0.03) + step(wave, 0.06) * step(d, 0.4) * (1.0 - d * 2.2) * 0.8;
  // twinkles: a few cells light up for a moment
  float tw = step(0.995, hash21(cell + floor(uTime * 1.3))) * (0.4 + 0.6 * d);
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, lin(vec3(0.9, 0.97, 1.0)), max(foam * 0.8, tw * 0.9));
  diffuseColor.rgb = col;
  diffuseColor.a = max(mix(0.7, 0.95, smoothstep(0.0, 0.6, d)), foam * 0.85);
  float glowW = max(foam, tw) * 0.08;
`, 'totalEmissiveRadiance += vec3(glowW);');

export const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.14;
water.receiveShadow = true;
water.renderOrder = 1;
scene.add(water);

/* ---------- seabed: sand near the island that sinks into dark blue ---------- */
const bedMat = withShore(new THREE.MeshLambertMaterial({}), `
  vec2 cell = floor(vWPos.xz * 8.0) / 8.0;
  float d = shoreDist(cell + 0.0625);
  float n = hash21(cell) * 0.08;
  vec3 sand = lin(vec3(0.80, 0.72, 0.50) - n), dark = lin(vec3(0.10, 0.30, 0.55));
  diffuseColor.rgb = mix(sand, dark, smoothstep(0.0, 0.5, d));
`);
const bed = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), bedMat);
bed.rotation.x = -Math.PI / 2;
bed.position.y = -0.42;
scene.add(bed);

export function tickWater(T: number) { uniforms.uTime.value = T; }
