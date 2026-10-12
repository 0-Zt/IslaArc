import * as THREE from 'three';
import { renderer } from '../render/renderer';
import { makeFigure } from '../game/crew';
import { CHAR_DEFS, type CharId } from '../assets/characters';

/* Portraits of the figures for the HUD: each clay figure is rendered once, head and shoulders,
   into a small transparent image. Same model as in the world, so the faces always match. */

const cache: Partial<Record<CharId, string>> = {};
const SIZE = 192, OUT = 112;

export function portrait(id: CharId): string {
  if (cache[id]) return cache[id]!;
  let url = '';
  try { url = draw(id); } catch { url = ''; }
  cache[id] = url;
  return url;
}
export const faceColor = (id: CharId) => CHAR_DEFS[id]?.color || '#c98655';

function draw(id: CharId) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff3e0', '#7a5a40', 1.9));
  const key = new THREE.DirectionalLight('#ffe2c0', 3.0); key.position.set(1.6, 2.2, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight('#a8c8ff', 0.5); fill.position.set(-2, 0.5, 1); scene.add(fill);
  const f = makeFigure(id);
  f.ring.visible = false;
  f.root.traverse(o => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'PlaneGeometry') o.visible = false; });   // the shadow blob
  f.root.rotation.y = 0.38;
  scene.add(f.root);
  f.root.updateMatrixWorld(true);
  const head = new THREE.Vector3(); f.head.getWorldPosition(head);
  const half = 0.5;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 20);
  cam.position.set(head.x + 0.03, head.y - 0.05, head.z + 4); cam.lookAt(head.x + 0.03, head.y - 0.05, head.z);   // straight on, a bit below the eyes
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  const prevRT = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
  renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColor, prevAlpha); renderer.shadowMap.enabled = prevShadow;
  rt.dispose();
  scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  // the target holds linear colour: encode to sRGB and flip rows into a canvas
  const big = document.createElement('canvas'); big.width = big.height = SIZE;
  const bx = big.getContext('2d')!, im = bx.createImageData(SIZE, SIZE);
  const enc = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; enc[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const s = ((SIZE - 1 - y) * SIZE + x) * 4, d = (y * SIZE + x) * 4;
    im.data[d] = enc[px[s]]; im.data[d + 1] = enc[px[s + 1]]; im.data[d + 2] = enc[px[s + 2]]; im.data[d + 3] = px[s + 3];
  }
  bx.putImageData(im, 0, 0);
  const out = document.createElement('canvas'); out.width = out.height = OUT;
  const ox = out.getContext('2d')!; ox.imageSmoothingQuality = 'high'; ox.drawImage(big, 0, 0, OUT, OUT);
  return out.toDataURL('image/png');
}
