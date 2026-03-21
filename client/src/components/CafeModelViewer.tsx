/**
 * CafeModelViewer — Interactive 3D GLB viewer for the cafe model
 * - Orbit mode: drag to rotate, scroll to zoom, right-click to pan
 * - Walk mode: double-click to enter first-person, WASD/arrow keys to move, mouse to look
 * - Google Maps-style UI: top-left info card, bottom-left mini controls, fullscreen button
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Maximize2, Minimize2, RotateCcw, Move, Eye, Loader2 } from "lucide-react";

const CAFE_MODEL_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-model_9553524a.glb";

type ViewMode = "orbit" | "walk";

export default function CafeModelViewer({ onClose }: { onClose?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const modelRef = useRef<THREE.Object3D | null>(null);

  // Walk mode state
  const walkStateRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    pointerLocked: false,
    yaw: 0,
    pitch: 0,
  });

  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [walkHint, setWalkHint] = useState(false);

  // ─── Scene setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      200
    );
    camera.position.set(0, 2, 8);
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.8);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(0, 1, 0);
    orbitControlsRef.current = controls;

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      CAFE_MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        // Centre and scale the model
        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(centre.multiplyScalar(scale));
        // Lift so floor is at y=0
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);
        modelRef.current = model;

        // Position camera nicely
        const box3 = new THREE.Box3().setFromObject(model);
        const modelSize = box3.getSize(new THREE.Vector3());
        const modelCentre = box3.getCenter(new THREE.Vector3());
        camera.position.set(
          modelCentre.x,
          modelCentre.y + modelSize.y * 0.3,
          modelCentre.z + modelSize.z * 0.8
        );
        controls.target.copy(modelCentre);
        controls.update();

        setIsLoaded(true);
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        console.error("GLB load error", err);
        setLoadError("Failed to load 3D model");
      }
    );

    // Resize handler
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Render loop
    const clock = new THREE.Clock();
    const walkSpeed = 3;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();

      if (viewMode === "walk" || walkStateRef.current.pointerLocked) {
        // First-person movement
        const ws = walkStateRef.current;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));

        if (ws.forward) camera.position.addScaledVector(dir, walkSpeed * dt);
        if (ws.backward) camera.position.addScaledVector(dir, -walkSpeed * dt);
        if (ws.left) camera.position.addScaledVector(right, -walkSpeed * dt);
        if (ws.right) camera.position.addScaledVector(right, walkSpeed * dt);

        // Keep camera at eye height
        camera.position.y = Math.max(0.5, Math.min(camera.position.y, 8));
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── View mode switching ────────────────────────────────────────────────────
  useEffect(() => {
    const controls = orbitControlsRef.current;
    if (!controls) return;
    if (viewMode === "walk") {
      controls.enabled = false;
      setWalkHint(true);
      setTimeout(() => setWalkHint(false), 3000);
    } else {
      controls.enabled = true;
      // Exit pointer lock if active
      if (document.pointerLockElement) document.exitPointerLock();
      walkStateRef.current.pointerLocked = false;
    }
  }, [viewMode]);

  // ─── Walk mode: pointer lock + mouse look ──────────────────────────────────
  const handleCanvasClick = useCallback(() => {
    if (viewMode !== "walk") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.requestPointerLock();
  }, [viewMode]);

  useEffect(() => {
    const onLockChange = () => {
      walkStateRef.current.pointerLocked =
        document.pointerLockElement === canvasRef.current;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!walkStateRef.current.pointerLocked) return;
      const sensitivity = 0.002;
      walkStateRef.current.yaw -= e.movementX * sensitivity;
      walkStateRef.current.pitch -= e.movementY * sensitivity;
      walkStateRef.current.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, walkStateRef.current.pitch));

      const camera = cameraRef.current;
      if (!camera) return;
      const euler = new THREE.Euler(
        walkStateRef.current.pitch,
        walkStateRef.current.yaw,
        0,
        "YXZ"
      );
      camera.quaternion.setFromEuler(euler);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  // ─── Walk mode: keyboard ────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "walk") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ws = walkStateRef.current;
      if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") ws.forward = true;
      if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") ws.backward = true;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") ws.left = true;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") ws.right = true;
      if (e.key === "Escape") {
        setViewMode("orbit");
        if (document.pointerLockElement) document.exitPointerLock();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const ws = walkStateRef.current;
      if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") ws.forward = false;
      if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") ws.backward = false;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") ws.left = false;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") ws.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [viewMode]);

  // ─── Reset camera ───────────────────────────────────────────────────────────
  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    const model = modelRef.current;
    if (!camera || !controls || !model) return;
    setViewMode("orbit");
    const box = new THREE.Box3().setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    camera.position.set(centre.x, centre.y + size.y * 0.3, centre.z + size.z * 0.8);
    controls.target.copy(centre);
    controls.update();
  }, []);

  // ─── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a2e] overflow-hidden select-none"
      style={{ minHeight: 400 }}
    >
      {/* Three.js canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onClick={handleCanvasClick}
        style={{ cursor: viewMode === "walk" ? "crosshair" : "grab" }}
      />

      {/* Loading overlay */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a2e]/90 z-20">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
          <p className="text-cyan-400 font-mono text-sm tracking-widest">
            LOADING 3D MODEL... {loadProgress}%
          </p>
          <div className="mt-3 w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/90 z-20">
          <p className="text-red-400 font-mono text-sm">{loadError}</p>
        </div>
      )}

      {/* Top-left info card (Google Maps style) */}
      {isLoaded && (
        <div className="absolute top-3 left-3 z-10 bg-black/80 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg max-w-[220px]">
          <p className="text-white font-semibold text-sm leading-tight">Cafe Interior</p>
          <p className="text-white/50 text-xs mt-0.5">Ground Floor · 3D Model</p>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
            <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
              <Eye className="w-3 h-3 text-white" />
            </div>
            <span className="text-white/70 text-xs">OpenClaw 3D Scan</span>
            <span className="ml-auto text-white/40 text-xs font-mono">GLB</span>
          </div>
        </div>
      )}

      {/* Top-right controls */}
      {isLoaded && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 hover:text-white transition-all shadow"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={resetCamera}
            className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 hover:text-white transition-all shadow"
            title="Reset camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 hover:text-white transition-all shadow text-lg font-bold"
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Bottom mode switcher (Google Maps style) */}
      {isLoaded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/80 backdrop-blur-sm rounded-full px-2 py-1.5 shadow-lg">
          <button
            onClick={() => setViewMode("orbit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              viewMode === "orbit"
                ? "bg-cyan-500 text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            Orbit
          </button>
          <button
            onClick={() => setViewMode("walk")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              viewMode === "walk"
                ? "bg-cyan-500 text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <Move className="w-3 h-3" />
            Walk
          </button>
        </div>
      )}

      {/* Walk mode hint */}
      {walkHint && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-black/80 text-white text-xs font-mono px-4 py-2 rounded-full whitespace-nowrap animate-fade-in">
          Click to lock cursor · WASD to move · ESC to exit
        </div>
      )}

      {/* Walk mode active indicator */}
      {viewMode === "walk" && walkStateRef.current.pointerLocked && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="w-4 h-4 border-2 border-white/80 rounded-full" />
        </div>
      )}

      {/* Bottom hint bar */}
      {isLoaded && (
        <div className="absolute bottom-0 left-0 right-0 z-10 text-center pb-1">
          <span className="text-white/30 text-[10px] font-mono">
            {viewMode === "orbit"
              ? "Drag to rotate · Scroll to zoom · Right-drag to pan"
              : "Click to lock cursor · WASD/arrows to walk · Mouse to look · ESC to exit"}
          </span>
        </div>
      )}
    </div>
  );
}
