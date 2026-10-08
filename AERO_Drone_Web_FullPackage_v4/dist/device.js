/**
 * Lightweight device preflight. No engine, textures, model files, network calls,
 * large allocations, or claims about currently free RAM / VRAM.
 */
export const PROFILES = Object.freeze({
  lite: Object.freeze({
    tier: 'lite', renderer: '2d', targetFPS: 30, maxDPR: 1,
    treeLimit: 24, effects: false, shadows: false, antialias: false,
  }),
  balanced: Object.freeze({
    tier: 'balanced', renderer: 'webgl', targetFPS: 45, maxDPR: 1,
    treeLimit: 72, effects: false, shadows: false, antialias: false,
  }),
  full: Object.freeze({
    tier: 'full', renderer: 'webgl', targetFPS: 60, maxDPR: 1.5,
    treeLimit: 170, effects: true, shadows: true, antialias: true,
  }),
});

const TIERS = ['lite', 'balanced', 'full'];
const finitePositive = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Pure classification; missing or invalid signals stay unknown. */
export function chooseTier(signals = {}) {
  const memoryGB = finitePositive(signals.memoryGB);
  const cores = finitePositive(signals.cores);
  const probeMs = finitePositive(signals.probeMs);
  const mobile = signals.mobile === true;
  if (signals.webgl !== true) return { tier: 'lite', reasonCode: 'webgl-unavailable' };
  if (memoryGB !== null && memoryGB <= 2) return { tier: 'lite', reasonCode: 'low-memory' };
  if (cores !== null && cores <= 2) return { tier: 'lite', reasonCode: 'low-cores' };
  if (probeMs !== null && probeMs >= 70) return { tier: 'lite', reasonCode: 'slow-probe' };
  // Safari does not expose deviceMemory. A capable GPU does not establish RAM capacity.
  if (memoryGB === null) return { tier: 'balanced', reasonCode: 'unknown-memory' };
  if (mobile) return { tier: 'balanced', reasonCode: 'mobile-budget' };
  if (memoryGB >= 8 && cores !== null && cores >= 4 && probeMs !== null && probeMs < 30) {
    return { tier: 'full', reasonCode: 'full-resources' };
  }
  return { tier: 'balanced', reasonCode: 'balanced-resources' };
}

function clock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** One tiny offscreen rendering probe; capped work and a soft elapsed budget. */
function probeWebGL() {
  let canvas, gl, buffer, vertex, fragment, program;
  const started = clock();
  try {
    if (globalThis.document?.createElement) canvas = document.createElement('canvas');
    else if (typeof globalThis.OffscreenCanvas === 'function') canvas = new OffscreenCanvas(64, 64);
    else return { webgl: false, probeMs: null };
    canvas.width = 64;
    canvas.height = 64;
    const contextOptions = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
    // WebGL 1 is intentional: it matches the minimum engine capability.
    gl = canvas.getContext('webgl', contextOptions) || canvas.getContext('experimental-webgl', contextOptions);
    if (!gl || gl.isContextLost()) return { webgl: false, probeMs: null };
    vertex = gl.createShader(gl.VERTEX_SHADER);
    fragment = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vertex, 'attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}');
    gl.shaderSource(fragment, 'precision mediump float; void main(){gl_FragColor=vec4(0.2,0.5,0.7,1.0);}');
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
      return { webgl: false, probeMs: null };
    }
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return { webgl: false, probeMs: null };
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const attribute = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 64, 64);
    // Exclude shader preparation and one warm-up draw from the timing proxy.
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const samples = [];
    for (let round = 0; round < 3; round += 1) {
      const roundStart = clock();
      for (let draw = 0; draw < 32; draw += 1) gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      samples.push(Math.max(0.01, clock() - roundStart));
      if (clock() - started > 120) break;
    }
    if (gl.isContextLost()) return { webgl: false, probeMs: null };
    samples.sort((a, b) => a - b);
    return { webgl: true, probeMs: Math.round(samples[Math.floor(samples.length / 2)] * 100) / 100 };
  } catch {
    return { webgl: false, probeMs: null };
  } finally {
    // The game creates its own context only after this transient context is released.
    if (gl) {
      try {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { /* A lost context needs no further GPU resource cleanup. */ }
    }
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

/** Run before importing the 3D engine. Capability hints are not a capacity guarantee. */
export async function probeDevice() {
  // Let the preflight UI render; never wait indefinitely for a background-tab RAF.
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  const nav = globalThis.navigator;
  const memoryGB = finitePositive(nav?.deviceMemory);
  const cores = finitePositive(nav?.hardwareConcurrency);
  let mobile = false;
  try { mobile = globalThis.matchMedia?.('(pointer: coarse)').matches === true; } catch { /* Unknown pointer. */ }
  const { webgl, probeMs } = probeWebGL();
  const { tier, reasonCode } = chooseTier({ memoryGB, cores, mobile, webgl, probeMs });
  return Object.freeze({
    tier, renderer: PROFILES[tier].renderer, memoryGB, cores, mobile, webgl,
    probeMs, reasonCode, verified: false,
  });
}

/** Persistently slow active play lowers quality once; it never automatically upgrades. */
export class AdaptiveQuality {
  constructor(tier = 'balanced', options = {}) {
    this.tier = TIERS.includes(tier) ? tier : 'balanced';
    this.holdMs = Math.max(1000, finitePositive(options.holdMs) ?? 4500);
    this.cooldownMs = Math.max(this.holdMs, finitePositive(options.cooldownMs) ?? 9000);
    this.lowSince = null;
    this.lastObserved = null;
    this.lastChange = -Infinity;
  }

  setTier(tier) {
    if (!TIERS.includes(tier)) return;
    this.tier = tier;
    this.lowSince = null;
    this.lastObserved = null;
    this.lastChange = clock();
  }

  observe({ fps, visible, running, now = clock() } = {}) {
    if (visible !== true || running !== true || finitePositive(fps) === null || !Number.isFinite(now)) {
      this.lowSince = null;
      this.lastObserved = null;
      return null;
    }
    if (this.lastObserved !== null && (now < this.lastObserved || now - this.lastObserved > 2500)) this.lowSince = null;
    this.lastObserved = now;
    const threshold = this.tier === 'full' ? 42 : this.tier === 'balanced' ? 28 : 0;
    if (fps >= threshold || this.tier === 'lite') {
      this.lowSince = null;
      return null;
    }
    if (now - this.lastChange < this.cooldownMs) {
      this.lowSince = null;
      return null;
    }
    if (this.lowSince === null) this.lowSince = now;
    if (now - this.lowSince < this.holdMs) return null;
    this.tier = this.tier === 'full' ? 'balanced' : 'lite';
    this.lastChange = now;
    this.lowSince = null;
    return this.tier;
  }
}
