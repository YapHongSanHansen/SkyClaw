/**
 * VirtualTour — Google Street View-style immersive tour.
 *
 * Uses a LARGE FLAT PLANE projection (not a sphere) so regular wide-angle
 * cafe photos display without polar distortion. The camera orbits around
 * the center looking at the plane — drag to pan, click to navigate.
 *
 * Layout matches Google Street View:
 *  - Full bright photo fills the viewport
 *  - Top-left: dark info card (location name + floor)
 *  - Bottom-left: mini-map with orange pegman + blue dots
 *  - Top-right: fullscreen + close
 *  - Click to walk toward that direction
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { X, Maximize2, Minimize2, ChevronLeft, ArrowUp } from "lucide-react";

// ─── Viewpoint data ────────────────────────────────────────────────────────────

export interface Viewpoint {
  id: number;
  label: string;
  sublabel: string;
  floor: "ground" | "upper";
  url: string;
  /** Logical 2D position for mini-map */
  mapX: number;
  mapY: number;
  connects: number[];
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: 1, label: "Upper Landing",    sublabel: "2nd Floor · Cafe",    floor: "upper",  connects: [2],         url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-1_1c4e8fa8.jpeg", mapX: 75, mapY: 18 },
  { id: 2, label: "Staircase Mid",    sublabel: "Staircase · Cafe",    floor: "upper",  connects: [1, 3],      url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-2_ac2cb743.jpeg", mapX: 65, mapY: 38 },
  { id: 3, label: "Seating Area",     sublabel: "Ground Floor · Cafe", floor: "ground", connects: [2, 4, 5],   url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-3_e9de660f.jpeg", mapX: 55, mapY: 58 },
  { id: 4, label: "Window Side",      sublabel: "Ground Floor · Cafe", floor: "ground", connects: [3, 5],      url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-4_bb2a7c9e.jpeg", mapX: 20, mapY: 53 },
  { id: 5, label: "Main Hall",        sublabel: "Ground Floor · Cafe", floor: "ground", connects: [3, 4, 6],   url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-5_0e240249.jpeg", mapX: 40, mapY: 73 },
  { id: 6, label: "Bar Counter",      sublabel: "Ground Floor · Cafe", floor: "ground", connects: [5, 7],      url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-6_0178eefa.jpeg", mapX: 30, mapY: 86 },
  { id: 7, label: "Spiral Staircase", sublabel: "Ground Floor · Cafe", floor: "ground", connects: [6],         url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-7_d5f67861.jpeg", mapX: 50, mapY: 90 },
];

// ─── Component ─────────────────────────────────────────────────────────────────

interface VirtualTourProps {
  initialId?: number;
  onClose?: () => void;
}

export default function VirtualTour({ initialId = 5, onClose }: VirtualTourProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const planeARef = useRef<THREE.Mesh | null>(null);
  const planeBRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);

  // Camera orbit state (azimuth = left/right, elevation = up/down)
  const azimuth = useRef(0);       // degrees, horizontal pan
  const elevation = useRef(0);     // degrees, vertical tilt
  const targetAz = useRef(0);
  const targetEl = useRef(0);

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragDist = useRef(0);
  const lastClickTime = useRef(0);

  // Fade
  const fadeProgress = useRef(0);
  const isFadingRef = useRef(false);

  const [currentId, setCurrentId] = useState(initialId);
  const currentIdRef = useRef(initialId);
  const [isLoading, setIsLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [navHint, setNavHint] = useState<string | null>(null);

  const currentVP = VIEWPOINTS.find((v) => v.id === currentId)!;

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
    scene.background = new THREE.Color(0x111111);

    // Camera sits at origin, looks at a large plane in front
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Two large planes for crossfade — positioned far in front of camera
    const PLANE_DIST = 100;
    const PLANE_W = 240;  // wide enough to fill FOV when panning
    const PLANE_H = 135;  // 16:9 aspect

    const makePane = (opacity: number) => {
      const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, -PLANE_DIST);
      return mesh;
    };

    const planeA = makePane(1);
    const planeB = makePane(0);
    scene.add(planeA, planeB);
    planeARef.current = planeA;
    planeBRef.current = planeB;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Smooth pan
      azimuth.current += (targetAz.current - azimuth.current) * 0.1;
      elevation.current += (targetEl.current - elevation.current) * 0.1;

      // Clamp elevation
      elevation.current = Math.max(-35, Math.min(35, elevation.current));
      targetEl.current = Math.max(-35, Math.min(35, targetEl.current));

      // Rotate the planes around camera (simulates camera rotation without sphere distortion)
      const azRad = THREE.MathUtils.degToRad(azimuth.current);
      const elRad = THREE.MathUtils.degToRad(elevation.current);
      const DIST = PLANE_DIST;

      // Plane center follows camera look direction
      const x = -Math.sin(azRad) * Math.cos(elRad) * DIST;
      const y = Math.sin(elRad) * DIST;
      const z = -Math.cos(azRad) * Math.cos(elRad) * DIST;

      planeA.position.set(x, y, z);
      planeB.position.set(x, y, z);
      planeA.lookAt(camera.position);
      planeB.lookAt(camera.position);

      // Fade
      if (isFadingRef.current) {
        fadeProgress.current = Math.min(fadeProgress.current + 0.06, 1);
        const matA = planeARef.current!.material as THREE.MeshBasicMaterial;
        const matB = planeBRef.current!.material as THREE.MeshBasicMaterial;
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
          setIsFading(false);
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

  // ── Load initial photo ───────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    const vp = VIEWPOINTS.find(v => v.id === initialId)!;
    new THREE.TextureLoader().load(vp.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // Fit texture to plane preserving aspect ratio
      const mat = planeARef.current!.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      setIsLoading(false);
    });
  }, []); // eslint-disable-line

  // ── Navigate to viewpoint ────────────────────────────────────────────────────
  const navigateTo = useCallback((id: number, panToAz?: number) => {
    if (id === currentIdRef.current || isFadingRef.current) return;

    if (panToAz !== undefined) {
      targetAz.current = panToAz;
    }

    const vp = VIEWPOINTS.find(v => v.id === id)!;
    setNavHint(vp.label);
    setTimeout(() => setNavHint(null), 1800);

    isFadingRef.current = true;
    fadeProgress.current = 0;
    setIsFading(true);
    currentIdRef.current = id;
    setCurrentId(id);

    new THREE.TextureLoader().load(vp.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const matB = planeBRef.current!.material as THREE.MeshBasicMaterial;
      matB.map = tex;
      matB.needsUpdate = true;
    });
  }, []);

  // ── Click: find best viewpoint from click position ───────────────────────────
  const handleClick = useCallback((clientX: number, clientY: number) => {
    if (isFadingRef.current) return;
    const container = mountRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // NDC: -1 to +1
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    // ndcY not used for azimuth but kept for future elevation-based logic

    // Convert horizontal click position to a world azimuth offset
    const clickAzOffset = ndcX * 30; // ±30° from center based on click position
    const clickAz = azimuth.current + clickAzOffset;

    // Find the viewpoint whose map position best matches the click direction
    const current = VIEWPOINTS.find(v => v.id === currentIdRef.current)!;
    let best: Viewpoint | null = null;
    let bestScore = Infinity;

    for (const vp of VIEWPOINTS) {
      if (vp.id === currentIdRef.current) continue;
      // Use map positions to estimate bearing
      const dx = vp.mapX - current.mapX;
      const dy = vp.mapY - current.mapY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      // Map bearing (in degrees, 0 = right, 90 = down in map coords)
      const mapBearing = Math.atan2(dy, dx) * (180 / Math.PI);
      // Compare to click azimuth (normalise to same range)
      let diff = Math.abs(clickAz - mapBearing);
      if (diff > 180) diff = 360 - diff;
      const score = diff + dist * 0.3;
      if (score < bestScore) { bestScore = score; best = vp; }
    }

    if (best && bestScore < 120) {
      navigateTo(best.id, clickAzOffset);
    } else {
      // Just pan camera toward click
      targetAz.current += ndcX * 25;
    }
  }, [navigateTo]);

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
    targetAz.current -= dx * 0.15;
    targetEl.current += dy * 0.12;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (dragDist.current < 6) {
      const now = Date.now();
      if (now - lastClickTime.current < 400) {
        handleClick(e.clientX, e.clientY);
      } else {
        const cx = e.clientX, cy = e.clientY;
        setTimeout(() => {
          if (Date.now() - lastClickTime.current >= 380) handleClick(cx, cy);
        }, 390);
      }
      lastClickTime.current = now;
    }
  };

  // ── Touch events ─────────────────────────────────────────────────────────────
  const lastTapTime = useRef(0);
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
    targetAz.current -= dx * 0.15;
    targetEl.current += dy * 0.12;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    isDragging.current = false;
    if (dragDist.current < 12) {
      const t = e.changedTouches[0];
      const now = Date.now();
      if (now - lastTapTime.current < 400) {
        handleClick(t.clientX, t.clientY);
      } else {
        const cx = t.clientX, cy = t.clientY;
        setTimeout(() => {
          if (Date.now() - lastTapTime.current >= 380) handleClick(cx, cy);
        }, 390);
      }
      lastTapTime.current = now;
    }
  };

  // ── Mini-map ─────────────────────────────────────────────────────────────────
  const MiniMap = () => (
    <div
      className="absolute bottom-4 left-4 z-30 rounded-lg overflow-hidden shadow-xl"
      style={{ width: 160, height: 120, border: "2px solid rgba(255,255,255,0.25)", background: "#e8e0d8" }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect x="0" y="0" width="100" height="100" fill="#e8e0d8" />
        <rect x="8" y="40" width="84" height="55" rx="2" fill="#d4ccc4" stroke="#bbb5ae" strokeWidth="1" />
        <rect x="50" y="8" width="42" height="38" rx="2" fill="#ddd7cf" stroke="#bbb5ae" strokeWidth="1" />
        <text x="30" y="92" textAnchor="middle" fill="#888" fontSize="5" fontFamily="sans-serif">Ground</text>
        <text x="71" y="20" textAnchor="middle" fill="#888" fontSize="5" fontFamily="sans-serif">Upper</text>
        {([[1,2],[2,3],[3,4],[3,5],[4,5],[5,6],[6,7]] as [number,number][]).map(([a, b]) => {
          const va = VIEWPOINTS.find(v => v.id === a)!;
          const vb = VIEWPOINTS.find(v => v.id === b)!;
          return <line key={`${a}-${b}`} x1={va.mapX} y1={va.mapY} x2={vb.mapX} y2={vb.mapY} stroke="#aaa" strokeWidth="0.8" strokeDasharray="2,2" />;
        })}
        {VIEWPOINTS.map((vp) => {
          const isCurrent = vp.id === currentId;
          return (
            <g key={vp.id} style={{ cursor: "pointer" }} onClick={() => navigateTo(vp.id)}>
              <circle cx={vp.mapX} cy={vp.mapY} r="7" fill="transparent" />
              {isCurrent ? (
                <>
                  <circle cx={vp.mapX} cy={vp.mapY} r="5" fill="#FF6D00" stroke="white" strokeWidth="1.5" />
                  <circle cx={vp.mapX} cy={vp.mapY} r="2" fill="white" />
                </>
              ) : (
                <circle cx={vp.mapX} cy={vp.mapY} r="3" fill="#4285F4" stroke="white" strokeWidth="1" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 text-center" style={{ background: "rgba(0,0,0,0.35)", padding: "1px 0" }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.7)", fontFamily: "sans-serif" }}>Click dot to jump</span>
      </div>
    </div>
  );

  return (
    <div
      className={`relative overflow-hidden ${isFullscreen ? "fixed inset-0 z-50" : "w-full h-full rounded-lg"}`}
      style={{ background: "#111" }}
    >
      {/* Three.js canvas */}
      <div
        ref={mountRef}
        className="w-full h-full select-none"
        style={{ cursor: isDragging.current ? "grabbing" : "default" }}
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
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)" }}>
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
          style={{ background: "rgba(32,33,36,0.95)", minWidth: 200, maxWidth: 280 }}
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
                {currentVP.label}
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
                {currentVP.sublabel}
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
              {currentVP.floor === "upper" ? "2F" : "1F"}
            </span>
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5">
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="flex items-center justify-center rounded-full shadow-lg transition-colors hover:bg-white/90"
          style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}
        >
          {isFullscreen ? <Minimize2 size={15} color="white" /> : <Maximize2 size={15} color="white" />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full shadow-lg transition-colors hover:bg-white/90"
            style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}
          >
            <X size={15} color="white" />
          </button>
        )}
      </div>

      {/* Navigation hint */}
      {navHint && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 rounded-full px-4 py-1.5 shadow-lg pointer-events-none"
          style={{ background: "rgba(32,33,36,0.92)", fontFamily: "sans-serif", fontSize: 12, color: "white", whiteSpace: "nowrap" }}
        >
          Moving to: {navHint}
        </div>
      )}

      {/* Bottom hint */}
      {!isLoading && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center py-1.5 pointer-events-none"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>
            Drag to look · Click to walk · {VIEWPOINTS.length} locations
          </span>
        </div>
      )}

      {/* Mini-map */}
      {!isLoading && <MiniMap />}
    </div>
  );
}
