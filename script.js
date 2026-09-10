/* ===========================================================================
   Jeth Roy L. Delos Santos — portfolio
   No libraries. The hero loads a .glb by hand, merges it into one buffer, and
   shades it in hand-written WebGL2; everything else is plain DOM.
   =========================================================================== */
(() => {
'use strict';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ── minimal matrix math ──────────────────────────────────────────────── */

function perspective(fovy, aspect, near, far){
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

/* An orthographic box instead of a perspective frustum: parallel lines stay
   parallel and nothing shrinks with distance, which is what makes a plan or an
   elevation measurable. Used only by the model shelf's 2D views.

   It has a second effect worth knowing about. Both fragment shaders fade the
   image out with distance using vD, which the vertex shader sets from the
   clip-space w. Under this matrix w is always 1, so the fog term collapses to
   zero on its own — a drawing comes out flat and even, with no code asking for
   it. */
function ortho(halfW, halfH, near, far){
  const nf = 1 / (near - far);
  return new Float32Array([
    1 / halfW, 0, 0, 0,
    0, 1 / halfH, 0, 0,
    0, 0, 2 * nf, 0,
    0, 0, (far + near) * nf, 1
  ]);
}

function lookAt(eye, tgt, up){
  let zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
  ]);
}

function mul(a, b){ // a * b, both column-major
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++){
    for (let r = 0; r < 4; r++){
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/* ── shaders ──────────────────────────────────────────────────────────── */

const MODEL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in float aEmit;
uniform mat4 uVP;
out vec3 vW; out vec3 vN; out vec4 vC; out float vE; out float vD;
void main(){
  vW = aPos; vN = aNrm; vC = aCol; vE = aEmit;
  vec4 p = uVP * vec4(aPos, 1.0);
  vD = p.w;
  gl_Position = p;
}`;

const MODEL_FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec4 vC; in float vE; in float vD;
uniform vec3 uBg; uniform vec3 uEye;
uniform float uBuild;   // 0..1, drives the ground-up reveal
uniform float uTop;     // model height, so the reveal is scale independent
uniform float uClay;    // 0 = author materials, 1 = neutral clay
uniform float uAlpha;   // pass multiplier: 1 opaque, <1 for the glass pass
out vec4 frag;

void main(){
  /* Geometry appears from the ground up the way a scene resolves when it
     finishes loading in a viewport, rather than fading in as a whole. */
  float cut = uBuild * uTop * 1.18;
  if (vW.y > cut) discard;

  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  vec3 key  = normalize(vec3(-0.38, 0.82,  0.43));
  vec3 fill = normalize(vec3( 0.71, 0.24, -0.66));
  float kd = max(dot(n, key), 0.0);
  float fd = max(dot(n, fill), 0.0);
  float sky = n.y * 0.5 + 0.5;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.4);

  vec3 albedo = mix(vC.rgb, vec3(0.455, 0.465, 0.485), uClay);
  float emit  = vE * (1.0 - uClay);

  vec3 lit = albedo * (0.16 + 0.74 * kd);
  lit += albedo * fd * 0.22;
  lit += vec3(0.09, 0.12, 0.17) * sky * 0.62;
  lit += vec3(0.86, 0.90, 0.96) * pow(kd, 26.0) * 0.30;

  /* Emissive materials are lights, not surfaces: they ignore the key light
     and gain at grazing angles, so neon reads as a tube and not a decal. */
  vec3 glow = albedo * (1.25 + 1.55 * fres);
  vec3 c = mix(lit, glow, emit);

  float edge = 1.0 - smoothstep(0.0, 0.05, cut - vW.y);
  c += vec3(0.30, 0.72, 0.86) * edge * step(uBuild, 0.999) * 1.10;

  c = c / (1.0 + c * 0.30);                        // roll-off, keeps neon in gamut
  float fog = clamp((vD - 4.2) / 9.5, 0.0, 1.0) * (0.82 - 0.62 * emit);
  c = mix(c, pow(uBg, vec3(2.2)), fog);            // fog mixed in linear space
  frag = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), vC.a * uAlpha);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aFade;
uniform mat4 uVP;
out float vF; out float vD;
void main(){
  vF = aFade;
  vec4 p = uVP * vec4(aPos, 1.0);
  vD = p.w;
  gl_Position = p;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float vF; in float vD;
uniform vec3 uColor; uniform vec3 uBg; uniform float uAlpha;
out vec4 frag;
void main(){
  float fog = clamp((vD - 4.0) / 9.5, 0.0, 1.0);
  frag = vec4(mix(uColor, uBg, fog * 0.85), uAlpha * vF * (1.0 - fog * 0.62));
}`;

/* ── glTF binary reader ───────────────────────────────────────────────────
   Enough of glTF 2.0 to load one authored scene: the JSON and BIN chunks,
   accessors behind strided buffer views, the node hierarchy, and the parts
   of a material that survive without textures. Roughly 150 lines instead of
   a 600 KB dependency, and the model is swappable by replacing the file.
   ------------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546C67, CHUNK_JSON = 0x4E4F534A, CHUNK_BIN = 0x004E4942;

function parseGLB(ab){
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a .glb file');
  let json = null, bin = null, at = 12;
  while (at + 8 <= ab.byteLength){
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    const from = at + 8;
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, from, len)));
    else if (type === CHUNK_BIN) bin = new Uint8Array(ab, from, len);
    at = from + len + (4 - (len % 4)) % 4;   // chunks are padded to four bytes
  }
  if (!json) throw new Error('.glb has no JSON chunk');
  return { json, bin };
}

const COMPONENT = {
  5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
  5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4]
};
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(g, bin, index){
  const a = g.accessors[index];
  const per = COMPONENTS_PER[a.type];
  const [Ctor, bytes] = COMPONENT[a.componentType];
  const float = a.componentType === 5126;
  const out = new (float ? Float32Array : Uint32Array)(a.count * per);
  if (a.bufferView === undefined) return out;      // spec: absent view means zeroes

  const bv = g.bufferViews[a.bufferView];
  const base = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const packed = per * bytes;
  const stride = bv.byteStride || packed;

  /* Fast path when the data is tightly packed and correctly aligned, which
     is the usual case; otherwise walk it through a DataView so a strided or
     odd-offset buffer view still reads correctly. */
  if (stride === packed && base % bytes === 0){
    out.set(new Ctor(bin.buffer, base, a.count * per));
    return out;
  }
  const dv = new DataView(bin.buffer);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16',
                5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let i = 0; i < a.count; i++)
    for (let c = 0; c < per; c++)
      out[i * per + c] = dv[get](base + i * stride + c * bytes, true);
  return out;
}

/* node transform → column-major 4x4 */
function nodeMatrix(n){
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0];
  const r = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const x = r[0], y = r[1], z = r[2], w = r[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0],       (xz - wy) * s[0],       0,
    (xy - wz) * s[1],       (1 - (xx + zz)) * s[1], (yz + wx) * s[1],       0,
    (xz + wy) * s[2],       (yz - wx) * s[2],       (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}

/* Colour and glow for one material. There are no textures in this model, so
   every material collapses to a constant that can ride on the vertices. */
function materialOf(g, index){
  const m = (g.materials && g.materials[index]) || {};
  const pbr = m.pbrMetallicRoughness || {};
  const b = pbr.baseColorFactor || [1, 1, 1, 1];
  const e = m.emissiveFactor || [0, 0, 0];
  const ext = m.extensions && m.extensions.KHR_materials_emissive_strength;
  const strength = (ext && ext.emissiveStrength) || 1;
  const em = [e[0] * strength, e[1] * strength, e[2] * strength];
  const peak = Math.max(em[0], em[1], em[2]);

  /* A material that emits more than it reflects is treated as a light: keep
     its hue at full saturation and let the shader decide how bright it gets,
     which is what the emissiveStrength extension is really saying. */
  if (peak > 0.35) return {
    col: [em[0] / peak, em[1] / peak, em[2] / peak, 1],
    emit: Math.min(1, 0.45 + peak * 0.14),
    blend: false
  };
  const blend = m.alphaMode === 'BLEND';
  return {
    col: [b[0], b[1], b[2], blend ? (b[3] === undefined ? 1 : b[3]) : 1],
    emit: 0,
    blend
  };
}

/* Walk the scene, transform every primitive into world space, and merge the
   lot into one interleaved buffer. The model arrives as 1504 separate
   primitives; merged, it draws in two calls instead of 1504. */
function buildScene(g, bin){
  const parts = [];
  let vertexCount = 0, indexCount = 0;

  const walk = (nodeIndex, parent) => {
    const n = g.nodes[nodeIndex];
    const local = nodeMatrix(n);
    const m = parent ? mul(parent, local) : local;
    if (n.mesh !== undefined){
      for (const prim of g.meshes[n.mesh].primitives){
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // triangles only
        if (prim.attributes.POSITION === undefined) continue;
        const pos = readAccessor(g, bin, prim.attributes.POSITION);
        const nrm = prim.attributes.NORMAL !== undefined
          ? readAccessor(g, bin, prim.attributes.NORMAL) : null;
        const idx = prim.indices !== undefined
          ? readAccessor(g, bin, prim.indices) : null;
        const count = pos.length / 3;
        parts.push({ m, pos, nrm, idx, count, mat: materialOf(g, prim.material) });
        vertexCount += count;
        indexCount += idx ? idx.length : count;
      }
    }
    if (n.children) for (const c of n.children) walk(c, m);
  };

  const scene = g.scenes[g.scene || 0];
  for (const root of scene.nodes) walk(root, null);

  /* Opaque first, transparent last, so the two passes are contiguous ranges
     of one index buffer and no per-frame sorting is needed. */
  parts.sort((a, b) => (a.mat.blend ? 1 : 0) - (b.mat.blend ? 1 : 0));

  const V = new Float32Array(vertexCount * 11);    // pos3 nrm3 col4 emit1
  const I = new Uint32Array(indexCount);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let v = 0, w = 0, opaqueIndices = 0;

  for (const p of parts){
    const m = p.m, base = v, c = p.mat.col, e = p.mat.emit;
    /* Normals need the inverse transpose in the general case; every node in
       this file scales uniformly, so the upper 3x3 plus a renormalise is
       exact and much cheaper. */
    for (let i = 0; i < p.count; i++){
      const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2];
      const px = m[0] * x + m[4] * y + m[8]  * z + m[12];
      const py = m[1] * x + m[5] * y + m[9]  * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (px < lo[0]) lo[0] = px; if (px > hi[0]) hi[0] = px;
      if (py < lo[1]) lo[1] = py; if (py > hi[1]) hi[1] = py;
      if (pz < lo[2]) lo[2] = pz; if (pz > hi[2]) hi[2] = pz;

      let nx = 0, ny = 1, nz = 0;
      if (p.nrm){
        const ax = p.nrm[i * 3], ay = p.nrm[i * 3 + 1], az = p.nrm[i * 3 + 2];
        nx = m[0] * ax + m[4] * ay + m[8]  * az;
        ny = m[1] * ax + m[5] * ay + m[9]  * az;
        nz = m[2] * ax + m[6] * ay + m[10] * az;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
      }
      const o = (base + i) * 11;
      V[o] = px; V[o + 1] = py; V[o + 2] = pz;
      V[o + 3] = nx; V[o + 4] = ny; V[o + 5] = nz;
      V[o + 6] = c[0]; V[o + 7] = c[1]; V[o + 8] = c[2]; V[o + 9] = c[3];
      V[o + 10] = e;
    }
    if (p.idx) for (let i = 0; i < p.idx.length; i++) I[w++] = base + p.idx[i];
    else for (let i = 0; i < p.count; i++) I[w++] = base + i;
    if (!p.mat.blend) opaqueIndices = w;
    v += p.count;
  }

  /* Normalise into the viewport's own units: footprint inside ±EXTENT on the
     ground plane, base sitting exactly on y = 0, so the camera presets and
     the grid stay valid whatever model is dropped in here later. */
  const span = Math.max(hi[0] - lo[0], hi[2] - lo[2]) || 1;
  const k = (EXTENT * 2) / span;
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  for (let i = 0; i < vertexCount; i++){
    const o = i * 11;
    V[o]     = (V[o] - cx) * k;
    V[o + 1] = (V[o + 1] - lo[1]) * k;
    V[o + 2] = (V[o + 2] - cz) * k;
  }

  return {
    vertices: V, indices: I, vertexCount,
    opaqueIndices, blendIndices: indexCount - opaqueIndices,
    objects: parts.length,
    top: (hi[1] - lo[1]) * k,
    radius: Math.max(EXTENT, (hi[1] - lo[1]) * k)
  };
}

