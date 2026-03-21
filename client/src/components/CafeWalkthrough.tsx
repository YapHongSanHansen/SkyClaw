/**
 * CafeWalkthrough — Third-person 3D walkthrough of the cafe GLB model
 * Style: thevertmenthe.dault-lafon.fr
 * - Character (avatar) visible from behind, walks through the cafe
 * - Camera follows behind the character smoothly
 * - WASD / Arrow keys to move
 * - Circular floor markers at key spots
 * - Info hotspots near interesting cafe features
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const GLB_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-model_9553524a.glb";

// Key spots in the cafe (world-space XZ positions, Y = floor level)
const FLOOR_MARKERS = [
  { id: "entrance", label: "Entrance", x: 0, z: 4 },
  { id: "bar", label: "Bar Counter", x: -2, z: 0 },
  { id: "main", label: "Main Hall", x: 0, z: -1 },
  { id: "seating", label: "Seating Area", x: 2.5, z: -2 },
  { id: "window", label: "Window Side", x: -3, z: -3 },
  { id: "staircase", label: "Spiral Staircase", x: 1, z: -5 },
];

const INFO_HOTSPOTS = [
  { id: "bar-info", label: "Bar Counter", desc: "Handcrafted wooden bar with specialty coffee menu", x: -2, z: 0 },
  { id: "stair-info", label: "Spiral Staircase", desc: "Iconic spiral staircase leading to upper floor seating", x: 1, z: -5 },
  { id: "window-info", label: "Window Seating", desc: "Natural light seating area with garden view", x: -3, z: -3 },
];

function buildCharacter(): THREE.Group {
  const group = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.6, emissive: 0x00e5ff, emissiveIntensity: 0.3 });

  // Body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 8), mat);
  body.position.y = 0.65;
  group.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat);
  head.position.y = 1.1;
  group.add(head);

  // Eyes (cyan glow)
  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
  const leftEye = new THREE.Mesh(eyeGeo, matAccent);
  leftEye.position.set(-0.06, 1.12, 0.13);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, matAccent);
  rightEye.position.set(0.06, 1.12, 0.13);
  group.add(rightEye);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.3, 4, 6);
  const leftArm = new THREE.Mesh(armGeo, mat);
  leftArm.position.set(-0.28, 0.7, 0);
  leftArm.rotation.z = 0.3;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, mat);
  rightArm.position.set(0.28, 0.7, 0);
  rightArm.rotation.z = -0.3;
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.08, 0.35, 4, 6);
  const leftLeg = new THREE.Mesh(legGeo, mat);
  leftLeg.position.set(-0.12, 0.22, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, mat);
  rightLeg.position.set(0.12, 0.22, 0);
  group.add(rightLeg);

  // Cast shadows
  group.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
    }
  });

  return group;
}

function buildFloorMarker(label: string): THREE.Group {
  const group = new THREE.Group();

  // Outer ring
  const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  // Inner fill
  const fillGeo = new THREE.CircleGeometry(0.32, 32);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.001;
  group.add(fill);

  // Label sprite
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.roundRect(4, 4, 248, 56, 12);
  ctx.fill();
  ctx.fillStyle = "#00e5ff";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 0.6;
  group.add(sprite);

  return group;
}

export default function CafeWalkthrough() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    keys: {} as Record<string, boolean>,
    charPos: new THREE.Vector3(0, 0, 4),
    charAngle: Math.PI, // facing into the scene
    camOffset: new THREE.Vector3(0, 2.2, 3.5),
    isMoving: false,
    walkCycle: 0,
    nearHotspot: null as string | null,
  });
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<typeof INFO_HOTSPOTS[0] | null>(null);
  const [nearLabel, setNearLabel] = useState<string | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 2.5;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a24);
    scene.fog = new THREE.Fog(0x1a1a24, 25, 60);

    // Camera
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    camera.position.set(0, 2.2, 7.5);

    // Lighting — BRIGHT for stage presentation on large screens
    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambient);

    // Hemisphere light for natural fill (sky + ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xfff0dd, 1.5);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff8e7, 3.0);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -15;
    sunLight.shadow.camera.right = 15;
    sunLight.shadow.camera.top = 15;
    sunLight.shadow.camera.bottom = -15;
    scene.add(sunLight);

    // Second directional from opposite side for even lighting
    const sunLight2 = new THREE.DirectionalLight(0xfff0dd, 2.0);
    sunLight2.position.set(-5, 8, -5);
    scene.add(sunLight2);

    // Warm fill lights spread around the room
    const fillLight = new THREE.PointLight(0xff9944, 2.0, 25);
    fillLight.position.set(-3, 3, 0);
    scene.add(fillLight);

    const fillLight2 = new THREE.PointLight(0xffcc88, 1.5, 25);
    fillLight2.position.set(3, 3, -3);
    scene.add(fillLight2);

    const fillLight3 = new THREE.PointLight(0xffffff, 1.5, 25);
    fillLight3.position.set(0, 4, 2);
    scene.add(fillLight3);

    // Cyan accent light (matches the character)
    const accentLight = new THREE.PointLight(0x00e5ff, 0.8, 15);
    accentLight.position.set(2, 2, -3);
    scene.add(accentLight);

    // Character
    const character = buildCharacter();
    character.position.copy(stateRef.current.charPos);
    scene.add(character);

    // Floor markers
    const markerMeshes: Array<{ mesh: THREE.Group; id: string; x: number; z: number }> = [];
    FLOOR_MARKERS.forEach((m) => {
      const mesh = buildFloorMarker(m.label);
      mesh.position.set(m.x, 0.02, m.z);
      scene.add(mesh);
      markerMeshes.push({ mesh, id: m.id, x: m.x, z: m.z });
    });

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      GLB_URL,
      (gltf) => {
        const model = gltf.scene;

        // Auto-scale and center
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 12 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        // Lift to floor
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat.map) mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
          }
        });

        scene.add(model);
        setLoaded(true);
      },
      (xhr) => {
        if (xhr.total > 0) setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
      },
      (err) => console.error("GLB load error", err)
    );

    // Key handlers
    const onKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = true;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].includes(e.code)) {
        e.preventDefault();
        setHint(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { stateRef.current.keys[e.code] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Click on floor marker to teleport
    const raycaster = new THREE.Raycaster();
    const markerObjects = markerMeshes.map((m) => m.mesh);
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycaster.intersectObjects(markerObjects, true);
      if (hits.length > 0) {
        // Find which marker
        for (const m of markerMeshes) {
          if (m.mesh === hits[0].object.parent || m.mesh === hits[0].object.parent?.parent) {
            stateRef.current.charPos.set(m.x, 0, m.z);
            character.position.copy(stateRef.current.charPos);
            break;
          }
        }
      }
      // Check hotspot click
      if (stateRef.current.nearHotspot) {
        const hs = INFO_HOTSPOTS.find((h) => h.id === stateRef.current.nearHotspot);
        if (hs) setActiveHotspot(hs);
      }
    };
    canvas.addEventListener("click", onClick);

    // Animation loop
    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const st = stateRef.current;
      const SPEED = 3.5;
      const TURN_SPEED = 2.2;

      const keys = st.keys;
      const turnLeft = keys["ArrowLeft"] || keys["KeyA"];
      const turnRight = keys["ArrowRight"] || keys["KeyD"];
      const moveForward = keys["ArrowUp"] || keys["KeyW"];
      const moveBack = keys["ArrowDown"] || keys["KeyS"];

      if (turnLeft) st.charAngle += TURN_SPEED * delta;
      if (turnRight) st.charAngle -= TURN_SPEED * delta;

      const moving = moveForward || moveBack;
      st.isMoving = moving;

      if (moveForward) {
        st.charPos.x -= Math.sin(st.charAngle) * SPEED * delta;
        st.charPos.z -= Math.cos(st.charAngle) * SPEED * delta;
      }
      if (moveBack) {
        st.charPos.x += Math.sin(st.charAngle) * SPEED * delta;
        st.charPos.z += Math.cos(st.charAngle) * SPEED * delta;
      }

      // Clamp to reasonable bounds
      st.charPos.x = THREE.MathUtils.clamp(st.charPos.x, -8, 8);
      st.charPos.z = THREE.MathUtils.clamp(st.charPos.z, -8, 8);

      character.position.copy(st.charPos);
      character.rotation.y = st.charAngle;

      // Walk animation (bob legs/arms)
      if (moving) {
        st.walkCycle += delta * 8;
        const bob = Math.sin(st.walkCycle) * 0.06;
        character.children.forEach((c, i) => {
          if (i === 5) (c as THREE.Mesh).rotation.x = Math.sin(st.walkCycle) * 0.4; // leftLeg
          if (i === 6) (c as THREE.Mesh).rotation.x = -Math.sin(st.walkCycle) * 0.4; // rightLeg
          if (i === 3) (c as THREE.Mesh).rotation.x = -Math.sin(st.walkCycle) * 0.3; // leftArm
          if (i === 4) (c as THREE.Mesh).rotation.x = Math.sin(st.walkCycle) * 0.3; // rightArm
        });
        character.position.y = Math.abs(bob);
      } else {
        character.children.forEach((c) => {
          (c as THREE.Mesh).rotation.x = THREE.MathUtils.lerp((c as THREE.Mesh).rotation.x, 0, 0.15);
        });
        character.position.y = THREE.MathUtils.lerp(character.position.y, 0, 0.15);
      }

      // Pulse floor markers
      const t = clock.getElapsedTime();
      markerMeshes.forEach(({ mesh }) => {
        const ring = mesh.children[0] as THREE.Mesh;
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.5 + Math.sin(t * 2) * 0.2;
        mesh.rotation.y = t * 0.3;
      });

      // Check proximity to hotspots
      let nearId: string | null = null;
      for (const hs of INFO_HOTSPOTS) {
        const dx = st.charPos.x - hs.x;
        const dz = st.charPos.z - hs.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
          nearId = hs.id;
          break;
        }
      }
      if (nearId !== st.nearHotspot) {
        st.nearHotspot = nearId;
        const hs = nearId ? INFO_HOTSPOTS.find((h) => h.id === nearId) : null;
        setNearLabel(hs ? hs.label : null);
      }

      // Smooth follow camera
      const targetCamPos = new THREE.Vector3(
        st.charPos.x + Math.sin(st.charAngle) * st.camOffset.z,
        st.charPos.y + st.camOffset.y,
        st.charPos.z + Math.cos(st.charAngle) * st.camOffset.z
      );
      camera.position.lerp(targetCamPos, 0.08);
      const lookTarget = new THREE.Vector3(
        st.charPos.x,
        st.charPos.y + 0.8,
        st.charPos.z
      );
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("click", onClick);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black select-none" style={{ minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        tabIndex={0}
        style={{ outline: "none", cursor: "crosshair" }}
      />

      {/* Loading overlay */}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <div className="font-mono text-cyan text-sm tracking-widest mb-4 uppercase">
            Loading Cafe Model
          </div>
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <div className="font-mono text-cyan/60 text-xs mt-2">{loadProgress}%</div>
        </div>
      )}

      {/* Top-left info card */}
      <div className="absolute top-4 left-4 z-10 bg-black/75 backdrop-blur-sm rounded-xl px-4 py-3 text-white max-w-[220px]">
        <div className="font-bold text-sm leading-tight">OpenClaw Cafe</div>
        <div className="text-xs text-white/60 mt-0.5">3D Virtual Tour · Scanned Mar 2026</div>
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-4 h-4 rounded-full bg-cyan flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1L5 9M1 5L9 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-[10px] text-cyan font-mono tracking-wider">OpenClaw 3D Tour</span>
        </div>
      </div>

      {/* Bottom controls bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-6 bg-black/70 backdrop-blur-sm rounded-full px-6 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex gap-0.5">
              <kbd className="w-6 h-6 bg-white/15 rounded text-white text-[10px] flex items-center justify-center font-mono">↑</kbd>
            </div>
            <div className="flex gap-0.5">
              <kbd className="w-6 h-6 bg-white/15 rounded text-white text-[10px] flex items-center justify-center font-mono">←</kbd>
              <kbd className="w-6 h-6 bg-white/15 rounded text-white text-[10px] flex items-center justify-center font-mono">↓</kbd>
              <kbd className="w-6 h-6 bg-white/15 rounded text-white text-[10px] flex items-center justify-center font-mono">→</kbd>
            </div>
          </div>
          <span className="text-white/60 text-[10px] font-mono ml-1">Move</span>
        </div>
        <div className="w-px h-6 bg-white/20" />
        {nearLabel ? (
          <button
            onClick={() => {
              const hs = INFO_HOTSPOTS.find((h) => h.label === nearLabel);
              if (hs) setActiveHotspot(hs);
            }}
            className="text-cyan text-[11px] font-mono tracking-wider animate-pulse"
          >
            ↵ See details
          </button>
        ) : (
          <span className="text-white/40 text-[10px] font-mono">Click marker to jump</span>
        )}
        <div className="w-px h-6 bg-white/20" />
        <span className="text-white/40 text-[10px] font-mono">ESC close</span>
      </div>

      {/* Hint overlay */}
      {hint && loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
          onClick={() => setHint(false)}
        >
          <div className="bg-black/80 backdrop-blur-sm rounded-2xl px-8 py-6 text-center max-w-xs">
            <div className="text-cyan text-3xl mb-3">🎮</div>
            <div className="text-white font-bold text-base mb-1">Walk Through the Cafe</div>
            <div className="text-white/60 text-sm">Use arrow keys or WASD to move your character. Click floor circles to teleport. Approach highlighted spots to see details.</div>
            <div className="mt-4 text-cyan text-xs font-mono tracking-wider">Click anywhere to start</div>
          </div>
        </div>
      )}

      {/* Hotspot info panel */}
      {activeHotspot && (
        <div className="absolute top-4 right-4 z-20 bg-black/85 backdrop-blur-sm rounded-xl p-4 max-w-[220px] text-white">
          <button
            onClick={() => setActiveHotspot(null)}
            className="absolute top-2 right-2 text-white/40 hover:text-white text-xs"
          >
            ✕
          </button>
          <div className="font-bold text-sm mb-1">{activeHotspot.label}</div>
          <div className="text-xs text-white/70 leading-relaxed">{activeHotspot.desc}</div>
        </div>
      )}
    </div>
  );
}
