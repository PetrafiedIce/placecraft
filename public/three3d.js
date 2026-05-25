// Three.js preview of the canvas as a wall of textured Minecraft cubes.
// Loaded lazily via dynamic import on first 3D toggle.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const VERTEX = /* glsl */ `
  attribute vec2 instanceAtlasOffset;
  varying vec2 vUv;
  varying vec2 vAtlasOffset;
  varying vec3 vNormalObj;
  void main() {
    vUv = uv;
    vAtlasOffset = instanceAtlasOffset;
    // Cube faces use object-space normals directly (no per-instance rotation).
    vNormalObj = normal;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform sampler2D atlas;
  uniform vec2 tileScale;
  varying vec2 vUv;
  varying vec2 vAtlasOffset;
  varying vec3 vNormalObj;
  void main() {
    // Cube faces have vUv.y=0 at the bottom edge, but our atlasY counts down from
    // the top of the image — flip V so the texture appears upright on each face.
    vec2 atlasUv = vAtlasOffset + vec2(vUv.x, 1.0 - vUv.y) * tileScale;
    vec4 col = texture2D(atlas, atlasUv);
    if (col.a < 0.05) discard;
    // Subtle per-face shading. Brighter overall than vanilla MC so the wall reads
    // well from any orbit angle (the camera spends most of its time looking at
    // north/south or east/west faces, not the top).
    float shade;
    if      (vNormalObj.y >  0.7) shade = 1.00;  // top
    else if (vNormalObj.y < -0.7) shade = 0.78;  // bottom
    else if (abs(vNormalObj.x) > 0.7) shade = 0.92;  // east/west
    else                          shade = 0.98;       // north/south
    gl_FragColor = vec4(col.rgb * shade, col.a);
  }
`;

export class Renderer3D {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.W = opts.width;
    this.H = opts.height;
    this.tile = opts.tileSize;
    this.atlasW = opts.atlasWidth;
    this.atlasH = opts.atlasHeight;
    this.blocks = opts.blocks;
    this.pixels = null;
    this.disposed = false;
    this.running = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa8c8e8);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
    this.camera.position.set(0, 0, Math.max(this.W, this.H) * 1.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    // Disable Three.js's automatic linear↔sRGB conversion — our custom shader
    // samples the atlas directly without the built-in sRGB decode, so leaving the
    // pipeline in sRGB space would double-gamma-correct and crush the colors.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 800;

    // Atlas texture
    const loader = new THREE.TextureLoader();
    this.atlasTexture = loader.load(opts.atlasUrl, () => this.requestRender());
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.generateMipmaps = false;
    // Match outputColorSpace: leave the texture in its raw (sRGB-on-disk) form
    // and pass through unchanged. The browser displays sRGB pixels correctly
    // without us re-encoding.
    this.atlasTexture.colorSpace = THREE.LinearSRGBColorSpace;
    // Keep the image right-side-up so our atlasY values (top-down pixel rows) map
    // directly to V coords. Without this, Three.js flips the atlas at upload and
    // every block samples from the opposite end of the texture.
    this.atlasTexture.flipY = false;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        atlas: { value: this.atlasTexture },
        tileScale: { value: new THREE.Vector2(this.tile / this.atlasW, this.tile / this.atlasH) },
      },
      transparent: true,
    });

    // Pre-allocate one cube per canvas pixel. Air pixels get scaled to 0 to hide.
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const max = this.W * this.H;
    this.mesh = new THREE.InstancedMesh(geom, this.material, max);
    this.mesh.frustumCulled = false;
    // Per-instance atlas UV offsets (normalized to [0,1]).
    const offsets = new Float32Array(max * 2);
    this.offsetAttr = new THREE.InstancedBufferAttribute(offsets, 2);
    this.offsetAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute("instanceAtlasOffset", this.offsetAttr);
    this.scene.add(this.mesh);

    // Set base matrices once (positions). Visibility toggles via per-instance scale.
    const m = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let py = 0; py < this.H; py++) {
      for (let px = 0; px < this.W; px++) {
        const i = py * this.W + px;
        // Place cube at (px - W/2 + 0.5, (H-1-py) - H/2 + 0.5, 0)
        const wx = px - this.W / 2 + 0.5;
        const wy = (this.H - 1 - py) - this.H / 2 + 0.5;
        m.makeTranslation(wx, wy, 0);
        this.mesh.setMatrixAt(i, hidden); // start hidden; setPixels() will reveal placed blocks
      }
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.needsUpdate = true;

    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
    // The host element may resize when the picker closes, the panel switches modes,
    // or the browser viewport changes — a ResizeObserver is more reliable than
    // window resize alone.
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(host);
    this._onResize();

    this._loop = this._loop.bind(this);
  }

  setPixels(pixels) {
    this.pixels = pixels;
    if (!this.atlasTexture) return;
    const m = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    const offs = this.offsetAttr.array;
    for (let py = 0; py < this.H; py++) {
      for (let px = 0; px < this.W; px++) {
        const i = py * this.W + px;
        const idx = pixels[i];
        if (idx === 0) {
          this.mesh.setMatrixAt(i, hidden);
          offs[i * 2] = 0; offs[i * 2 + 1] = 0;
          continue;
        }
        const block = this.blocks[idx];
        const wx = px - this.W / 2 + 0.5;
        const wy = (this.H - 1 - py) - this.H / 2 + 0.5;
        m.makeTranslation(wx, wy, 0);
        this.mesh.setMatrixAt(i, m);
        offs[i * 2]     = block.atlasX / this.atlasW;
        offs[i * 2 + 1] = block.atlasY / this.atlasH;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.offsetAttr.needsUpdate = true;
    this.requestRender();
  }

  setBlock(px, py, idx) {
    if (!this.pixels) return;
    this.pixels[py * this.W + px] = idx;
    const i = py * this.W + px;
    const m = new THREE.Matrix4();
    if (idx === 0) {
      m.makeScale(0.0001, 0.0001, 0.0001);
      this.mesh.setMatrixAt(i, m);
    } else {
      const block = this.blocks[idx];
      const wx = px - this.W / 2 + 0.5;
      const wy = (this.H - 1 - py) - this.H / 2 + 0.5;
      m.makeTranslation(wx, wy, 0);
      this.mesh.setMatrixAt(i, m);
      const o = i * 2;
      this.offsetAttr.array[o]     = block.atlasX / this.atlasW;
      this.offsetAttr.array[o + 1] = block.atlasY / this.atlasH;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.offsetAttr.needsUpdate = true;
    this.requestRender();
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this._onResize();
    requestAnimationFrame(this._loop);
  }

  pause() {
    this.running = false;
  }

  requestRender() {
    if (!this.running) {
      // One-off render even when paused, so newly applied edits paint correctly the
      // next time the scene is shown.
      this.renderer.render(this.scene, this.camera);
    }
  }

  _onResize() {
    const w = this.host.clientWidth  || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.running || this.disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    window.removeEventListener("resize", this._onResize);
    if (this._ro) this._ro.disconnect();
    this.renderer.dispose();
    this.atlasTexture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
