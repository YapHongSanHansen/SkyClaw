/**
 * VirtualTour — Google Street View-style immersive 360° tour.
 *
 * Uses a sphere with a NARROW FOV camera (75°). This is the same technique
 * Google Street View uses: the photo is mapped onto the inside of a sphere,
 * but the camera FOV is kept narrow so you only see the undistorted equatorial
 * band. The polar pinching only occurs at the very top/bottom of the sphere
 * which is never visible at this FOV. Drag to look around freely in 3D.
 *
 * Layout:
 *  - Full bright photo fills the viewport (sphere interior)
 *  - Top-left: Google Maps-style dark info card
 *  - Bottom-left: mini-map with orange pegman + blue dots
 *  - Top-right: fullscreen + close
 *  - Click anywhere to navigate to nearest viewpoint in that direction
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
  mapX: number;
  mapY: number;
  connects: number[];
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: 1, label: "Upper Landing",    sublabel: "2nd Floor · Cafe",    floor: "upper",  connects: [2],       url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-1_1c4e8fa8.jpeg", mapX: 75, mapY: 18 },
  { id: 2, label: "Staircase Mid",    sublabel: "Staircase · Cafe",    floor: "upper",  connects: [1, 3],    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-2_ac2cb743.jpeg", mapX: 65, mapY: 38 },
  { id: 3, label: "Seating Area",     sublabel: "Ground Floor · Cafe", floor: "ground", connects: [2, 4, 5], url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-3_e9de660f.jpeg", mapX: 55, mapY: 58 },
  { id: 4, label: "Window Side",      sublabel: "Ground Floor · Cafe", floor: "ground", connects: [3, 5],    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-4_bb2a7c9e.jpeg", mapX: 20, mapY: 53 },
  { id: 5, label: "Main Hall",        sublabel: "Ground Floor · Cafe", floor: "ground", connects: [3, 4, 6], url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-5_0e240249.jpeg", mapX: 40, mapY: 73 },
  { id: 6, label: "Bar Counter",      sublabel: "Ground Floor · Cafe", floor: "ground", connects: [5, 7],    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-6_0178eefa.jpeg", mapX: 30, mapY: 86 },
  { id: 7, label: "Spiral Staircase", sublabel: "Ground Floor · Cafe", floor: "ground", connects: [6],       url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-7_d5f67861.jpeg", mapX: 50, mapY: 90 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert lon/lat (degrees) to a look-at target on the sphere */
function lookTarget(lon: number, lat: number, r = 500): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Get the world direction of a screen click */
function clickDirection(
  clientX: number, clientY: number,
  container: HTMLElement,
  camera: THREE.PerspectiveCamera
): THREE.Vector3 {
  const rect = container.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  return ray.ray.direction.clone().normalize();
}