/* ── hero viewport ────────────────────────────────────────────────────── */

const EXTENT = 2.4;                      // model half-footprint in world units
const MODEL_URL = 'model/grand-arena.glb';

/* Eight framings, none of them chosen by eye. The exterior three were picked by
   measuring how much of the mesh lands inside the frustum; the interior five
   came out of a ray-cast survey of the model — floor height sampled on a grid
   to find the pitch (y = 0.095) and the rake, then candidate cameras scored on
   how much of the frame they fill and how close the nearest surface sits. Every
   interior eye is one eye-height above whatever it stands on.

   `tx/ty/tz` is the point the camera orbits. Exterior views sit on the axis and
   let the layout push them off-centre; interior views aim at a specific piece of
   the building and stay where they are put. `inside` blends the two behaviours,
   so a move from the concourse to the sky is one continuous shot. */
const VIEWS = [
  { name: 'Establishing', group: 'Outside', key: 'establishing',
    note: 'The whole envelope, three-quarter, from above the approach.',
    yaw: -0.700, pitch:  0.360, radius: 6.100, tx: 0, ty: 0.45, tz: 0, inside: 0 },
  { name: 'Facade', group: 'Outside', key: 'facade',
    note: 'Square to the west face — the structural rhythm reads here.',
    yaw: -0.950, pitch:  0.110, radius: 6.500, tx: 0, ty: 0.52, tz: 0, inside: 0 },
  { name: 'Roof plan', group: 'Outside', key: 'roof',
    note: 'Top down. The canopy ring and the oculus over the pitch.',
    yaw: -0.300, pitch:  0.950, radius: 7.400, tx: 0, ty: 0.30, tz: 0, inside: 0 },

  { name: 'Centre spot', group: 'Inside', key: 'centre',
    note: 'Standing on the pitch, looking at the far stand.',
    yaw:  0.000, pitch: -0.143, radius: 2.324, tx:  0.00, ty: 0.46, tz: -2.00, inside: 1 },
  { name: 'The stand', group: 'Inside', key: 'stand',
    note: 'A seat on the halfway line, pitch below, roof above.',
    yaw:  1.571, pitch:  0.151, radius: 1.608, tx: -0.15, ty: 0.10, tz:  0.00, inside: 1 },
  { name: 'Upper tier', group: 'Inside', key: 'upper',
    note: 'The corner of the top deck. The whole bowl in one frame.',
    yaw:  0.785, pitch:  0.251, radius: 2.000, tx: -0.05, ty: 0.10, tz: -0.05, inside: 1 },
  { name: 'Stair run', group: 'Inside', key: 'stair',
    note: 'Low on the rake, looking up the steps to the concourse.',
    yaw: -1.055, pitch: -0.341, radius: 1.183, tx:  1.95, ty: 0.60, tz:  0.00, inside: 1 },
  { name: 'Roof canopy', group: 'Inside', key: 'canopy',
    note: 'Head back on the pitch: the canopy underside and open sky.',
    yaw:  0.000, pitch: -0.644, radius: 1.500, tx:  0.00, ty: 1.20, tz: -0.34, inside: 1 }
];

