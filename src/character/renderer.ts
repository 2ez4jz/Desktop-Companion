import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { hull, contains, type Pixel } from "../interactions/silhouette";
import { Animator } from "../animation/controller";
import type { Companion } from "../behaviors/companion";
export class CharacterRenderer {
  readonly renderer: T.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new T.Scene();
  readonly camera: T.OrthographicCamera;
  readonly mount = new T.Group();
  private model: T.Group | undefined;
  private animator: Animator | undefined;
  private width = 520;
  private height = 520;
  private outlines: { head: boolean; points: Pixel[] }[] = [];
  private outlineAt = -Infinity;
  private maskCanvas = document.createElement("canvas");
  private head: T.Object3D | undefined;
  private eyes: T.Object3D[] = [];

  rotation = 0;
  private observer: ResizeObserver;
  private look = new T.Euler();
  private savedHead = new T.Quaternion();
  private savedEyes: T.Vector3[] = [];
  private posed = false;
  private shadow: T.Mesh;
  constructor(
    private container: HTMLElement,
    private desktop: boolean,
  ) {
    this.renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("aria-label", "SCULPY 3D 互动区域");
    container.append(this.canvas);
    this.camera = new T.OrthographicCamera(-260, 260, 260, -260, 0.1, 4000);
    this.camera.position.set(0, 0, 1000);
    this.scene.add(new T.HemisphereLight(0xfff9ef, 0xc0b29e, 1.7));
    const key = new T.DirectionalLight(0xfff3e1, 2.8);
    key.position.set(-2, 4, 5);
    this.scene.add(key);
    const rim = new T.DirectionalLight(0xffffff, 1.5);
    rim.position.set(3, 3, -4);
    this.scene.add(rim);
    const fill = new T.DirectionalLight(0xf0f5ff, 1);
    fill.position.set(3, 1, 3);
    this.scene.add(fill);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 32;
    const context = shadowCanvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 16, 0, 64, 16, 64);
    gradient.addColorStop(0, "rgba(85,61,32,.22)");
    gradient.addColorStop(1, "rgba(85,61,32,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 32);
    this.shadow = new T.Mesh(
      new T.PlaneGeometry(1.5, 0.18),
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(shadowCanvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    this.shadow.position.set(0, -0.015, -0.5);
    this.mount.add(this.shadow);
    this.scene.add(this.mount);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }
  private resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.updateProjectionMatrix();
  }
  async load() {
    const gltf = await new GLTFLoader().loadAsync("/models/sculpy.glb");
    this.model = gltf.scene;
    this.mount.add(gltf.scene);
    this.animator = new Animator(gltf.scene, gltf.animations);
    this.head = gltf.scene.getObjectByName("Head");
    this.eyes = ["EyeL", "EyeR"]
      .map((n) => gltf.scene.getObjectByName(n)!)
      .filter(Boolean);
    this.animator.play("Idle");
  }
  private updateOutlines() {
    if (!this.model) return;
    const now = performance.now();
    if (now - this.outlineAt < 80) return;
    this.outlineAt = now;
    this.outlines = [];
    const v = new T.Vector3();
    this.model.traverse((o) => {
      if (!(o instanceof T.Mesh) || o.name.startsWith("Blush")) return;
      const attr = o.geometry.attributes.position,
        points: Pixel[] = [];
      const step = Math.max(1, Math.ceil(attr.count / 256));
      for (let i = 0; i < attr.count; i += step) {
        v.fromBufferAttribute(attr, i);
        if (o instanceof T.SkinnedMesh) o.applyBoneTransform(i, v);
        v.applyMatrix4(o.matrixWorld).project(this.camera);
        points.push({
          x: ((v.x + 1) * this.width) / 2,
          y: ((1 - v.y) * this.height) / 2,
        });
      }
      this.outlines.push({
        head: o.name === "Cream_sculpted_head",
        points: hull(points),
      });
    });
  }
  hit(x: number, y: number) {
    if (x < 0 || y < 0 || x > this.width || y > this.height)
      return { hit: false, head: false };
    this.updateOutlines();
    const hits = this.outlines.filter((o) => contains(o.points, { x, y }));
    return { hit: hits.length > 0, head: hits.some((h) => h.head) };
  }
  render(c: Companion, dt: number) {
    if (!this.model || !this.animator) return;
    if (!c.settings.paused || !this.posed) {
      if (this.posed && this.head) {
        this.head.quaternion.copy(this.savedHead);
        this.eyes.forEach((eye, i) => eye.scale.copy(this.savedEyes[i]));
      }
      this.animator.play(c.motion);
      this.animator.update(c.settings.paused ? 0 : dt, c.motion === "Sleep");
      if (this.head) this.savedHead.copy(this.head.quaternion);
      this.savedEyes = this.eyes.map((eye) => eye.scale.clone());
    }
    this.mount.scale.setScalar(c.settings.size / 3.33);
    const x = this.desktop ? this.width / 2 : c.body.x,
      y = this.desktop ? this.height - 50 : c.body.y;
    this.mount.position.set(x - this.width / 2, this.height / 2 - y, 0);
    this.mount.rotation.set(0, this.rotation, c.tilt);
    if (this.head && !c.settings.paused) {
      const dx = (c.pointer.x - c.body.x) / c.size,
        dy = (c.pointer.y - (c.body.y - c.size * 0.65)) / c.size;
      if (!["Sleep", "Fall", "GetUp"].includes(c.motion)) {
        this.look.set(
          T.MathUtils.clamp(dy * 0.12, -0.16, 0.16),
          T.MathUtils.clamp(dx * 0.17, -0.26, 0.26),
          c.petting ? Math.sin(c.clock * 5) * 0.035 : 0,
        );
        this.head.quaternion.multiply(
          new T.Quaternion().setFromEuler(this.look),
        );
      }
      if (c.petting)
        for (const eye of this.eyes) eye.scale.y = Math.min(eye.scale.y, 0.32);
    }
    this.posed = true;
    this.shadow.scale.x = c.body.grounded ? 1 : 0.65;
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
  }
  mask(): number[] {
    // CPU projection avoids synchronous GPU readback, a driver stall on some WebView2 systems.
    this.updateOutlines();
    const canvas = this.maskCanvas;
    if (canvas.width !== 128) {
      canvas.width = 128;
      canvas.height = 128;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "#fff";
    for (const o of this.outlines) {
      ctx.beginPath();
      o.points.forEach((p, i) => {
        if (i === 0)
          ctx.moveTo((p.x / this.width) * 128, (p.y / this.height) * 128);
        else ctx.lineTo((p.x / this.width) * 128, (p.y / this.height) * 128);
      });
      ctx.closePath();
      ctx.fill();
    }
    const data = ctx.getImageData(0, 0, 128, 128).data;
    return Array.from({ length: 16384 }, (_, i) =>
      data[i * 4 + 3] > 96 ? 1 : 0,
    );
  }
  dispose() {
    this.observer.disconnect();
    this.animator?.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if ("map" in m) (m.map as T.Texture | null)?.dispose();
          m.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}
