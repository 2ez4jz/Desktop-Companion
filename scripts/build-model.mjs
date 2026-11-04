// Reproducible SCULPY sculpt, skin and motion library. No network or Blender required.
import * as T from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const scene = new T.Scene();
const cream = new T.MeshPhysicalMaterial({
  color: 0xffedd5,
  roughness: 0.72,
  metalness: 0,
  clearcoat: 0.12,
  clearcoatRoughness: 0.7,
});
const ink = new T.MeshPhysicalMaterial({
  color: 0x160e09,
  roughness: 0.14,
  clearcoat: 1,
});
const root = new T.Bone();
root.name = "Root";
const bone = (name, parent, p) => {
  const b = new T.Bone();
  b.name = name;
  b.position.set(...p);
  parent.add(b);
  return b;
};
const body = bone("Body", root, [0, 0.95, 0]);
const head = bone("Head", body, [0, 0.5, 0]);
const armL = bone("ArmL", body, [-0.47, 0.3, 0]);
const armR = bone("ArmR", body, [0.47, 0.3, 0]);
const legL = bone("LegL", body, [-0.23, -0.52, 0]);
const legR = bone("LegR", body, [0.23, -0.52, 0]);
scene.add(root);
scene.updateMatrixWorld(true);
const bones = [root, body, head, armL, armR, legL, legR];
const skeleton = new T.Skeleton(bones);
skeleton.calculateInverses();
let triangles = 0;
function skin(name, geometry, weights) {
  const ids = [],
    ws = [];
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const w = weights(pos.getX(i), pos.getY(i), pos.getZ(i));
    ids.push(...w[0]);
    ws.push(...w[1]);
  }
  geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(ids, 4));
  geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(ws, 4));
  const mesh = new T.SkinnedMesh(geometry, cream);
  mesh.name = name;
  mesh.bind(skeleton, new T.Matrix4());
  mesh.frustumCulled = false;
  scene.add(mesh);
  triangles += (geometry.index?.count ?? pos.count) / 3;
  return mesh;
}
const fixed = (i) => () => [
  [i, 0, 0, 0],
  [1, 0, 0, 0],
];

// Broad, nearly flat chin and an asymmetric swept crest, measured against the turnaround.
const profile = [
  [0, 0.56],
  [0.06, 0.88],
  [0.18, 1.14],
  [0.34, 1.24],
  [0.49, 1.18],
  [0.64, 0.99],
  [0.78, 0.7],
  [0.9, 0.3],
  [1, 0],
];
function widthAt(t) {
  let i = 0;
  while (i < profile.length - 2 && t > profile[i + 1][0]) i++;
  const a = profile[i],
    b = profile[i + 1],
    prev = profile[Math.max(0, i - 1)],
    next = profile[Math.min(profile.length - 1, i + 2)],
    span = b[0] - a[0],
    u = (t - a[0]) / span;
  const m0 = (b[1] - prev[1]) / (b[0] - prev[0]),
    m1 = (next[1] - a[1]) / (next[0] - a[0]);
  return Math.max(
    0,
    (2 * u ** 3 - 3 * u * u + 1) * a[1] +
      (u ** 3 - 2 * u * u + u) * span * m0 +
      (-2 * u ** 3 + 3 * u * u) * b[1] +
      (u ** 3 - u * u) * span * m1,
  );
}
function section(t) {
  return { w: widthAt(t), d: widthAt(t) * 0.73, cx: 0.43 * t * t * t };
}
function sculpt(t, a) {
  const { w, d, cx } = section(t);
  const crease = 0.28 + 0.92 * t;
  const strength =
    0.14 * Math.sin(Math.PI * t) * T.MathUtils.smoothstep(t, 0.3, 0.55);
  const groove = strength * Math.exp(-Math.pow((a - crease) / 0.09, 2));
  return [
    cx + (w - groove * 0.4) * Math.cos(a),
    1.44 + 2.12 * t,
    (d - groove) * Math.sin(a),
  ];
}
const vertices = [],
  indices = [],
  rings = 72,
  segments = 112;
for (let j = 0; j <= rings; j++)
  for (let k = 0; k <= segments; k++) {
    const t = j / rings,
      a = (k / segments) * Math.PI * 2;
    vertices.push(...(j === 0 ? [0, 1.44, 0] : sculpt(t, a)));
    if (j < rings && k < segments) {
      const p = j * (segments + 1) + k;
      indices.push(
        p,
        p + segments + 1,
        p + 1,
        p + 1,
        p + segments + 1,
        p + segments + 2,
      );
    }
  }