const BG     = [0.1412, 0.1569, 0.1725];   // --stage
const GRID_C = [0.42, 0.46, 0.51];
const AX_X   = [0.760, 0.333, 0.306];      // --ax-x
const AX_Z   = [0.400, 0.600, 0.780];      // --ax-z

async function initViewport(){
  const canvas = $('#viewport');
  const stage  = canvas && canvas.closest('.stage');
  if (!canvas || !stage) return;

  const loader = $('#stage-load');
  const setStat = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
  const fmt = n => n.toLocaleString('en-US');
  const done = ok => {
    if (loader) loader.classList.add('is-done');
    stage.classList.add(ok ? 'is-ready' : 'is-static');
  };

  const gl = canvas.getContext('webgl2', {
    antialias: true, alpha: false, depth: true, powerPreference: 'high-performance'
  });
  if (!gl){ stageMessage('This browser has no WebGL2, so the model cannot be shown here.'); done(false); return; }

  /* Load the model first: there is nothing to draw without it, and reading
     the real byte count lets the progress bar tell the truth. It goes through
     the shared cache so the shelf further down the page reuses this parse
     instead of fetching and merging 3 MB a second time. */
  let scene;
  try {
    scene = await getScene(MODEL_URL, p => {
      if (loader) loader.style.setProperty('--p', p.toFixed(3));
      const pct = $('#load-pct'); if (pct) pct.textContent = Math.round(p * 100) + '%';
    });
  } catch (err){
    stageMessage(
      location.protocol === 'file:'
        ? 'The model cannot load straight from the file system. Serve the folder over HTTP and it will appear.'
        : 'The model could not be loaded.');
    done(false);
    return;
  }

  setStat('stat-verts', fmt(scene.vertexCount));
  setStat('stat-tris',  fmt(scene.indices.length / 3));
  setStat('stat-objs',  fmt(scene.objects));

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };

  let modelProg, lineProg;
  try {
    modelProg = program(MODEL_VS, MODEL_FS);
    lineProg  = program(LINE_VS,  LINE_FS);
  } catch (err){
    stageMessage('The shaders would not compile on this device.');
    done(false);
    return;
  }

  /* ground grid, faded radially so it has no visible edge */
  const G = 7.2, S = 0.6, SEG = 8, Y = -0.004;
  const gp = [], gf = [];
  const fade = (x, z) => Math.max(0, 1 - Math.pow(Math.hypot(x, z) / G, 1.6));
  for (let i = -Math.round(G / S); i <= Math.round(G / S); i++){
    const t = i * S;
    for (let s = 0; s < SEG; s++){
      const a = -G + (2 * G * s) / SEG, b = -G + (2 * G * (s + 1)) / SEG;
      gp.push(a, Y, t, b, Y, t);  gf.push(fade(a, t), fade(b, t));
      gp.push(t, Y, a, t, Y, b);  gf.push(fade(t, a), fade(t, b));
    }
  }
  const gridPos = new Float32Array(gp), gridFade = new Float32Array(gf);
  const axisPos = new Float32Array([0, Y, 0,  G * 0.92, Y, 0,   0, Y, 0,  0, Y, G * 0.92]);
  const axisFade = new Float32Array([1, 0.15, 1, 0.15]);

  const buf = (data, target = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const vtxB  = buf(scene.vertices);
  const idxB  = buf(scene.indices, gl.ELEMENT_ARRAY_BUFFER);
  const gridB = buf(gridPos), gridFB = buf(gridFade);
  const axisB = buf(axisPos), axisFB = buf(axisFade);

  const vao = setup => { const v = gl.createVertexArray(); gl.bindVertexArray(v); setup(); gl.bindVertexArray(null); return v; };
  const attr = (b, loc, size, stride = 0, offset = 0) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  };
  const ST = 44;                                   // 11 floats per vertex
  const vModel = vao(() => {
    attr(vtxB, 0, 3, ST, 0); attr(vtxB, 1, 3, ST, 12);
    attr(vtxB, 2, 4, ST, 24); attr(vtxB, 3, 1, ST, 40);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxB);
  });
  const vGrid = vao(() => { attr(gridB, 0, 3); attr(gridFB, 1, 1); });
  const vAxis = vao(() => { attr(axisB, 0, 3); attr(axisFB, 1, 1); });

  const U = (p, names) => { const o = {}; names.forEach(n => o[n] = gl.getUniformLocation(p, n)); return o; };
  const mu = U(modelProg, ['uVP', 'uBg', 'uEye', 'uBuild', 'uTop', 'uClay', 'uAlpha']);
  const lu = U(lineProg,  ['uVP', 'uColor', 'uBg', 'uAlpha']);

  /* ---- camera state ---------------------------------------------------- */
  const V0 = VIEWS[0];
  const cam = { yaw: V0.yaw, pitch: V0.pitch, radius: V0.radius,
                tx: V0.tx, ty: V0.ty, tz: V0.tz, inside: V0.inside };
  let fit = 1, offx = -0.70, lift = 0, wide = 1;   // framing corrections from resize()
  let build = reduced ? 1 : 0, buildT0 = 0, anim = null;
  let clay = 0, clayTo = 0;
  let dirty = true, queued = false, W = 1, H = 1, draws = 0;

  /* Outside you orbit a building; inside you stand in a room. The two want
     different limits, so the clamps are blended by the same `inside` value
     that blends the framing. */
  const LIM = {
    out: { rMin: 3.1, rMax: 13.0, pMin: 0.06, pMax: 1.24 },
    in:  { rMin: 0.5, rMax: 3.4,  pMin: -1.02, pMax: 0.98 }
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const limits = () => {
    const t = cam.inside;
    return {
      rMin: lerp(LIM.out.rMin, LIM.in.rMin, t), rMax: lerp(LIM.out.rMax, LIM.in.rMax, t),
      pMin: lerp(LIM.out.pMin, LIM.in.pMin, t), pMax: lerp(LIM.out.pMax, LIM.in.pMax, t)
    };
  };

  function resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(stage.clientWidth * dpr));
    const h = Math.max(1, Math.round(stage.clientHeight * dpr));
    if (w === W && h === H) return;
    W = w; H = h; canvas.width = w; canvas.height = h;
    /* A fixed distance crops the building badly once the viewport goes
       portrait, so pull back as the aspect narrows, drop the off-centre
       framing — there is no room beside the headline on a phone — and lower
       the look-at point, which lifts the model clear of the scrim the hero
       text sits on. Both constants were picked by measuring how much of the
       mesh lands in frame and how much of it ends up under that scrim.

       An interior camera cannot pull back: there is a wall behind it. So it
       widens the lens instead, which is what you would do standing there. */
    const a = stage.clientWidth / Math.max(1, stage.clientHeight);
    offx = a > 1.15 ? -0.70 : 0;
    fit  = a >= 1.30 ? 1 : 1 + (1.30 - Math.min(Math.max(a, 0.50), 1.30)) * 1.02;
    wide = a >= 1.30 ? 1 : 1 + (1.30 - Math.min(Math.max(a, 0.50), 1.30)) * 0.42;
    lift = (fit - 1) * -0.55;
    setStat('stat-res', `${Math.round(stage.clientWidth)}×${Math.round(stage.clientHeight)}`);
    dirty = true;
  }

  function viewProj(){
    const t = cam.inside;
    const R  = cam.radius * lerp(fit, 1, t);
    const ox = offx * (1 - t);
    const ly = lift * (1 - t);
    const tgt = [cam.tx + ox, cam.ty + ly, cam.tz];
    const eye = [
      tgt[0] + R * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      tgt[1] + R * Math.sin(cam.pitch),
      tgt[2] + R * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    ];
    /* Near plane is tight because interior cameras get within 40 mm of a
       surface at this scale; far is only 40 because the model is 4.8 across
       and the depth buffer is better spent on the near half. */
    const fov = 0.60 * lerp(1, wide, t);
    return { vp: mul(perspective(fov, W / H, 0.025, 40), lookAt(eye, tgt, [0, 1, 0])), eye, tgt };
  }

  function draw(){
    const { vp, eye, tgt } = viewProj();
    draws = 0;
    gl.viewport(0, 0, W, H);
    gl.clearColor(BG[0], BG[1], BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    gl.useProgram(modelProg);
    gl.uniformMatrix4fv(mu.uVP, false, vp);
    gl.uniform3fv(mu.uBg, BG);
    gl.uniform3fv(mu.uEye, eye);
    gl.uniform1f(mu.uBuild, build);
    gl.uniform1f(mu.uTop, scene.top);
    gl.uniform1f(mu.uClay, clay);
    gl.uniform1f(mu.uAlpha, 1);
    gl.bindVertexArray(vModel);
    gl.drawElements(gl.TRIANGLES, scene.opaqueIndices, gl.UNSIGNED_INT, 0); draws++;

    /* ground plane last of the opaque work would z-fight the model base, so
       the grid is drawn after the solid and reads through it only where the
       depth buffer lets it */
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lu.uVP, false, vp);
    gl.uniform3fv(lu.uBg, BG);

    gl.uniform3fv(lu.uColor, GRID_C);
    gl.uniform1f(lu.uAlpha, 0.34 * build);
    gl.bindVertexArray(vGrid);
    gl.drawArrays(gl.LINES, 0, gridPos.length / 3); draws++;

    gl.bindVertexArray(vAxis);
    gl.uniform1f(lu.uAlpha, 0.62 * build);
    gl.uniform3fv(lu.uColor, AX_X);
    gl.drawArrays(gl.LINES, 0, 2); draws++;
    gl.uniform3fv(lu.uColor, AX_Z);
    gl.drawArrays(gl.LINES, 2, 2); draws++;

    /* the glass: no depth write, drawn after everything it sits in front of */
    if (scene.blendIndices){
      gl.useProgram(modelProg);
      gl.uniform1f(mu.uAlpha, 1);
      gl.bindVertexArray(vModel);
      gl.drawElements(gl.TRIANGLES, scene.blendIndices, gl.UNSIGNED_INT, scene.opaqueIndices * 4);
      draws++;
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    setStat('stat-draw', String(draws));
    drawGizmo(eye, tgt);
  }

  /* ---- animation ------------------------------------------------------- */
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  function tick(now){
    queued = false;
    resize();
    let more = false;

    if (buildT0 && build < 1){
      const p = Math.min(Math.max((now - buildT0) / 1600, 0), 1);
      build = p >= 1 ? 1 : 1 - Math.pow(1 - p, 2.4);
      dirty = true; more = build < 1;
    }
    if (anim){
      const p = Math.min(Math.max((now - anim.t0) / anim.dur, 0), 1);
      const e = ease(p);
      for (const k of ANIM_KEYS) cam[k] = anim.from[k] + (anim.to[k] - anim.from[k]) * e;
      if (p >= 1) anim = null; else more = true;
      dirty = true;
    }
    if (clay !== clayTo){
      const step = 0.12 * (clayTo > clay ? 1 : -1);
      clay = Math.abs(clayTo - clay) <= 0.12 ? clayTo : clay + step;
      dirty = true; more = more || clay !== clayTo;
    }
    /* The tour is the one place the camera moves without being asked, and it
       has to be asked for first. It holds the loop awake while it runs. */
    if (tour.on){
      if (!anim && now >= tour.next){
        tour.i = (tour.i + 1) % VIEWS.length;
        applyView(tour.i, 2000);
        tour.next = now + 2000 + tour.dwell;
      }
      more = true;
    }
    if (dirty){ draw(); dirty = false; }
    if (more) kick();
  }

  /* The loop idles once the build settles: it only runs while something is
     actually moving, which is why the page is not burning battery at rest. */
  function kick(){ if (queued) return; queued = true; requestAnimationFrame(tick); }

  const ANIM_KEYS = ['yaw', 'pitch', 'radius', 'tx', 'ty', 'tz', 'inside'];

  function flyTo(v, ms){
    const to = {};
    for (const k of ANIM_KEYS) to[k] = v[k];
    if (reduced){ Object.assign(cam, to); dirty = true; kick(); return; }
    let d = (v.yaw - cam.yaw) % (Math.PI * 2);     // always take the short way round
    if (d >  Math.PI) d -= Math.PI * 2;            // modulo, not a loop: a while
    if (d < -Math.PI) d += Math.PI * 2;            // here would hang on a huge yaw
    to.yaw = cam.yaw + d;
    const from = {};
    for (const k of ANIM_KEYS) from[k] = cam[k];
    anim = { from, to, t0: performance.now(), dur: ms || 900 };
    kick();
  }

  /* ---- input ----------------------------------------------------------- */
  const hint = $('#orbit-hint');
  const buttons = $$('#views [data-view]');
  const nameEl = $('#view-name');
  const noteEl = $('#view-note');
  const tourBtn = $('#tour');
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const touched = () => { if (hint) hint.classList.add('is-gone'); };
  const tour = { on: false, i: 0, next: 0, dwell: 2600 };

  /* One function every entry point goes through — buttons, keys, the tour, and
     the links down in the work section — so the rail, the caption and the
     camera can never disagree about which view is current. */
  function applyView(i, ms){
    const v = VIEWS[i];
    if (!v) return;
    buttons.forEach(b => {
      const on = +b.dataset.view === i;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (nameEl) nameEl.textContent = v.name;
    if (noteEl) noteEl.textContent = v.note;
    flyTo(v, ms);
  }

  function stopTour(){
    if (!tour.on) return;
    tour.on = false;
    if (tourBtn){
      tourBtn.setAttribute('aria-pressed', 'false');
      tourBtn.classList.remove('is-on');
      tourBtn.textContent = tourBtn.dataset.play || 'Play tour';
    }
  }

  /* The moment the reader drags, no preset is true any more. Saying so keeps
     the rail honest — and gives them a way back to a framed shot. */
  function clearView(){
    if (!buttons.some(b => b.classList.contains('is-on'))) return;
    buttons.forEach(b => {
      b.classList.remove('is-on');
      b.setAttribute('aria-pressed', 'false');
    });
    if (nameEl) nameEl.textContent = 'Free look';
    if (noteEl) noteEl.textContent = 'Your own angle. Pick a camera to get back to a framed shot.';
  }

  buttons.forEach(b => b.addEventListener('click', () => {
    stopTour();
    applyView(+b.dataset.view, 1100);
    touched();
  }));

  if (tourBtn) tourBtn.addEventListener('click', () => {
    if (tour.on){ stopTour(); return; }
    tour.on = true;
    tour.i = VIEWS.findIndex(v => v.name === (nameEl && nameEl.textContent));
    if (tour.i < 0) tour.i = 0;
    tour.next = performance.now();          // advance on the next frame
    tourBtn.setAttribute('aria-pressed', 'true');
    tourBtn.classList.add('is-on');
    tourBtn.textContent = tourBtn.dataset.stop || 'Stop tour';
    touched(); kick();
  });

  /* Anything on the page can ask for a view by name: the work section uses
     this to jump the camera to the shot it is describing. The viewport is at
     the top of the page, so scroll back to it first — otherwise the click
     re-aims a camera the reader cannot see. The move is timed to land as the
     scroll finishes rather than playing out off-screen. */
  $$('[data-goto]').forEach(a => a.addEventListener('click', () => {
    const i = VIEWS.findIndex(v => v.key === a.dataset.goto);
    if (i < 0) return;
    stopTour();
    const away = stage.getBoundingClientRect().bottom < window.innerHeight * 0.5;
    if (away){
      stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      canvas.focus({ preventScroll: true });
    }
    const run = () => { applyView(i, 1400); touched(); };
    if (away && !reduced) setTimeout(run, 420); else run();
  }));

  const clayBtn = $('#clay');
  if (clayBtn) clayBtn.addEventListener('click', () => {
    clayTo = clayTo ? 0 : 1;
    clayBtn.setAttribute('aria-pressed', clayTo ? 'true' : 'false');
    clayBtn.classList.toggle('is-on', !!clayTo);
    kick();
  });

  const orbit = (dx, dy) => {
    const L = limits();
    cam.yaw   -= dx * 0.0055;
    cam.pitch  = clamp(cam.pitch + dy * 0.0040, L.pMin, L.pMax);
    anim = null; stopTour(); clearView(); dirty = true; kick();
  };
  const dolly = f => {
    const L = limits();
    cam.radius = clamp(cam.radius * f, L.rMin, L.rMax);
    anim = null; stopTour(); clearView(); dirty = true; kick();
  };

  /* One finger orbits and still lets the page scroll vertically; two fingers
     pinch to dolly, which no browser gesture is competing for. Wheel is left
     alone on purpose — a full-height hero that eats the scroll wheel is a
     trap, and the camera rail covers framing anyway. */
  const pointers = new Map();
  let last = null, pinch = 0;
  canvas.style.touchAction = 'pan-y';

  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) last = { x: e.clientX, y: e.clientY };
    touched();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2){
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) dolly(pinch / (d || 1));
      pinch = d; last = null;
      return;
    }
    if (!last) { last = { x: e.clientX, y: e.clientY }; return; }
    orbit(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  });
  const release = e => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_){}
    if (pointers.size < 2) pinch = 0;
    if (!pointers.size) last = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* the same camera, reachable without a mouse */
  canvas.addEventListener('keydown', e => {
    const step = e.shiftKey ? 48 : 18;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]){ orbit(map[e.key][0], map[e.key][1]); touched(); e.preventDefault(); return; }
    if (e.key === '+' || e.key === '='){ dolly(0.88); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_'){ dolly(1.14); e.preventDefault(); }
    else if (e.key === 't' || e.key === 'T'){ tourBtn && tourBtn.click(); e.preventDefault(); }
    else if (e.key >= '1' && e.key <= '9' && +e.key <= VIEWS.length){
      stopTour(); applyView(+e.key - 1, 1100); touched(); e.preventDefault();
    }
  });

  if (hint) setTimeout(touched, 8000);

  /* ---- axis gizmo: a real widget, it reads the live camera --------------- */
  const gz = $('#gizmo');
  const gctx = gz ? gz.getContext('2d') : null;
  const AXES = [
    { v: [1, 0, 0], c: '#C2554E', label: 'X' },
    { v: [0, 1, 0], c: '#8AA85E', label: 'Y' },
    { v: [0, 0, 1], c: '#6699C7', label: 'Z' }
  ];

  function drawGizmo(eye, tgt){
    if (!gctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = gz.clientWidth || 132;
    if (gz.width !== size * dpr){ gz.width = size * dpr; gz.height = size * dpr; }
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.clearRect(0, 0, size, size);

    let fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2];
    let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let rx = -fz, ry = 0, rz = fx;
    l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;

    const cx = size / 2, cy = size / 2, R = size * 0.30, r = size * 0.082;
    const pts = [];
    for (const a of AXES){
      for (const s of [1, -1]){
        const v = [a.v[0] * s, a.v[1] * s, a.v[2] * s];
        pts.push({
          x: cx + (v[0] * rx + v[1] * ry + v[2] * rz) * R,
          y: cy - (v[0] * ux + v[1] * uy + v[2] * uz) * R,
          z: v[0] * fx + v[1] * fy + v[2] * fz,
          c: a.c, label: s > 0 ? a.label : '', pos: s > 0
        });
      }
    }
    pts.sort((p, q) => q.z - p.z);

    gctx.lineWidth = 1.6; gctx.lineCap = 'round';
    for (const p of pts){
      gctx.globalAlpha = p.z > 0 ? 0.45 : 1;
      gctx.strokeStyle = p.c;
      gctx.beginPath(); gctx.moveTo(cx, cy); gctx.lineTo(p.x, p.y); gctx.stroke();
      gctx.beginPath(); gctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (p.pos){
        gctx.fillStyle = p.c; gctx.fill();
        gctx.globalAlpha = 1;
        gctx.fillStyle = '#17191C';
        gctx.font = `500 ${Math.round(size * 0.078)}px 'IBM Plex Mono', monospace`;
        gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
        gctx.fillText(p.label, p.x, p.y + 0.5);
      } else {
        gctx.fillStyle = '#24282C'; gctx.fill();
        gctx.strokeStyle = p.c; gctx.lineWidth = 1.4; gctx.stroke(); gctx.lineWidth = 1.6;
      }
    }
    gctx.globalAlpha = 1;
  }

  /* ---- go -------------------------------------------------------------- */
  addEventListener('resize', () => { dirty = true; kick(); });
  resize();
  done(true);

  /* The one orchestrated moment on the page: the building resolves from the
     ground up while the camera settles into the establishing view. After
     this the loop idles and motion only ever answers something you did —
     including the tour, which has to be started before it will run. */
  if (nameEl) nameEl.textContent = VIEWS[0].name;
  if (noteEl) noteEl.textContent = VIEWS[0].note;
  if (reduced){
    build = 1; dirty = true; kick();
  } else {
    Object.assign(cam, {
      yaw: VIEWS[0].yaw - 0.42, pitch: VIEWS[0].pitch + 0.26,
      radius: VIEWS[0].radius * 1.22,
      tx: VIEWS[0].tx, ty: VIEWS[0].ty, tz: VIEWS[0].tz, inside: 0
    });
    buildT0 = performance.now();
    flyTo(VIEWS[0], 2100);
  }
}

