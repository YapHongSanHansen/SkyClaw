/**
 * VirtualTour — Google Street View-style tour built from video frames.
 *
 * 62 frames extracted from a walkthrough video (1 fps).
 * Each frame is a static viewpoint. The view is FROZEN until the user
 * clicks forward/back arrows or clicks in the scene direction.
 * Drag mouse to look around (pan the camera) at each position.
 *
 * Layout matches Google Street View:
 *  - Full bright photo fills viewport (sphere interior, narrow FOV)
 *  - Top-left: dark info card (location name, frame counter)
 *  - Bottom-left: mini progress strip + prev/next arrows
 *  - Bottom-center: hint bar
 *  - Top-right: fullscreen + close
 *  - Large forward/back chevrons in the scene for navigation
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { X, Maximize2, Minimize2, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";

// ─── Frame data ────────────────────────────────────────────────────────────────

const BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv";

export const FRAMES: string[] = [
  `${BASE}/frame_001_61845924.jpg`,
  `${BASE}/frame_002_98290d84.jpg`,
  `${BASE}/frame_003_98138ceb.jpg`,
  `${BASE}/frame_004_99124f6c.jpg`,
  `${BASE}/frame_005_d6af12fe.jpg`,
  `${BASE}/frame_006_f3242c23.jpg`,
  `${BASE}/frame_007_1ba51c2f.jpg`,
  `${BASE}/frame_008_439fdc8c.jpg`,
  `${BASE}/frame_009_eaaed69e.jpg`,
  `${BASE}/frame_010_f57874da.jpg`,
  `${BASE}/frame_011_d01d7fc2.jpg`,
  `${BASE}/frame_012_ea8980b4.jpg`,
  `${BASE}/frame_013_32116724.jpg`,
  `${BASE}/frame_014_a5fb0872.jpg`,
  `${BASE}/frame_015_70e625fc.jpg`,
  `${BASE}/frame_016_c3d45bd7.jpg`,
  `${BASE}/frame_017_45d87f49.jpg`,
  `${BASE}/frame_018_d0dbf76a.jpg`,
  `${BASE}/frame_019_70923a79.jpg`,
  `${BASE}/frame_020_79bcef4a.jpg`,
  `${BASE}/frame_021_2d9099fa.jpg`,
  `${BASE}/frame_022_0d3163cc.jpg`,
  `${BASE}/frame_023_71758cdb.jpg`,
  `${BASE}/frame_024_2dd4f9ef.jpg`,
  `${BASE}/frame_025_e0985449.jpg`,
  `${BASE}/frame_026_671c5018.jpg`,
  `${BASE}/frame_027_5bd4d03d.jpg`,
  `${BASE}/frame_028_7336c02d.jpg`,
  `${BASE}/frame_029_9c17ec1a.jpg`,
  `${BASE}/frame_030_fba12735.jpg`,
  `${BASE}/frame_031_d2edd34b.jpg`,
  `${BASE}/frame_032_83600bb8.jpg`,
  `${BASE}/frame_033_754f99e9.jpg`,
  `${BASE}/frame_034_3920d0f3.jpg`,
  `${BASE}/frame_035_3f37724f.jpg`,
  `${BASE}/frame_036_ef0f79c6.jpg`,
  `${BASE}/frame_037_74c2b927.jpg`,
  `${BASE}/frame_038_8a991bcb.jpg`,
  `${BASE}/frame_039_23a89f84.jpg`,
  `${BASE}/frame_040_9352e890.jpg`,
  `${BASE}/frame_041_1debcb1a.jpg`,
  `${BASE}/frame_042_020834fa.jpg`,
  `${BASE}/frame_043_391c8a11.jpg`,
  `${BASE}/frame_044_132e9cb1.jpg`,
  `${BASE}/frame_045_199f817b.jpg`,
  `${BASE}/frame_046_8d7ca54a.jpg`,
  `${BASE}/frame_047_ec57c947.jpg`,
  `${BASE}/frame_048_cb212646.jpg`,
  `${BASE}/frame_049_955b2ec0.jpg`,
  `${BASE}/frame_050_f982f1cf.jpg`,
  `${BASE}/frame_051_48aa455a.jpg`,
  `${BASE}/frame_052_6561c319.jpg`,
  `${BASE}/frame_053_d22f9952.jpg`,
  `${BASE}/frame_054_7f359c4d.jpg`,
  `${BASE}/frame_055_62ec0658.jpg`,
  `${BASE}/frame_056_5a8a8840.jpg`,
  `${BASE}/frame_057_ed665952.jpg`,
  `${BASE}/frame_058_1823437f.jpg`,
  `${BASE}/frame_059_a03d5224.jpg`,
  `${BASE}/frame_060_15217aba.jpg`,
  `${BASE}/frame_061_99ec2a9e.jpg`,
  `${BASE}/frame_062_718bc041.jpg`,
];

// Rough section labels based on video walkthrough
function getLabel(idx: number): string {
  if (idx < 8) return "Entrance Area";
  if (idx < 18) return "Main Hall";
  if (idx < 28) return "Bar Counter";
  if (idx < 38) return "Seating Area";
  if (idx < 48) return "Window Side";
  if (idx < 56) return "Staircase";
  return "Upper Level";
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function lookTarget(lon: number, lat: number, r = 500): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface VirtualTourProps {
  initialIndex?: number;
  onClose?: () => void;
}

export default function VirtualTour({ initialIndex = 0, onClose }: VirtualTourProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereARef = useRef<THREE.Mesh | null>(null);
  const sphereBRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);

  // Camera orientation
  const lon = useRef(0);
  const lat = useRef(0);
  const targetLon = useRef(0);
  const targetLat = useRef(0);

  // Drag state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragDist = useRef(0);

  // Crossfade
  const fadeProgress = useRef(0);
  const isFadingRef = useRef(false);

  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const currentIdxRef = useRef(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Preload cache
  const textureCache = useRef<Map<number, THREE.Texture>>(new Map());

  // ── Three.js init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    // Narrow FOV — only the undistorted equatorial band is visible
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1, 1000
    );
    camera.position.set(0, 0, 0.01);
    cameraRef.current = camera;

    const makeSphere = (opacity: number) => {
      const geo = new THREE.SphereGeometry(500, 128, 64);
      geo.scale(-1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity });
      return new THREE.Mesh(geo, mat);
    };

    const sphereA = makeSphere(1);
    const sphereB = makeSphere(0);
    scene.add(sphereA, sphereB);
    sphereARef.current = sphereA;
    sphereBRef.current = sphereB;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      lon.current += (targetLon.current - lon.current) * 0.08;
      lat.current += (targetLat.current - lat.current) * 0.08;
      lat.current = Math.max(-70, Math.min(70, lat.current));
      camera.lookAt(lookTarget(lon.current, lat.current));

      if (isFadingRef.current) {
        fadeProgress.current = Math.min(fadeProgress.current + 0.07, 1);
        const matA = sphereARef.current!.material as THREE.MeshBasicMaterial;
        const matB = sphereBRef.current!.material as THREE.MeshBasicMaterial;
        matA.opacity = 1 - fadeProgress.current;
        matB.opacity = fadeProgress.current;
        if (fadeProgress.current >= 1) {
          matA.map = matB.map;
          matA.opacity = 1;
          matB.map = null;
          matB.opacity = 0;
          matA.needsUpdate = true;
          matB.needsUpdate = true;
          fadeProgress.current = 0;
          isFadingRef.current = false;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line

  // ── Load texture helper ───────────────────────────────────────────────────────
  const loadTexture = useCallback((idx: number): Promise<THREE.Texture> => {
    const cached = textureCache.current.get(idx);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(FRAMES[idx], (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        textureCache.current.set(idx, tex);
        resolve(tex);
      });
    });
  }, []);

  // ── Load initial frame ───────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    loadTexture(initialIndex).then((tex) => {
      const mat = sphereARef.current!.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      setIsLoading(false);
      // Preload adjacent frames
      if (initialIndex + 1 < FRAMES.length) loadTexture(initialIndex + 1);
      if (initialIndex - 1 >= 0) loadTexture(initialIndex - 1);
    });
  }, []); // eslint-disable-line

  // ── Navigate to frame ────────────────────────────────────────────────────────
  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= FRAMES.length || isFadingRef.current) return;
    if (idx === currentIdxRef.current) return;

    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    isFadingRef.current = true;
    fadeProgress.current = 0;

    loadTexture(idx).then((tex) => {
      const matB = sphereBRef.current!.material as THREE.MeshBasicMaterial;
      matB.map = tex;
      matB.needsUpdate = true;
    });

    // Preload next/prev
    if (idx + 1 < FRAMES.length) loadTexture(idx + 1);
    if (idx - 1 >= 0) loadTexture(idx - 1);
  }, [loadTexture]);

  const goForward = useCallback(() => goTo(currentIdxRef.current + 1), [goTo]);
  const goBack = useCallback(() => goTo(currentIdxRef.current - 1), [goTo]);

  // ── Click to navigate ────────────────────────────────────────────────────────
  const handleClick = useCallback((clientX: number, clientY: number) => {
    const container = mountRef.current;
    if (!container || isFadingRef.current) return;
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width; // 0..1
    // Right half of screen = forward, left half = back
    if (x > 0.55) goForward();
    else if (x < 0.45) goBack();
    else {
      // Center click: just pan toward click
      const ndcX = x * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      targetLon.current = lon.current - ndcX * 30;
      targetLat.current = Math.max(-60, Math.min(60, lat.current + ndcY * 20));
    }
  }, [goForward, goBack]);

  // ── Mouse events ─────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragDist.current = 0;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    targetLon.current -= dx * 0.18;
    targetLat.current = Math.max(-70, Math.min(70, targetLat.current + dy * 0.12));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const wasDrag = dragDist.current > 6;
    isDragging.current = false;
    if (!wasDrag) handleClick(e.clientX, e.clientY);
  };

  // ── Touch events ─────────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    dragDist.current = 0;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - lastMouse.current.x;
    const dy = e.touches[0].clientY - lastMouse.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    targetLon.current -= dx * 0.18;
    targetLat.current = Math.max(-70, Math.min(70, targetLat.current + dy * 0.12));
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const wasDrag = dragDist.current > 12;
    isDragging.current = false;
    if (!wasDrag) {
      const t = e.changedTouches[0];
      handleClick(t.clientX, t.clientY);
    }
  };

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") goForward();
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goForward, goBack]);

  const pct = Math.round((currentIdx / (FRAMES.length - 1)) * 100);
  const label = getLabel(currentIdx);

  return (
    <div
      className={`relative overflow-hidden ${isFullscreen ? "fixed inset-0 z-50" : "w-full h-full rounded-lg"}`}
      style={{ background: "#000", userSelect: "none" }}
    >
      {/* Three.js canvas */}
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ cursor: isDragging.current ? "grabbing" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { isDragging.current = false; }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Loading tour...</span>
          </div>
        </div>
      )}

      {/* Top-left info card */}
      {!isLoading && (
        <div
          className="absolute top-3 left-3 z-30 rounded-lg shadow-xl overflow-hidden"
          style={{ background: "rgba(32,33,36,0.95)", minWidth: 200 }}
        >
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            {onClose && (
              <button onClick={onClose}
                className="flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                style={{ width: 28, height: 28 }}>
                <ChevronLeft size={16} color="white" />
              </button>
            )}
            <div>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, fontWeight: 600, color: "white", lineHeight: 1.2 }}>
                {label}
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
                Step {currentIdx + 1} of {FRAMES.length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: "#4285F4" }}>
              <ArrowUp size={12} color="white" />
            </div>
            <span style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              OpenClaw 360° Tour
            </span>
            <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>
              Cafe
            </span>
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5">
        <button
          onClick={() => setIsFullscreen(f => !f)}
          className="flex items-center justify-center rounded-full shadow-lg hover:bg-white/90 transition-colors"
          style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}
        >
          {isFullscreen ? <Minimize2 size={15} color="white" /> : <Maximize2 size={15} color="white" />}
        </button>
        {onClose && (
          <button onClick={onClose}
            className="flex items-center justify-center rounded-full shadow-lg"
            style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}>
            <X size={15} color="white" />
          </button>
        )}
      </div>

      {/* Left/Right nav arrows — large, floating in scene */}
      {!isLoading && (
        <>
          {currentIdx > 0 && (
            <button
              onClick={goBack}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full shadow-xl transition-all hover:scale-110 active:scale-95"
              style={{ width: 52, height: 52, background: "rgba(32,33,36,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronLeft size={26} color="white" />
            </button>
          )}
          {currentIdx < FRAMES.length - 1 && (
            <button
              onClick={goForward}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full shadow-xl transition-all hover:scale-110 active:scale-95"
              style={{ width: 52, height: 52, background: "rgba(32,33,36,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ChevronRight size={26} color="white" />
            </button>
          )}
        </>
      )}

      {/* Bottom progress bar + nav */}
      {!isLoading && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 flex flex-col"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          {/* Progress bar */}
          <div className="relative h-1 w-full" style={{ background: "rgba(255,255,255,0.15)" }}>
            <div
              className="absolute left-0 top-0 h-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "#4285F4" }}
            />
          </div>
          {/* Controls row */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              onClick={goBack}
              disabled={currentIdx === 0}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors disabled:opacity-30"
              style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)" }}
            >
              <ChevronLeft size={13} /> Back
            </button>
            <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
              Drag to look · Click arrows to walk · {FRAMES.length} positions
            </span>
            <button
              onClick={goForward}
              disabled={currentIdx === FRAMES.length - 1}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors disabled:opacity-30"
              style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)" }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
