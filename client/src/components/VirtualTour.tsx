/**
 * VirtualTour — Fully free-roam immersive 360° tour.
 *
 * How it works:
 *  - 7 real cafe panoramas are loaded as equirectangular textures on the inside of a sphere.
 *  - The user can look around freely by dragging.
 *  - Clicking (or double-clicking) ANYWHERE in the scene picks the exact bearing + pitch
 *    the user clicked, finds the panorama whose position is closest in that direction,
 *    and smoothly crossfades to it — giving the feel of walking freely through the space.
 *  - No fixed hotspot arrows. No snapping to pre-set stations. Click = walk there.
 *  - A subtle "walk cursor" (animated circle) shows where you'll move on hover.
 *  - Smooth camera pan animation eases the view toward the clicked direction.
 *  - Dual-sphere crossfade: the old panorama fades out while the new one fades in.
 *
 * Panorama graph (7 real cafe photos, spatially positioned):
 *   Positions are stored as (x, z) on a 2D floor plan so the "nearest in direction"
 *   logic can pick the most spatially appropriate panorama for any click bearing.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { X, Maximize2, Minimize2, Map, RotateCcw } from "lucide-react";

// ─── Panorama data ─────────────────────────────────────────────────────────────

export interface Viewpoint {
  id: number;
  label: string;
  floor: "ground" | "upper";
  url: string;
  /** 2D floor-plan position (arbitrary units, used for spatial direction logic) */
  pos: { x: number; z: number };
  /** Mini-map render position as % of SVG */
  mapX: number;
  mapY: number;
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: 1, label: "Upper Landing",        floor: "upper",  url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-1_1c4e8fa8.jpeg", pos: { x:  8, z: -8 }, mapX: 75, mapY: 20 },
  { id: 2, label: "Staircase Mid",        floor: "upper",  url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-2_ac2cb743.jpeg", pos: { x:  5, z: -4 }, mapX: 65, mapY: 40 },
  { id: 3, label: "Seating Area",         floor: "ground", url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-3_e9de660f.jpeg", pos: { x:  3, z:  0 }, mapX: 55, mapY: 60 },
  { id: 4, label: "Window Side",          floor: "ground", url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-4_bb2a7c9e.jpeg", pos: { x: -4, z:  1 }, mapX: 20, mapY: 55 },
  { id: 5, label: "Main Hall",            floor: "ground", url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-5_0e240249.jpeg", pos: { x:  0, z:  4 }, mapX: 40, mapY: 75 },
  { id: 6, label: "Bar Counter",          floor: "ground", url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-6_0178eefa.jpeg", pos: { x: -2, z:  7 }, mapX: 30, mapY: 88 },
  { id: 7, label: "Spiral Staircase",     floor: "ground", url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-7_d5f67861.jpeg", pos: { x:  2, z:  9 }, mapX: 50, mapY: 92 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert lon/lat (degrees) to a 3D look-at point on the sphere. */
function lonLatToTarget(lon: number, lat: number, r = 500): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Get the world-space direction the user clicked (as a unit vector). */
function getClickDirection(
  clientX: number, clientY: number,
  container: HTMLElement,
  camera: THREE.PerspectiveCamera
): THREE.Vector3 {
  const rect = container.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  return raycaster.ray.direction.clone().normalize();
}

/**
 * Given the direction the user clicked (world-space unit vector from camera origin),
 * find the panorama whose floor-plan position is most aligned with that direction.
 *
 * Strategy: project each viewpoint's 2D floor-plan offset from the current viewpoint
 * into a bearing, then find the one whose bearing is closest to the click bearing.
 * Prefer closer viewpoints when bearings are similar.
 */
function findBestViewpoint(
  clickDir: THREE.Vector3,
  currentId: number
): Viewpoint {
  const current = VIEWPOINTS.find((v) => v.id === currentId)!;

  // Click bearing in the XZ plane (ignoring vertical)
  const clickBearing = Math.atan2(clickDir.x, clickDir.z); // radians

  let best: Viewpoint = current;
  let bestScore = Infinity;

  for (const vp of VIEWPOINTS) {
    if (vp.id === currentId) continue;

    // Direction from current to candidate on floor plan
    const dx = vp.pos.x - current.pos.x;
    const dz = vp.pos.z - current.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) continue;

    const vpBearing = Math.atan2(dx, dz); // radians

    // Angular difference (0 = perfect alignment)
    let angDiff = Math.abs(clickBearing - vpBearing);
    if (angDiff > Math.PI) angDiff = 2 * Math.PI - angDiff;

    // Score: penalise angular mismatch heavily, lightly penalise distance
    const score = angDiff * 3 + dist * 0.1;
    if (score < bestScore) { bestScore = score; best = vp; }
  }

  // Only switch if the click is reasonably aligned (within ~100°)
  if (bestScore > Math.PI * 0.6) return current;
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
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereARef = useRef<THREE.Mesh | null>(null); // active sphere
  const sphereBRef = useRef<THREE.Mesh | null>(null); // fade-in sphere
  const animFrameRef = useRef<number>(0);

  // Camera look direction (lon = horizontal rotation, lat = vertical tilt)
  const lon = useRef(0);
  const lat = useRef(0);
  // Target lon/lat for smooth pan animation after click
  const targetLon = useRef(0);
  const targetLat = useRef(0);
  const isPanning = useRef(false);

  // Drag state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);
  const lastClickTime = useRef(0);

  // Crossfade state
  const fadeProgress = useRef(0); // 0 = fully A, 1 = fully B
  const isFadingRef = useRef(false);

  const [currentId, setCurrentId] = useState(initialId);
  const currentIdRef = useRef(initialId);
  const [isLoading, setIsLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [walkCursor, setWalkCursor] = useState<{ x: number; y: number } | null>(null);

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
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(80, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.01);
    cameraRef.current = camera;

    // Two spheres for crossfade: A (current) and B (incoming)
    const makeSphereMesh = (opacity: number) => {
      const geo = new THREE.SphereGeometry(500, 64, 48);
      geo.scale(-1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true, opacity,
      });
      return new THREE.Mesh(geo, mat);
    };

    const sphereA = makeSphereMesh(1);
    const sphereB = makeSphereMesh(0);
    scene.add(sphereA, sphereB);
    sphereARef.current = sphereA;
    sphereBRef.current = sphereB;

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Smooth pan toward target
      if (isPanning.current) {
        const dLon = targetLon.current - lon.current;
        const dLat = targetLat.current - lat.current;
        lon.current += dLon * 0.08;
        lat.current += dLat * 0.08;
        if (Math.abs(dLon) < 0.05 && Math.abs(dLat) < 0.05) {
          lon.current = targetLon.current;
          lat.current = targetLat.current;
          isPanning.current = false;
        }
      }

      // Crossfade animation
      if (isFadingRef.current) {
        fadeProgress.current = Math.min(fadeProgress.current + 0.04, 1);
        const matA = sphereARef.current!.material as THREE.MeshBasicMaterial;
        const matB = sphereBRef.current!.material as THREE.MeshBasicMaterial;
        matA.opacity = 1 - fadeProgress.current;
        matB.opacity = fadeProgress.current;
        if (fadeProgress.current >= 1) {
          // Swap: B becomes the new A
          const texB = matB.map;
          matA.map = texB;
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

      lat.current = Math.max(-85, Math.min(85, lat.current));
      const target = lonLatToTarget(lon.current, lat.current);
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load initial panorama ────────────────────────────────────────────────────
  useEffect(() => {
    const vp = VIEWPOINTS.find((v) => v.id === initialId)!;
    setIsLoading(true);
    new THREE.TextureLoader().load(vp.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = sphereARef.current!.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      setIsLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigate to a new viewpoint with crossfade ───────────────────────────────
  const navigateTo = useCallback((id: number, clickDir?: THREE.Vector3) => {
    if (id === currentIdRef.current || isFadingRef.current) return;

    // Pan camera gently toward the click direction
    if (clickDir) {
      const newLon = THREE.MathUtils.radToDeg(Math.atan2(clickDir.x, clickDir.z));
      const newLat = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, clickDir.y))));
      targetLon.current = newLon;
      targetLat.current = Math.max(-30, Math.min(30, newLat)); // keep mostly horizontal
      isPanning.current = true;
    }

    isFadingRef.current = true;
    fadeProgress.current = 0;
    setIsFading(true);
    currentIdRef.current = id;
    setCurrentId(id);

    // Load new texture into sphere B
    new THREE.TextureLoader().load(
      VIEWPOINTS.find((v) => v.id === id)!.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const matB = sphereBRef.current!.material as THREE.MeshBasicMaterial;
        matB.map = tex;
        matB.needsUpdate = true;
      }
    );
  }, []);

  // ── Handle click → free-roam navigation ─────────────────────────────────────
  const handleNavigationClick = useCallback((clientX: number, clientY: number) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || isFadingRef.current) return;

    const dir = getClickDirection(clientX, clientY, container, camera);
    const best = findBestViewpoint(dir, currentIdRef.current);

    if (best.id !== currentIdRef.current) {
      navigateTo(best.id, dir);
    } else {
      // Already at the best viewpoint — just pan the camera toward the click
      const newLon = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
      const newLat = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dir.y))));
      targetLon.current = newLon;
      targetLat.current = Math.max(-60, Math.min(60, newLat));
      isPanning.current = true;
    }
  }, [navigateTo]);

  // ── Mouse handlers ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    isPanning.current = false; // cancel any ongoing pan
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      dragDistance.current += Math.abs(dx) + Math.abs(dy);
      lon.current -= dx * 0.18;
      lat.current += dy * 0.18;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setWalkCursor(null);
    } else {
      // Show walk cursor on hover (not dragging)
      setWalkCursor({ x: e.clientX, y: e.clientY });
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (dragDistance.current < 6) {
      const now = Date.now();
      const timeSinceLast = now - lastClickTime.current;
      lastClickTime.current = now;

      if (timeSinceLast < 400) {
        // Double-click
        handleNavigationClick(e.clientX, e.clientY);
      } else {
        // Single click also navigates (like Google Maps)
        setTimeout(() => {
          if (Date.now() - lastClickTime.current >= 380) {
            handleNavigationClick(e.clientX, e.clientY);
          }
        }, 390);
      }
    }
  };

  // ── Touch handlers ───────────────────────────────────────────────────────────
  const lastTapTime = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isPanning.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - lastMouse.current.x;
    const dy = e.touches[0].clientY - lastMouse.current.y;
    dragDistance.current += Math.abs(dx) + Math.abs(dy);
    lon.current -= dx * 0.18;
    lat.current += dy * 0.18;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    isDragging.current = false;
    if (dragDistance.current < 12) {
      const t = e.changedTouches[0];
      const now = Date.now();
      const timeSinceLast = now - lastTapTime.current;
      lastTapTime.current = now;
      if (timeSinceLast < 400) {
        handleNavigationClick(t.clientX, t.clientY);
      } else {
        setTimeout(() => {
          if (Date.now() - lastTapTime.current >= 380) {
            handleNavigationClick(t.clientX, t.clientY);
          }
        }, 390);
      }
    }
  };

  // ── Mini-map ─────────────────────────────────────────────────────────────────
  const MiniMap = () => (
    <div className="absolute bottom-10 right-3 z-30 w-40 bg-black/85 border border-cyan/20 rounded-lg overflow-hidden backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between px-2 py-1 border-b border-cyan/10">
        <span className="font-mono text-[9px] text-cyan/70 tracking-wider">FLOOR PLAN</span>
        <span className="font-mono text-[9px] text-white/40">{currentVP.floor === "upper" ? "▲ UPPER" : "● GROUND"}</span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-32 p-1">
        <rect x="5" y="5" width="90" height="90" rx="3" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="1" />
        <rect x="55" y="5" width="40" height="50" rx="2" fill="rgba(0,229,255,0.03)" stroke="rgba(0,229,255,0.07)" strokeWidth="0.5" />
        <text x="75" y="16" textAnchor="middle" fill="rgba(0,229,255,0.2)" fontSize="4" fontFamily="monospace">UPPER</text>
        <text x="30" y="95" textAnchor="middle" fill="rgba(0,229,255,0.2)" fontSize="4" fontFamily="monospace">GROUND</text>

        {/* Connections */}
        {[[1,2],[2,3],[3,4],[3,5],[4,5],[5,6],[6,7]].map(([a, b]) => {
          const va = VIEWPOINTS.find(v => v.id === a)!;
          const vb = VIEWPOINTS.find(v => v.id === b)!;
          const isActive = currentId === a || currentId === b;
          return (
            <line key={`${a}-${b}`}
              x1={va.mapX} y1={va.mapY} x2={vb.mapX} y2={vb.mapY}
              stroke={isActive ? "rgba(0,229,255,0.5)" : "rgba(0,229,255,0.12)"}
              strokeWidth={isActive ? "1" : "0.5"}
            />
          );
        })}

        {VIEWPOINTS.map((vp) => {
          const isCurrent = vp.id === currentId;
          return (
            <g key={vp.id} style={{ cursor: "pointer" }} onClick={() => navigateTo(vp.id)}>
              <circle cx={vp.mapX} cy={vp.mapY}
                r={isCurrent ? 5 : 2.5}
                fill={isCurrent ? "#00e5ff" : "rgba(0,229,255,0.25)"}
                stroke={isCurrent ? "white" : "rgba(0,229,255,0.3)"}
                strokeWidth={isCurrent ? "1.2" : "0.4"}
              />
              {isCurrent && (
                <circle cx={vp.mapX} cy={vp.mapY} r="5" fill="none" stroke="rgba(0,229,255,0.4)" strokeWidth="0.7">
                  <animate attributeName="r" from="5" to="12" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.5" to="0" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              <text x={vp.mapX} y={vp.mapY - 7} textAnchor="middle"
                fill={isCurrent ? "white" : "rgba(255,255,255,0.3)"}
                fontSize="3.5" fontFamily="monospace">{vp.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );

  // ── Viewpoint list (left sidebar) ────────────────────────────────────────────
  const ViewpointList = () => (
    <div className="absolute left-3 top-12 bottom-10 z-30 w-36 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      {VIEWPOINTS.map((vp) => {
        const isCurrent = vp.id === currentId;
        return (
          <button key={vp.id} onClick={() => navigateTo(vp.id)}
            className={`text-left px-2 py-1.5 rounded-md transition-all text-[10px] font-mono leading-tight ${
              isCurrent
                ? "bg-cyan/20 border border-cyan/40 text-cyan"
                : "bg-black/40 border border-white/5 text-white/35 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <span className="block text-[8px] opacity-50 mb-0.5">
              {vp.floor === "upper" ? "▲ UPPER" : "● GROUND"} · #{vp.id}
            </span>
            {vp.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`relative bg-black overflow-hidden ${isFullscreen ? "fixed inset-0 z-50" : "w-full h-full rounded-lg"}`}>
      {/* Three.js canvas */}
      <div
        ref={mountRef}
        className="w-full h-full select-none"
        style={{ cursor: isDragging.current ? "grabbing" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { isDragging.current = false; setWalkCursor(null); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Walk cursor — shows where you'll move on hover */}
      {walkCursor && !isFading && (
        <div
          className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: walkCursor.x, top: walkCursor.y }}
        >
          <div className="w-8 h-8 rounded-full border-2 border-cyan/60 flex items-center justify-center animate-pulse">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan/80" />
          </div>
        </div>
      )}

      {/* Crossfade overlay */}
      {isFading && (
        <div className="absolute inset-0 pointer-events-none z-10" />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
            <span className="font-mono text-xs text-cyan/70 tracking-widest">LOADING TOUR...</span>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">
            FREE ROAM · {currentVP.label}
          </span>
          <span className="font-mono text-[9px] text-white/30 ml-1">
            {currentVP.floor === "upper" ? "▲ Upper" : "● Ground"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowMap(!showMap)}
            className={`p-1.5 rounded transition-colors ${showMap ? "bg-cyan/20 text-cyan" : "bg-white/10 text-white/60 hover:text-white"}`}>
            <Map size={12} />
          </button>
          <button onClick={() => { lon.current = 0; lat.current = 0; targetLon.current = 0; targetLat.current = 0; isPanning.current = false; }}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors" title="Reset view">
            <RotateCcw size={12} />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors">
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onClose && (
            <button onClick={onClose}
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Left: viewpoint list */}
      <ViewpointList />

      {/* Mini-map */}
      {showMap && <MiniMap />}

      {/* Bottom hint */}
      {!isLoading && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center py-2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
          <span className="font-mono text-[9px] text-white/30 tracking-widest">
            DRAG TO LOOK · CLICK ANYWHERE TO WALK THERE · {VIEWPOINTS.length} LOCATIONS
          </span>
        </div>
      )}
    </div>
  );
}