/** Find the best viewpoint to navigate to from a click direction */
function bestViewpoint(dir: THREE.Vector3, currentId: number): Viewpoint {
  const current = VIEWPOINTS.find(v => v.id === currentId)!;
  const clickBearing = Math.atan2(dir.x, -dir.z); // bearing in XZ plane

  let best: Viewpoint = current;
  let bestScore = Infinity;

  for (const vp of VIEWPOINTS) {
    if (vp.id === currentId) continue;
    const dx = vp.mapX - current.mapX;
    const dy = vp.mapY - current.mapY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    // Map Y increases downward, treat as -Z in world
    const vpBearing = Math.atan2(dx, -dy);
    let angDiff = Math.abs(clickBearing - vpBearing);
    if (angDiff > Math.PI) angDiff = 2 * Math.PI - angDiff;
    const score = angDiff * 2.5 + dist * 0.08;
    if (score < bestScore) { bestScore = score; best = vp; }
  }

  if (bestScore > Math.PI * 0.65) return current;
  return best;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface VirtualTourProps {
  initialId?: number;
  onClose?: () => void;
}

export default function VirtualTour({ initialId = 5, onClose }: VirtualTourProps) {
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
  const lastClickTime = useRef(0);

  // Crossfade
  const fadeProgress = useRef(0);
  const isFadingRef = useRef(false);

  const [currentId, setCurrentId] = useState(initialId);
  const currentIdRef = useRef(initialId);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [navHint, setNavHint] = useState<string | null>(null);

  const currentVP = VIEWPOINTS.find(v => v.id === currentId)!;

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

    // Narrow FOV (75°) = only the undistorted equatorial band is visible.
    // Polar pinching exists but is pushed far out of view.
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1, 1000
    );
    camera.position.set(0, 0, 0.01);
    cameraRef.current = camera;

    // Two spheres for crossfade — inverted so we see the inside
    const makeSphere = (opacity: number) => {
      const geo = new THREE.SphereGeometry(500, 128, 64);
      geo.scale(-1, 1, 1); // invert normals to see inside
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

      // Smooth camera pan
      lon.current += (targetLon.current - lon.current) * 0.1;
      lat.current += (targetLat.current - lat.current) * 0.1;
      lat.current = Math.max(-60, Math.min(60, lat.current));

      camera.lookAt(lookTarget(lon.current, lat.current));

      // Crossfade
      if (isFadingRef.current) {
        fadeProgress.current = Math.min(fadeProgress.current + 0.055, 1);
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

  // ── Load initial photo ───────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    const vp = VIEWPOINTS.find(v => v.id === initialId)!;
    new THREE.TextureLoader().load(vp.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = sphereARef.current!.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      setIsLoading(false);
    });
  }, []); // eslint-disable-line

  // ── Navigate ─────────────────────────────────────────────────────────────────
  const navigateTo = useCallback((id: number, dir?: THREE.Vector3) => {
    if (id === currentIdRef.current || isFadingRef.current) return;

    if (dir) {
      // Pan camera toward the click direction
      const newLon = THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z));
      const newLat = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dir.y))));
      targetLon.current = newLon;
      targetLat.current = Math.max(-30, Math.min(30, newLat));
    }

    const vp = VIEWPOINTS.find(v => v.id === id)!;
    setNavHint(vp.label);
    setTimeout(() => setNavHint(null), 1800);

    isFadingRef.current = true;
    fadeProgress.current = 0;
    currentIdRef.current = id;
    setCurrentId(id);

    new THREE.TextureLoader().load(vp.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const matB = sphereBRef.current!.material as THREE.MeshBasicMaterial;
      matB.map = tex;
      matB.needsUpdate = true;
    });
  }, []);

  // ── Handle click/tap ─────────────────────────────────────────────────────────
  const handleNavigationClick = useCallback((clientX: number, clientY: number) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || isFadingRef.current) return;

    const dir = clickDirection(clientX, clientY, container, camera);
    const target = bestViewpoint(dir, currentIdRef.current);

    if (target.id !== currentIdRef.current) {
      navigateTo(target.id, dir);
    } else {
      // Just pan toward click
      const newLon = THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z));
      const newLat = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dir.y))));
      targetLon.current = newLon;
      targetLat.current = Math.max(-50, Math.min(50, newLat));
    }
  }, [navigateTo]);

  // ── Mouse ────────────────────────────────────────────────────────────────────
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
    targetLon.current -= dx * 0.2;
    targetLat.current = Math.max(-60, Math.min(60, targetLat.current + dy * 0.15));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (dragDist.current < 6) {
      const now = Date.now();
      const cx = e.clientX, cy = e.clientY;
      if (now - lastClickTime.current < 400) {
        handleNavigationClick(cx, cy);
      } else {
        setTimeout(() => {
          if (Date.now() - lastClickTime.current >= 380) handleNavigationClick(cx, cy);
        }, 390);
      }
      lastClickTime.current = now;
    }
  };

  // ── Touch ────────────────────────────────────────────────────────────────────
  const lastTapRef = useRef(0);
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
    targetLon.current -= dx * 0.2;
    targetLat.current = Math.max(-60, Math.min(60, targetLat.current + dy * 0.15));
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    isDragging.current = false;
    if (dragDist.current < 12) {
      const t = e.changedTouches[0];
      const now = Date.now();
      if (now - lastTapRef.current < 400) {
        handleNavigationClick(t.clientX, t.clientY);
      } else {
        const cx = t.clientX, cy = t.clientY;
        setTimeout(() => {
          if (Date.now() - lastTapRef.current >= 380) handleNavigationClick(cx, cy);
        }, 390);
      }
      lastTapRef.current = now;
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
      style={{ background: "#000" }}
    >
      {/* Three.js canvas — full viewport */}
      <div
        ref={mountRef}
        className="w-full h-full select-none"
        style={{ cursor: isDragging.current ? "grabbing" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { isDragging.current = false; }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }}>
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
          onClick={() => setIsFullscreen(f => !f)}
          className="flex items-center justify-center rounded-full shadow-lg hover:bg-white/90 transition-colors"
          style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}
        >
          {isFullscreen ? <Minimize2 size={15} color="white" /> : <Maximize2 size={15} color="white" />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full shadow-lg hover:bg-white/90 transition-colors"
            style={{ width: 36, height: 36, background: "rgba(32,33,36,0.92)" }}
          >
            <X size={15} color="white" />
          </button>
        )}
      </div>

      {/* Navigation hint toast */}
      {navHint && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 rounded-full px-4 py-1.5 shadow-lg pointer-events-none"
          style={{ background: "rgba(32,33,36,0.92)", fontFamily: "sans-serif", fontSize: 12, color: "white", whiteSpace: "nowrap" }}
        >
          Moving to: {navHint}
        </div>
      )}

      {/* Bottom hint bar */}
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