let geo = new T.BufferGeometry();
geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
geo.setIndex(indices);
geo = mergeVertices(geo);
geo.computeVertexNormals();
skin("Cream_sculpted_head", geo, fixed(2));

// Smooth implicit union removes the visible torso/foot seams of intersecting primitives.
const ell = (p, c, r) => {
  const q = p.map((v, i) => (v - c[i]) / r[i]);
  return (Math.hypot(...q) - 1) * Math.min(...r);
};
const smooth = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const sdf = (p) =>
  smooth(
    smooth(
      ell(p, [0, 0.86, 0], [0.5, 0.71, 0.36]),
      ell(p, [-0.23, 0.23, 0.035], [0.22, 0.26, 0.29]),
      0.16,
    ),
    ell(p, [0.23, 0.23, 0.035], [0.22, 0.26, 0.29]),
    0.16,
  );
function implicit() {
  const out = [],
    n = 36,
    lo = [-0.65, -0.06, -0.48],
    hi = [0.65, 1.6, 0.48];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const tetra = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++) {
        const pts = corners.map((c) =>
            c.map((v, i) => lo[i] + (([x, y, z][i] + v) / n) * (hi[i] - lo[i])),
          ),
          ds = pts.map(sdf);
        if (ds.every((d) => d > 0) || ds.every((d) => d < 0)) continue;
        for (const tet of tetra) {
          const cut = [];
          for (const [a, b] of edges) {
            const ia = tet[a],
              ib = tet[b];
            if (ds[ia] < 0 === ds[ib] < 0) continue;
            const t = ds[ia] / (ds[ia] - ds[ib]);
            cut.push(
              new T.Vector3(...pts[ia].map((v, i) => v + (pts[ib][i] - v) * t)),
            );
          }
          if (cut.length < 3) continue;
          const center = cut
              .reduce((a, b) => a.add(b), new T.Vector3())
              .multiplyScalar(1 / cut.length),
            eps = 0.0001;
          const normal = new T.Vector3(
            ...[0, 1, 2].map((i) => {
              const a = center.toArray(),
                b = center.toArray();
              a[i] += eps;
              b[i] -= eps;
              return sdf(a) - sdf(b);
            }),
          ).normalize();
          const u = cut[0].clone().sub(center).normalize(),
            v = new T.Vector3().crossVectors(normal, u);
          cut.sort(
            (a, b) =>
              Math.atan2(
                a.clone().sub(center).dot(v),
                a.clone().sub(center).dot(u),
              ) -
              Math.atan2(
                b.clone().sub(center).dot(v),
                b.clone().sub(center).dot(u),
              ),
          );
          for (let i = 1; i < cut.length - 1; i++)
            out.push(
              ...cut[0].toArray(),
              ...cut[i].toArray(),
              ...cut[i + 1].toArray(),
            );
        }
      }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(out, 3));
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  return merged;
}
skin("Seamless_body_and_feet", implicit(), (x, y) => {
  const w = T.MathUtils.clamp((0.53 - y) / 0.28, 0, 1);
  return [
    [1, x < 0 ? 5 : 6, 0, 0],
    [1 - w, w, 0, 0],
  ];
});
function limb(name, x, idx) {
  const g = new T.SphereGeometry(1, 28, 24);
  g.scale(0.15, 0.42, 0.17);
  g.rotateZ(x < 0 ? -0.48 : 0.48);
  g.translate(x, 0.93, 0.025);
  skin(name, g, fixed(idx));
}
limb("Left_arm", -0.51, 3);
limb("Right_arm", 0.51, 4);
function eyes(name, x) {
  const g = new T.SphereGeometry(1, 32, 24);
  g.scale(0.088, 0.135, 0.055);
  const mesh = new T.Mesh(g, ink);
  mesh.name = name;
  const t = 0.77 / 2.12,
    sec = section(t),
    z = sculpt(t, Math.acos((x - sec.cx) / sec.w))[2] + 0.03;
  mesh.position.set(x, 0.76, z);
  head.add(mesh);
  return mesh;
}
eyes("EyeL", -0.4);
eyes("EyeR", 0.4);
// Conform every blush vertex to the face surface: a flat floating disc was disappearing inside the head.
for (const side of [-1, 1]) {
  const positions = [],
    colors = [],
    ix = [];
  const point = (r, a) => {
    const x = side * 0.65 + Math.cos(a) * 0.26 * r,
      y = 2.11 + Math.sin(a) * 0.17 * r,
      t = (y - 1.44) / 2.12,
      { w, d, cx } = section(t);
    const angle = Math.acos(T.MathUtils.clamp((x - cx) / w, -1, 1));
    const surface = sculpt(t, angle);
    positions.push(x, y - 1.45, surface[2] + 0.009);
    colors.push(1, 0.43, 0.35, 0.34 * Math.pow(1 - r, 1.4));
  };
  point(0, 0);
  for (let ring = 1; ring <= 10; ring++)
    for (let k = 0; k <= 48; k++) point(ring / 10, (k / 48) * Math.PI * 2);
  for (let k = 0; k < 48; k++) ix.push(0, 1 + k, 2 + k);
  for (let j = 0; j < 9; j++)
    for (let k = 0; k < 48; k++) {
      const p = 1 + j * 49 + k;
      ix.push(p, p + 49, p + 1, p + 1, p + 49, p + 50);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colors, 4));
  g.setIndex(ix);
  g.computeVertexNormals();
  const blush = new T.Mesh(
    g,
    new T.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  blush.name = side < 0 ? "BlushL" : "BlushR";
  head.add(blush);
}
scene.updateMatrixWorld(true);
// Shorter lower body; head dimensions remain intact. Rebind to the new rest pose.
const lowerScale = 0.84;
for (const b of bones) if (b !== root) b.position.y *= lowerScale;
scene.traverse((o) => {
  if (o instanceof T.SkinnedMesh) {
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(
        i,
        o.name === "Cream_sculpted_head"
          ? p.getY(i) - 1.45 * (1 - lowerScale)
          : p.getY(i) * lowerScale,
      );
    p.needsUpdate = true;
    o.geometry.computeVertexNormals();
  }
});
scene.updateMatrixWorld(true);
skeleton.calculateInverses();
const animations = [];
const rot = (name, axis, values, times) => {
  const qs = values.flatMap((a) =>
    new T.Quaternion().setFromAxisAngle(new T.Vector3(...axis), a).toArray(),
  );
  return new T.QuaternionKeyframeTrack(`${name}.quaternion`, times, qs);
};
const pos = (name, values, times) =>
  new T.VectorKeyframeTrack(
    `${name}.position`,
    times,
    values
      .map((v) => (name === "Body" ? [v[0], v[1] * lowerScale, v[2]] : v))
      .flat(),
  );