/* Streamed so the progress bar reads real bytes rather than a fake timer.
   Resolves to [json, bin, byteLength] — the size is handed back because the
   shelf prints it, and reading it off the response beats typing it in. */
async function loadModel(url, onProgress){
  /* A single-file build (see build-preview.py) drops each model into the page
     as base64 so it also opens straight from the file system, where fetch is
     blocked. Elements are keyed by the path they stand in for, so a page with
     several models still picks the right one. The hosted site has no such
     element and goes down the normal path. */
  const inline = $$('script[data-glb]').find(s => s.getAttribute('data-glb') === url);
  if (inline){
    const b = atob(inline.textContent.trim());
    const bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    onProgress(1);
    const { json, bin } = parseGLB(bytes.buffer);
    if (!bin) throw new Error('.glb has no binary chunk');
    return [json, bin, bytes.length];
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (!res.body || !total){
    buf = await res.arrayBuffer();
    onProgress(1);
  } else {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;){
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(got / total, 1));
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (const c of chunks){ all.set(c, at); at += c.length; }
    buf = all.buffer;
  }
  const { json, bin } = parseGLB(buf);
  if (!bin) throw new Error('.glb has no binary chunk');
  return [json, bin, buf.byteLength];
}

/* One fetch and one merge per file, however many viewports want it. The hero
   and the shelf both show the arena, and 3 MB is worth going out of the way
   not to do twice. The entry is the promise, not the result, so a second
   caller that arrives mid-download waits on the first rather than starting
   its own. */
