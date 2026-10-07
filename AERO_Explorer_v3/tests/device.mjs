import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, chooseTier, probeDevice, AdaptiveQuality } from '../dist/device.js';

const capable = { webgl: true, memoryGB: 8, cores: 8, mobile: false, probeMs: 1 };
test('capable desktop chooses full with bounded profile', () => {
  assert.deepEqual(chooseTier(capable), { tier: 'full', reasonCode: 'full-resources' });
  assert.equal(PROFILES.full.maxDPR, 1.5);
  assert.equal(PROFILES.balanced.maxDPR, 1);
  assert.equal(PROFILES.lite.renderer, '2d');
});
test('unknown Safari RAM stays conservative, even with a fast GPU proxy', () => {
  assert.deepEqual(chooseTier({ ...capable, memoryGB: null }), { tier: 'balanced', reasonCode: 'unknown-memory' });
});
test('memory, cores, WebGL and slow proxy independently trigger lite', () => {
  assert.equal(chooseTier({ ...capable, memoryGB: 2 }).tier, 'lite');
  assert.equal(chooseTier({ ...capable, cores: 2 }).tier, 'lite');
  assert.equal(chooseTier({ ...capable, webgl: false }).reasonCode, 'webgl-unavailable');
  assert.equal(chooseTier({ ...capable, probeMs: 80 }).reasonCode, 'slow-probe');
});
test('coarse pointer and uncertain cores do not claim full capacity', () => {
  assert.equal(chooseTier({ ...capable, mobile: true }).tier, 'balanced');
  assert.equal(chooseTier({ ...capable, cores: null }).tier, 'balanced');
  assert.equal(chooseTier({ ...capable, probeMs: null }).tier, 'balanced');
});
test('empty and malformed diagnostics are safe, not invented capacity', () => {
  assert.equal(chooseTier().tier, 'lite');
  assert.equal(chooseTier({ ...capable, memoryGB: NaN, cores: -4, probeMs: Infinity }).tier, 'balanced');
});
test('probe without DOM returns unknown hardware safely; concurrent calls do not share state', async () => {
  const [a, b] = await Promise.all([probeDevice(), probeDevice()]);
  assert.equal(a.webgl, false);
  assert.equal(a.tier, 'lite');
  assert.equal(a.memoryGB, null);
  assert.equal(a.verified, false);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});
test('short frame dips cannot cause a downgrade', () => {
  const quality = new AdaptiveQuality('full');
  assert.equal(quality.observe({ fps: 20, visible: true, running: true, now: 0 }), null);
  assert.equal(quality.observe({ fps: 20, visible: true, running: true, now: 1000 }), null);
  assert.equal(quality.observe({ fps: 60, visible: true, running: true, now: 2000 }), null);
  assert.equal(quality.tier, 'full');
});
test('persistent slow active play downgrades; cooldown avoids oscillation', () => {
  const quality = new AdaptiveQuality('full');
  for (let now = 0; now <= 4000; now += 1000) assert.equal(quality.observe({ fps: 20, visible: true, running: true, now }), null);
  assert.equal(quality.observe({ fps: 20, visible: true, running: true, now: 5000 }), 'balanced');
  for (let now = 6000; now <= 14000; now += 1000) assert.equal(quality.observe({ fps: 20, visible: true, running: true, now }), null);
  for (let now = 15000; now <= 18000; now += 1000) assert.equal(quality.observe({ fps: 20, visible: true, running: true, now }), null);
  assert.equal(quality.observe({ fps: 20, visible: true, running: true, now: 19000 }), 'lite');
  assert.equal(quality.observe({ fps: 90, visible: true, running: true, now: 20000 }), null);
  assert.equal(quality.tier, 'lite');
});
test('pause, hidden page, invalid values and observation gaps reset evidence', () => {
  for (const disruption of [
    { fps: 20, visible: false, running: true, now: 3000 },
    { fps: 20, visible: true, running: false, now: 3000 },
    { fps: NaN, visible: true, running: true, now: 3000 },
    { fps: 20, visible: true, running: true, now: 10000 },
  ]) {
    const quality = new AdaptiveQuality('full');
    quality.observe({ fps: 20, visible: true, running: true, now: 0 });
    quality.observe({ fps: 20, visible: true, running: true, now: 2000 });
    assert.equal(quality.observe(disruption), null);
    assert.equal(quality.observe({ fps: 20, visible: true, running: true, now: disruption.now + 1000 }), null);
    assert.equal(quality.tier, 'full');
  }
});