const scale = (name, values, times) =>
  new T.VectorKeyframeTrack(`${name}.scale`, times, values.flat());
const clip = (name, duration, tracks) =>
  animations.push(new T.AnimationClip(name, duration, tracks));
clip("Idle", 2.8, [
  scale(
    "Body",
    [
      [1, 1, 1],
      [1.015, 1.025, 1.015],
      [1, 1, 1],
    ],
    [0, 1.4, 2.8],
  ),
]);
clip(
  "Blink",
  0.18,
  ["EyeL", "EyeR"].map((n) =>
    scale(
      n,
      [
        [1, 1, 1],
        [1, 0.08, 1],
        [1, 1, 1],
      ],
      [0, 0.08, 0.18],
    ),
  ),
);
clip("Look", 1.2, [
  rot("Head", [0, 1, 0], [0, -0.17, 0.2, 0], [0, 0.4, 0.85, 1.2]),
]);
clip("HeadTilt", 1.2, [
  rot("Head", [0, 0, 1], [0, 0.09, 0.09, 0], [0, 0.28, 0.85, 1.2]),
]);
clip("Walk", 0.72, [
  rot("LegL", [1, 0, 0], [-0.14, 0.14, -0.14], [0, 0.36, 0.72]),
  rot("LegR", [1, 0, 0], [0.14, -0.14, 0.14], [0, 0.36, 0.72]),
  rot("ArmL", [1, 0, 0], [0.14, -0.14, 0.14], [0, 0.36, 0.72]),
  rot("ArmR", [1, 0, 0], [-0.14, 0.14, -0.14], [0, 0.36, 0.72]),
]);
clip("Jump", 0.8, [
  scale(
    "Body",
    [
      [1, 1, 1],
      [1.03, 0.93, 1.03],
      [0.98, 1.04, 0.98],
      [1, 1, 1],
    ],
    [0, 0.15, 0.35, 0.8],
  ),
  rot("ArmL", [0, 0, 1], [0, -0.7, 0], [0, 0.3, 0.8]),
  rot("ArmR", [0, 0, 1], [0, 0.7, 0], [0, 0.3, 0.8]),
]);
clip("Sit", 1, [
  pos(
    "Body",
    [
      [0, 0.95, 0],
      [0, 0.61, 0],
    ],
    [0, 1],
  ),
  rot("LegL", [1, 0, 0], [0, -1.1], [0, 1]),
  rot("LegR", [1, 0, 0], [0, -1.1], [0, 1]),
]);
clip("Sleep", 3, [
  pos(
    "Body",
    [
      [0, 0.59, 0],
      [0, 0.61, 0],
      [0, 0.59, 0],
    ],
    [0, 1.5, 3],
  ),
  rot("Head", [1, 0, 0], [0.23, 0.28, 0.23], [0, 1.5, 3]),
  ...["EyeL", "EyeR"].map((n) =>
    scale(
      n,
      [
        [1, 0.07, 1],
        [1, 0.07, 1],
      ],
      [0, 3],
    ),
  ),
]);
clip("WakeUp", 1, [
  pos(
    "Body",
    [
      [0, 0.61, 0],
      [0, 0.95, 0],
    ],
    [0, 1],
  ),
  rot("Head", [1, 0, 0], [0.28, -0.12, 0], [0, 0.35, 1]),
]);
clip("Stretch", 1.7, [
  scale(
    "Body",
    [
      [1, 1, 1],
      [0.98, 1.04, 0.98],
      [1, 1, 1],
    ],
    [0, 0.8, 1.7],
  ),
  rot("ArmL", [0, 0, 1], [0, -1.3, 0], [0, 0.65, 1.7]),
  rot("ArmR", [0, 0, 1], [0, 1.3, 0], [0, 0.65, 1.7]),
]);
clip("Fall", 0.5, [
  rot("Root", [0, 0, 1], [0, -1.45], [0, 0.5]),
  pos(
    "Root",
    [
      [0, 0, 0],
      [-1.05, 0.85, 0],
    ],
    [0, 0.5],
  ),
]);
clip("GetUp", 1.1, [
  rot("Root", [0, 0, 1], [-1.45, -1.1, 0.12, 0], [0, 0.45, 0.85, 1.1]),
  pos(
    "Root",
    [
      [-1.05, 0.85, 0],
      [-0.7, 0.75, 0],
      [0, 0, 0],
    ],
    [0, 0.5, 1.1],
  ),
]);
clip("Happy", 1.8, [
  rot(
    "Root",
    [0, 1, 0],
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2],
    [0, 0.45, 0.9, 1.35, 1.8],
  ),
  rot("ArmL", [0, 0, 1], [0, -0.45, 0], [0, 0.9, 1.8]),
  rot("ArmR", [0, 0, 1], [0, 0.45, 0], [0, 0.9, 1.8]),
]);
clip("Angry", 1.25, [
  rot(
    "Head",
    [0, 1, 0],
    [0, -0.3, 0.3, -0.2, 0.2, 0],
    [0, 0.25, 0.5, 0.75, 1, 1.25],
  ),
  pos(
    "Body",
    [
      [0, 0.95, 0],
      [0, 1.02, 0],
      [0, 0.95, 0],
      [0, 1.02, 0],
      [0, 0.95, 0],
    ],
    [0, 0.25, 0.4, 0.65, 1.25],
  ),
]);
clip("Surprised", 0.75, [
  scale(
    "Body",
    [
      [1, 1, 1],
      [0.88, 1.12, 0.9],
      [1, 1, 1],
    ],
    [0, 0.2, 0.75],
  ),
  rot("ArmL", [0, 0, 1], [0, -1.1, 0], [0, 0.2, 0.75]),
  rot("ArmR", [0, 0, 1], [0, 1.1, 0], [0, 0.2, 0.75]),
]);
clip("Held", 1.6, [
  rot("ArmL", [0, 0, 1], [0.22, 0.1, 0.22], [0, 0.8, 1.6]),
  rot("ArmR", [0, 0, 1], [-0.22, -0.1, -0.22], [0, 0.8, 1.6]),
  rot("LegL", [1, 0, 0], [0.08, -0.08, 0.08], [0, 0.8, 1.6]),
  rot("LegR", [1, 0, 0], [-0.08, 0.08, -0.08], [0, 0.8, 1.6]),
]);
const result = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  animations,
});
await mkdir("public/models", { recursive: true });
await writeFile("public/models/sculpy.glb", Buffer.from(result));
await writeFile(
  "assets/models/model-manifest.json",
  JSON.stringify(
    {
      generator: "scripts/build-model.mjs",
      status: "procedural development sculpt; visual approval pending",
      height: 3.33,
      bones: bones.map((b) => b.name),
      animations: animations.map((a) => ({
        name: a.name,
        duration: a.duration,
      })),
      triangles: Math.round(triangles),
      bytes: result.byteLength,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `SCULPY: ${result.byteLength} bytes; ${Math.round(triangles)} triangles; ${bones.length} bones; ${animations.length} clips`,
);