const sceneCache = new Map();

function getScene(url, onProgress = () => {}){
  if (!sceneCache.has(url)){
    sceneCache.set(url, loadModel(url, onProgress).then(([json, bin, bytes]) => {
      const s = buildScene(json, bin);
      s.bytes = bytes;
      return s;
    }));
  }
  return sceneCache.get(url);
}

/* When the model cannot be shown, say why in the space it would have used.
   This is DOM rather than canvas on purpose: a canvas can only ever hand out
   one kind of context, so once WebGL2 has claimed it a 2D fallback is not
   available — and the text is selectable and readable to a screen reader. */
function stageMessage(text){
  const note = $('#stage-note');
  if (!note) return;
  note.textContent = text;
  note.hidden = false;
}

/* ── the model shelf ──────────────────────────────────────────────────── */

/* Every <li class="piece"> in #models gets its own small renderer. It reuses
   the hero's shaders, glTF reader and scene builder, and none of its camera:
   the hero is a cinema, this is a workbench.

   The 2D views are the reason the section exists. Swap the perspective
   frustum for an orthographic box, square the camera to one axis and take the
   materials down to clay, and the same buffer becomes a plan or an elevation.
   Nothing is exported alongside the model and left to go stale — the drawings
   are the model, which is why they cannot disagree with it.

   eye is a unit direction out from the centre of the model. wi and hi say
   which of the three spans fills the frame across and up: a plan is X by Z, a
   front elevation is X by Y, a side elevation is Z by Y. */
