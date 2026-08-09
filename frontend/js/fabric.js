import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("fabric-canvas");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  canvas.closest("div").style.display = "none"; // no WebGL: hide canvas, keep stories
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfadccb, 0.8);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  // A ribbon: a finely segmented plane whose vertices we wave each frame
  const geo = new THREE.PlaneGeometry(3.4, 1.1, 140, 32);
  const basePos = geo.attributes.position.array.slice();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#FADCCB"),
    roughness: 0.35,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(geo, mat);
  scene.add(ribbon);

  const targetColor = new THREE.Color("#FADCCB");

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // Silk motion: layered sine waves plus a twist along the ribbon's length
  function deform(t) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = basePos[i * 3];
      const y = basePos[i * 3 + 1];
      const twist = x * 0.9 + t * 0.6;
      const wave =
        Math.sin(x * 2.2 + t) * 0.22 +
        Math.sin(x * 4.5 - t * 1.3) * 0.08;
      pos.setY(i, y * Math.cos(twist) + wave);
      pos.setZ(i, y * Math.sin(twist) + Math.sin(x * 1.4 + t * 0.8) * 0.18);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  let t = 0;
  renderer.setAnimationLoop(() => {
    if (!reduceMotion) {
      t += 0.012;
      deform(t);
      ribbon.rotation.y += 0.003;
    } else {
      deform(0.8); // one static elegant pose
    }
    mat.color.lerp(targetColor, 0.05); // smooth color transitions
    renderer.render(scene, camera);
  });

  // Color follows whichever story panel is in view
  const panelObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          targetColor.set(entry.target.dataset.color);
        }
      }
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll(".story-panel").forEach((p) => panelObserver.observe(p));
}