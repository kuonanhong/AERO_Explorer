// Original AERO tri-mode vehicle. Local forward is -Z; all dimensions are metres.
// No remote assets, imported models, animation mixer, skeleton or per-frame allocations.
export function createTransformVehicle(T) {
  const group = new T.Group();
  group.name = 'AERO transform vehicle';
  group.rotation.order = 'YXZ';
  const geometries = new Set(), materials = new Set(), instances = [];
  const geometry = g => (geometries.add(g), g);
  const material = (color, extra = {}) => {
    const m = new T.MeshStandardMaterial({ color, metalness: .22, roughness: .52, ...extra });
    materials.add(m); return m;
  };
  const white = material(0xe8efed), dark = material(0x18323b, { metalness: .38 });
  const orange = material(0xff8a43), glass = material(0x194d61, { metalness: .6, roughness: .14 });
  const rubber = material(0x172126, { metalness: 0, roughness: .95 });
  const lamp = new T.MeshBasicMaterial({ color: 0xd8f4ff }); materials.add(lamp);
  const rotorMat = new T.MeshBasicMaterial({ color: 0x143841 }); materials.add(rotorMat);
  const sphere = geometry(new T.SphereGeometry(1, 16, 10));
  const box = geometry(new T.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new T.CylinderGeometry(.5, .5, 1, 12));
  const armGeometry = geometry(new T.CylinderGeometry(.047, .06, 1, 8));
  const tireGeometry = geometry(new T.CylinderGeometry(.27, .27, .17, 16));
  const ringGeometry = geometry(new T.TorusGeometry(.23, .055, 7, 18));
  function mesh(g, m, name) { const v = new T.Mesh(g, m); v.name = name; group.add(v); return v; }
  function instanced(g, m, count, name) {
    const v = new T.InstancedMesh(g, m, count); v.name = name;
    v.instanceMatrix.setUsage(T.DynamicDrawUsage); v.frustumCulled = false;
    group.add(v); instances.push(v); return v;
  }
  const hull = mesh(sphere, white, 'Common sealed chassis');
  const canopy = mesh(sphere, glass, 'Common navigation canopy');
  const cameraHousing = mesh(sphere, dark, 'Common camera housing');
  const cameraLens = mesh(sphere, glass, 'Camera lens');
  const roofBand = mesh(box, orange, 'Orange identity band');
  const arms = instanced(armGeometry, dark, 4, 'Folding arms');
  const pods = instanced(cylinder, orange, 4, 'Rotating shared motor pods');
  const lights = instanced(sphere, lamp, 2, 'Forward navigation lamps');
  const rotors = instanced(box, rotorMat, 4, 'Flight propellers');
  const tires = instanced(tireGeometry, rubber, 4, 'Ground tires');
  const hubs = instanced(cylinder, white, 4, 'Wheel hubs');
  const fins = instanced(box, orange, 3, 'Water stabilizer fins');
  const tailRing = mesh(ringGeometry, dark, 'Protected water propeller');
  const tailProp = mesh(box, orange, 'Water propeller');
  const mast = mesh(cylinder, dark, 'Water navigation mast');

  const p = new T.Vector3(), scale = new T.Vector3(), q = new T.Quaternion();
  const link = new T.Vector3(), end = new T.Vector3(), start = new T.Vector3();
  const axisY = new T.Vector3(0, 1, 0), matrix = new T.Matrix4(), euler = new T.Euler();
  const airQ = new T.Quaternion(), landQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
  const waterQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
  let a = 1, l = 0, w = 0, first = true, disposed = false, rotorAngle = 0, wheelAngle = 0, lastTick = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, quaternion = q) => {
    p.set(x, y, z); scale.set(sx, sy, sz); matrix.compose(p, quaternion, scale); mesh.setMatrixAt(i, matrix);
  };
  const blend = (av, lv, wv) => av * a + lv * l + wv * w;
  function update(s, dt = 0) {
    if (disposed) return;
    const mode = s.vehicle === 'water' ? 'water' : s.vehicle === 'land' ? 'land' : 'air';
    const elapsed = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
    const now = globalThis.performance?.now() ?? Date.now();
    // A paused simulator supplies dt=0. Its 5 Hz idle redraws may still animate a
    // vehicle conversion; propellers, wheels and physics continue to remain paused.
    const morphElapsed = elapsed || Math.max(0, Math.min((now - lastTick) / 1000, .25));
    lastTick = now;
    const t = first ? 1 : 1 - Math.exp(-morphElapsed / .115);
    a += ((mode === 'air' ? 1 : 0) - a) * t;
    l += ((mode === 'land' ? 1 : 0) - l) * t;
    w += ((mode === 'water' ? 1 : 0) - w) * t; first = false;
    group.position.set(s.x || 0, s.y || 0, s.z || 0);
    group.rotation.set(-(s.pitch || 0), -(s.yaw || 0), -(s.roll || 0));
    group.userData.vehicle = mode;
    // Existing weights are exposed for diagnostics without constructing a frame object.
    group.userData.air = a; group.userData.land = l; group.userData.water = w;
    hull.scale.set(blend(.55, .59, .45), blend(.24, .25, .38), blend(.72, .94, 1.18));
    canopy.position.set(0, blend(.12, .21, .16), blend(-.28, -.23, -.56));
    canopy.scale.set(blend(.36, .43, .30), blend(.18, .29, .22), blend(.39, .48, .44));
    cameraHousing.position.set(0, -.08, -blend(.68, .90, 1.13));
    cameraHousing.scale.set(.17, .16, .15);
    cameraLens.position.copy(cameraHousing.position); cameraLens.position.z -= .115;
    cameraLens.scale.set(.113, .107, .042);
    roofBand.position.set(0, blend(.239, .25, .38), blend(.18, .32, .18));
    roofBand.scale.set(blend(.74, .81, .60), .024, .105);
    rotorAngle += elapsed * (s.landed ? 14 : 76);
    wheelAngle += elapsed * ((s.vx || 0) * Math.sin(s.yaw || 0) - (s.vz || 0) * Math.cos(s.yaw || 0)) / .27;
    const revealA = Math.max(.001, a), revealL = Math.max(.001, l), revealW = Math.max(.001, w);
    rotors.visible = a > .012; tires.visible = hubs.visible = l > .012;
    fins.visible = tailRing.visible = tailProp.visible = mast.visible = w > .012;
    for (let i = 0; i < 4; i++) {
      const side = i & 1 ? 1 : -1, front = i < 2 ? -1 : 1;
      end.set(side * blend(.93, .67, .60), blend(.06, -.29, -.08), front * blend(.76, .61, .58));
      start.set(side * .25, 0, front * .28);
      link.copy(end).sub(start); const length = link.length();
      q.setFromUnitVectors(axisY, link.normalize());
      put(arms, i, (end.x + start.x) / 2, (end.y + start.y) / 2, (end.z + start.z) / 2, 1, length, 1);
      // One motor assembly rotates from lift axis to axle axis to water thruster axis.
      q.copy(airQ).slerp(landQ, l / Math.max(.00001, a + l)); q.slerp(waterQ, w);
      put(pods, i, end.x, end.y, end.z, .28, .20, .28);
      q.setFromAxisAngle(axisY, rotorAngle * (i % 2 ? 1 : -1));
      put(rotors, i, end.x, end.y + .13, end.z, .90 * revealA, .025, .085 * revealA);
      q.setFromEuler(euler.set(wheelAngle, 0, Math.PI / 2));
      put(tires, i, end.x, end.y, end.z, revealL, revealL, revealL);
      put(hubs, i, end.x + side * .094 * l, end.y, end.z, .27 * revealL, .025 * revealL, .27 * revealL);
    }
    q.identity();
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      put(lights, i, side * blend(.35, .38, .27), blend(.025, .02, .04), -blend(.61, .82, .94), .071, .045, .035);
      put(fins, i, side * .52, -.065, .68, .56 * revealW, .045 * revealW, .43 * revealW);
    }
    put(fins, 2, 0, .30, .82, .048 * revealW, .57 * revealW, .43 * revealW);
    tailRing.position.set(0, 0, 1.25); tailRing.scale.setScalar(revealW);
    tailProp.position.copy(tailRing.position); tailProp.rotation.z = rotorAngle * .7;
    tailProp.scale.set(.37 * revealW, .065 * revealW, .045 * revealW);
    mast.position.set(0, .47, .1); mast.scale.set(.09 * revealW, .31 * revealW, .09 * revealW);
    for (const mesh of instances) mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    group, update,
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent();
      for (const i of instances) i.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.clear();
    }
  };
}