const PLANES = {
  plan:  { eye: [0, 1, 0], up: [0, 0, -1], wi: 0, hi: 2, grid: true,
           cap: 'Plan — looking straight down' },
  front: { eye: [0, 0, 1], up: [0, 1, 0],  wi: 0, hi: 1, grid: false,
           cap: 'Front elevation — square on, no perspective' },
  side:  { eye: [1, 0, 0], up: [0, 1, 0],  wi: 2, hi: 1, grid: false,
           cap: 'Side elevation — square on, no perspective' }
};
const CAP_3D = 'Perspective — drag it to turn';

/* Narrower than the hero's lens. The hero is a camera you stand inside; this
   is an object on a table, and a long lens flattens the distortion that makes
   a wide shot feel like a photograph rather than a study. */
const FOV_3D = 0.52;

function initShelf(){
  const pieces = $$('#models .piece');
  if (!pieces.length) return;
  /* A viewport well below the fold should not cost anything until it is
     nearly on screen. 500px of margin means it is usually ready by the time
     it arrives rather than loading in front of you. */
  if (!('IntersectionObserver' in window)){ pieces.forEach(mountPiece); return; }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      mountPiece(e.target);
    });
  }, { rootMargin: '500px 0px' });
  pieces.forEach(el => io.observe(el));
}

