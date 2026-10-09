// Subtle barrel distortion for the simulator's rendered 3D FPV only.
// strength=.05 is the shader's radial coefficient, not a clinical eye/FOV measurement.
// One extra full-screen triangle and one reusable render target; no Composer dependency.
export function createFisheyePass(T, renderer) {
  const target = new T.WebGLRenderTarget(1, 1, {
    minFilter: T.LinearFilter, magFilter: T.LinearFilter,
    format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false,
    generateMipmaps: false
  });
  // The off-screen scene remains linear; the output pass performs sRGB conversion once.
  target.texture.colorSpace = T.LinearSRGBColorSpace;
  target.texture.name = 'AERO FPV fisheye target';
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const material = new T.ShaderMaterial({
    uniforms: { image: { value: target.texture }, strength: { value: .05 }, aspect: { value: 1 } },
    depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D image;
      uniform float strength;
      uniform float aspect;
      varying vec2 vUv;
      void main() {
        vec2 p = 2.0 * vUv - 1.0;
        // Screen-proportionate radial distance, normalized so the corners are r=1.
        vec2 radial = p * vec2(aspect, 1.0);
        float r2 = dot(radial, radial) / (aspect * aspect + 1.0);
        // This inverse sampling bends straight lines outwards at the periphery.
        // Dividing by 1+k fits the entire output inside the source: no black borders.
        vec2 uv = .5 + .5 * p * (1.0 + strength * r2) / (1.0 + strength);
        gl_FragColor = texture2D(image, uv);
        #include <colorspace_fragment>
      }
    `
  });
  const scene = new T.Scene(), camera = new T.Camera();
  const triangle = new T.Mesh(geometry, material); triangle.frustumCulled = false; scene.add(triangle);
  const size = new T.Vector2(); let disposed = false, width = 1, height = 1;
  function resize(w, h) {
    if (disposed) return;
    width = Math.max(1, Math.round(w)); height = Math.max(1, Math.round(h));
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    material.uniforms.aspect.value = width / height;
  }
  return {
    resize,
    render(world, worldCamera, strength = .05) {
      if (disposed) return;
      const amount = Math.max(0, Math.min(.12, Number.isFinite(strength) ? strength : .05));
      if (amount === 0) { renderer.render(world, worldCamera); return; }
      // Drawing-buffer size, rather than CSS size, preserves the selected hardware DPR.
      renderer.getDrawingBufferSize(size);
      if (width !== size.x || height !== size.y) resize(size.x, size.y);
      material.uniforms.strength.value = amount;
      const previous = renderer.getRenderTarget();
      const wasAutoClear = renderer.autoClear;
      const wasXR = renderer.xr.enabled;
      const wasInfoAutoReset = renderer.info.autoReset;
      try {
        renderer.xr.enabled = false;
        renderer.autoClear = true;
        // The HUD should count both scene and postprocess, not just the final triangle.
        renderer.info.autoReset = false; renderer.info.reset();
        renderer.setRenderTarget(target); renderer.render(world, worldCamera);
        renderer.setRenderTarget(previous); renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previous);
        renderer.autoClear = wasAutoClear; renderer.xr.enabled = wasXR;
        renderer.info.autoReset = wasInfoAutoReset;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      target.dispose(); material.dispose(); geometry.dispose(); scene.clear();
    }
  };
}