async function mountPiece(li){
  const url    = li.dataset.model;
  const canvas = $('.piece__canvas', li);
  const frame  = $('.piece__frame', li);
  const state  = $('.piece__state', li);
  const cap    = $('.piece__cap', li);
  const buttons = $$('.mode', li);
  if (!url || !canvas || !frame) return;

  const fail = msg => {
    li.classList.add('is-broken');
    if (state) state.textContent = msg;
    buttons.forEach(b => { b.disabled = true; });
    if (cap) cap.textContent = '';
  };

  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true });
  if (!gl) return fail('This browser has no WebGL2, so this model cannot be shown here.');

  let scene;
  try { scene = await getScene(url); }
  catch (err){
    return fail(location.protocol === 'file:'
      ? 'The model cannot load straight from the file system. Serve the folder over HTTP and it will appear.'
      : 'This model could not be loaded.');
  }

  let modelProg, lineProg;
  try {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    modelProg = program(MODEL_VS, MODEL_FS);
    lineProg  = program(LINE_VS,  LINE_FS);
  } catch (err){ return fail('The shaders would not compile on this device.'); }

  /* ---- what shape is it, actually --------------------------------------
     buildScene reports a height and a bounding radius, which is all the hero
     needs. A drawing has to fit the real box, so measure it here: three spans
     and a centre, straight off the merged buffer. */
  const V = scene.vertices, ST = 44, FL = ST / 4;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += FL){
    for (let a = 0; a < 3; a++){
      const v = V[i + a];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
  }
  const mid  = [0, 1, 2].map(a => (lo[a] + hi[a]) / 2);
  const span = [0, 1, 2].map(a => Math.max(hi[a] - lo[a], 1e-3));
  const rad  = 0.5 * Math.hypot(span[0], span[1], span[2]);

  /* ---- geometry: the model, a ground grid, two axis lines --------------- */
  const G = 7.2, S = 0.6, SEG = 8, Y = -0.004;
  const gp = [], gf = [];
  const fade = (x, z) => Math.max(0, 1 - Math.pow(Math.hypot(x, z) / G, 1.6));
  for (let i = -Math.round(G / S); i <= Math.round(G / S); i++){
    const t = i * S;
    for (let s = 0; s < SEG; s++){
      const a = -G + (2 * G * s) / SEG, b = -G + (2 * G * (s + 1)) / SEG;
      gp.push(a, Y, t, b, Y, t);  gf.push(fade(a, t), fade(b, t));
      gp.push(t, Y, a, t, Y, b);  gf.push(fade(t, a), fade(t, b));
    }
  }
  const gridPos = new Float32Array(gp), gridFade = new Float32Array(gf);
  const axisPos = new Float32Array([0, Y, 0, G * 0.92, Y, 0,  0, Y, 0, 0, Y, G * 0.92]);
  const axisFade = new Float32Array([1, 0.15, 1, 0.15]);

  const buf = (data, target = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const vtxB = buf(scene.vertices), idxB = buf(scene.indices, gl.ELEMENT_ARRAY_BUFFER);
  const gridB = buf(gridPos), gridFB = buf(gridFade);
  const axisB = buf(axisPos), axisFB = buf(axisFade);

  const vao = setup => { const v = gl.createVertexArray(); gl.bindVertexArray(v); setup(); gl.bindVertexArray(null); return v; };
  const attr = (b, loc, size, stride = 0, offset = 0) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  };
  const vModel = vao(() => {
    attr(vtxB, 0, 3, ST, 0); attr(vtxB, 1, 3, ST, 12);
    attr(vtxB, 2, 4, ST, 24); attr(vtxB, 3, 1, ST, 40);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxB);
  });
  const vGrid = vao(() => { attr(gridB, 0, 3); attr(gridFB, 1, 1); });
  const vAxis = vao(() => { attr(axisB, 0, 3); attr(axisFB, 1, 1); });

  const U = (p, names) => { const o = {}; names.forEach(n => o[n] = gl.getUniformLocation(p, n)); return o; };
  const mu = U(modelProg, ['uVP', 'uBg', 'uEye', 'uBuild', 'uTop', 'uClay', 'uAlpha']);
  const lu = U(lineProg,  ['uVP', 'uColor', 'uBg', 'uAlpha']);

  /* ---- state ------------------------------------------------------------ */
  let mode = '3d';
  let yaw = 0.72, pitch = 0.34;
  let W = 0, H = 0, dist = rad * 3;
  let dirty = true, queued = false, alive = true;

  const kick = () => {
    if (queued || !alive) return;
    queued = true;
    requestAnimationFrame(tick);
  };

  function resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(frame.clientWidth  * dpr));
    const h = Math.max(1, Math.round(frame.clientHeight * dpr));
    if (w === W && h === H) return;
    W = w; H = h; canvas.width = w; canvas.height = h;
    /* Fit the whole bounding sphere whichever way the frame is shaped: on a
       narrow phone the horizontal angle is the tighter of the two, so solving
       only for the vertical one would cut the ends off the building. */
    const vf = FOV_3D / 2, hf = Math.atan(Math.tan(vf) * (W / H));
    dist = Math.max(rad / Math.sin(vf), rad / Math.sin(hf)) * 0.94;
    clampPitch();          // the floor moves with the distance
    dirty = true;
  }

  function camera(){
    if (mode === '3d'){
      const eye = [
        mid[0] + dist * Math.cos(pitch) * Math.sin(yaw),
        mid[1] + dist * Math.sin(pitch),
        mid[2] + dist * Math.cos(pitch) * Math.cos(yaw)
      ];
      const far = dist + rad * 2 + 4;
      return { vp: mul(perspective(FOV_3D, W / H, 0.05, far), lookAt(eye, mid, [0, 1, 0])),
               eye, ortho: false, grid: true };
    }
    const P = PLANES[mode];
    const pad = 1.12;
    let hw = span[P.wi] * 0.5 * pad, hh = span[P.hi] * 0.5 * pad;
    const a = W / H;
    if (hw / hh > a) hh = hw / a; else hw = hh * a;
    const d = rad * 2 + 4;
    const eye = [mid[0] + P.eye[0] * d, mid[1] + P.eye[1] * d, mid[2] + P.eye[2] * d];
    return { vp: mul(ortho(hw, hh, 0.01, d * 2 + 8), lookAt(eye, mid, P.up)),
             eye, ortho: true, grid: P.grid };
  }

  function draw(){
    const cam = camera();
    /* Materials in 3D, near-clay in 2D. Not all the way to clay: a trace of
       the emissive left in makes the neon runs read as brighter lines in the
       drawing, which is information rather than decoration. */
    const clay = cam.ortho ? 0.85 : 0;

    gl.viewport(0, 0, W, H);
    gl.clearColor(BG[0], BG[1], BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    gl.useProgram(modelProg);
    gl.uniformMatrix4fv(mu.uVP, false, cam.vp);
    gl.uniform3fv(mu.uBg, BG);
    gl.uniform3fv(mu.uEye, cam.eye);
    gl.uniform1f(mu.uBuild, 1);
    gl.uniform1f(mu.uTop, scene.top);
    gl.uniform1f(mu.uClay, clay);
    gl.uniform1f(mu.uAlpha, 1);
    gl.bindVertexArray(vModel);
    gl.drawElements(gl.TRIANGLES, scene.opaqueIndices, gl.UNSIGNED_INT, 0);

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lu.uVP, false, cam.vp);
    gl.uniform3fv(lu.uBg, BG);

    /* In an elevation the whole grid collapses onto one line, so hundreds of
       blended segments stack up on the same pixels and the ground reads as a
       hard black band. The two axis lines already give the ground datum and
       the setting-out point, so elevations use those alone. */
    if (cam.grid){
      gl.uniform3fv(lu.uColor, GRID_C);
      gl.uniform1f(lu.uAlpha, cam.ortho ? 0.26 : 0.34);
      gl.bindVertexArray(vGrid);
      gl.drawArrays(gl.LINES, 0, gridPos.length / 3);
    }

    gl.bindVertexArray(vAxis);
    gl.uniform1f(lu.uAlpha, cam.ortho ? 0.50 : 0.62);
    gl.uniform3fv(lu.uColor, AX_X);
    gl.drawArrays(gl.LINES, 0, 2);
    gl.uniform3fv(lu.uColor, AX_Z);
    gl.drawArrays(gl.LINES, 2, 2);

    if (scene.blendIndices){
      gl.useProgram(modelProg);
      gl.bindVertexArray(vModel);
      gl.drawElements(gl.TRIANGLES, scene.blendIndices, gl.UNSIGNED_INT, scene.opaqueIndices * 4);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  function tick(){
    queued = false;
    if (!alive) return;
    resize();
    if (dirty){ dirty = false; draw(); }
  }

  /* ---- switching views -------------------------------------------------- */
  /* Instant, not animated. Pressing a numpad key in a 3D application cuts to
     the view; it does not fly you there, because the point is to compare two
     framings of the same thing without watching the trip in between. */
  function setMode(next){
    if (!PLANES[next] && next !== '3d') return;
    mode = next;
    li.dataset.mode = next === '3d' ? '3d' : '2d';
    buttons.forEach(b => {
      const on = b.dataset.mode === next;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (cap) cap.textContent = next === '3d' ? CAP_3D : PLANES[next].cap;
    dirty = true; kick();
  }
  buttons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  /* ---- orbiting --------------------------------------------------------- */
  /* The top of the arc is fixed. The bottom is worked out from the model,
     because a fixed angle that flatters one building puts the camera
     underground for the next one — and looking up through the ground plane
     at the underside of a stadium is never the shot. The floor is whichever
     is higher: the angle at which the eye would touch the ground, or a
     shallow dip below the centre line. */
  const PITCH_MAX = 1.30;
  const pitchFloor = () =>
    Math.max(-0.12, Math.asin(Math.min(1, Math.max(-1, (0.04 - mid[1]) / dist))));
  const clampPitch = () => { pitch = Math.min(Math.max(pitch, pitchFloor()), PITCH_MAX); };
  let drag = null;
  const turn = (dx, dy) => {
    yaw   -= dx * 0.0068;
    pitch += dy * 0.0052;
    clampPitch();
    dirty = true; kick();
  };

  canvas.addEventListener('pointerdown', e => {
    if (mode !== '3d' || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    li.classList.add('is-turning');
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    turn(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    li.classList.remove('is-turning');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('keydown', e => {
    if (mode !== '3d') return;
    const step = e.shiftKey ? 46 : 16;
    if (e.key === 'ArrowLeft')       turn(-step, 0);
    else if (e.key === 'ArrowRight') turn( step, 0);
    else if (e.key === 'ArrowUp')    turn(0, -step);
    else if (e.key === 'ArrowDown')  turn(0,  step);
    else return;
    e.preventDefault();
  });

  /* ---- the numbers, read off the file ----------------------------------- */
  const fmt = n => n.toLocaleString('en-US');
  const size = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
  const facts = { tris: fmt(scene.indices.length / 3), parts: fmt(scene.objects),
                  bytes: scene.bytes ? size(scene.bytes) : '—' };
  $$('[data-fact]', li).forEach(el => {
    if (facts[el.dataset.fact] != null) el.textContent = facts[el.dataset.fact];
  });

  /* ---- go --------------------------------------------------------------- */
  if ('ResizeObserver' in window){
    new ResizeObserver(() => { dirty = true; kick(); }).observe(frame);
  } else {
    addEventListener('resize', () => { dirty = true; kick(); }, { passive: true });
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); alive = false; });
  canvas.addEventListener('webglcontextrestored', () => { alive = true; dirty = true; kick(); });

  setMode('3d');
  li.classList.add('is-live');
  if (state) state.remove();
  kick();
}

/* ── pipeline wires ───────────────────────────────────────────────────── */

function initGraph(){
  const graph = $('#graph');
  if (!graph) return;
  const svg = $('.graph__wires', graph);
  const nodes = $$('.node', graph);
  if (!svg || nodes.length < 2) return;

  function route(){
    const box = graph.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = '';
    for (let i = 0; i < nodes.length - 1; i++){
      const a = nodes[i].getBoundingClientRect(), b = nodes[i + 1].getBoundingClientRect();
      const x1 = a.right - box.left, y1 = a.top - box.top + a.height * 0.5;
      const x2 = b.left  - box.left, y2 = b.top - box.top + b.height * 0.5;
      const dx = Math.max((x2 - x1) * 0.5, 12);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
      p.dataset.pair = `${i}-${i + 1}`;
      svg.appendChild(p);
    }
  }

  nodes.forEach((n, i) => {
    const on = v => $$('path', svg).forEach(p => {
      const [a, b] = p.dataset.pair.split('-').map(Number);
      if (a === i || b === i) p.classList.toggle('is-live', v);
    });
    n.addEventListener('pointerenter', () => on(true));
    n.addEventListener('pointerleave', () => on(false));
  });

  route();
  if ('ResizeObserver' in window) new ResizeObserver(route).observe(graph);
  else addEventListener('resize', route);
}

/* ── section tracking ─────────────────────────────────────────────────── */

/* The bar floats over the viewport so the model starts at the top of the
   screen. Once the page scrolls past the hero it needs a solid background
   to stay readable over ordinary content. */
function initBarShade(){
  const bar = $('.topbar'), stage = $('.stage');
  if (!bar || !stage || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    ([e]) => bar.classList.toggle('is-stuck', !e.isIntersecting),
    { rootMargin: '-70% 0px 0px 0px' }
  ).observe(stage);
}

function initSpy(){
  const tabs = $$('.tab');
  if (!tabs.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  tabs.forEach(t => {
    const href = t.getAttribute('href') || '';
    if (!href.startsWith('#')) return;   // guard against any off-page link
    const el = document.querySelector(href);
    if (el) map.set(el, t);
  });
  if (!map.size) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const tab = map.get(e.target);
      if (tab && e.isIntersecting){
        tabs.forEach(t => t.classList.remove('is-current'));
        tab.classList.add('is-current');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, el) => io.observe(el));
}

/* ── boot ─────────────────────────────────────────────────────────────── */

function boot(){
  initGraph();
  initSpy();
  initBarShade();
  initViewport();
  initShelf();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
