/**
 * VirtualTour — Fully immersive Google Maps Street View-style 3D tour.
 *
 * Navigation:
 *  - DRAG (single finger / mouse) → look around in 360°
 *  - DOUBLE-CLICK anywhere → detects the bearing you clicked, finds the nearest
 *    connected viewpoint in that direction, and navigates there automatically.
 *    This is the exact behaviour of Google Maps Street View.
 *  - CLICK on a hotspot arrow → also navigates (single click on the arrow itself)
 *  - Mini-map nodes → teleport to any viewpoint
 *
 * Hotspot design:
 *  - Flat ellipses on the "floor" of the sphere (low pitch, -25°) like Google Maps
 *  - White chevron arrow pointing toward the destination
 *  - Pulsing cyan glow ring
 *
 * Viewpoint graph (7 real cafe photos):
 *   1 (Upper landing) ↔ 2 (Staircase mid) ↔ 3 (Seating area)
 *   3 ↔ 4 (Window side) ↔ 5 (Main hall) ↔ 6 (Bar counter) ↔ 7 (Spiral staircase)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { X, Maximize2, Minimize2, Map, RotateCcw, Info, Navigation } from "lucide-react";

// ─── Viewpoint data ────────────────────────────────────────────────────────────

export interface Viewpoint {
  id: number;
  label: string;
  floor: "ground" | "upper";
  url: string;
  mapX: number;
  mapY: number;
  /** bearing = compass degrees (0 = forward/north in the pano), pitch = degrees up/down */
  connections: { to: number; bearing: number; pitch: number; label: string }[];
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 1,
    label: "Upper Floor — Staircase Landing",
    floor: "upper",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-1_1c4e8fa8.jpeg",
    mapX: 75, mapY: 20,
    connections: [
      { to: 2, bearing: 200, pitch: -25, label: "Go down stairs" },
    ],
  },
  {
    id: 2,
    label: "Staircase — Mid-Landing",
    floor: "upper",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-2_ac2cb743.jpeg",
    mapX: 65, mapY: 40,
    connections: [
      { to: 1, bearing: 20, pitch: -25, label: "Go up" },
      { to: 3, bearing: 200, pitch: -25, label: "Ground floor" },
    ],
  },
  {
    id: 3,
    label: "Ground Floor — Seating Area",
    floor: "ground",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-3_e9de660f.jpeg",
    mapX: 55, mapY: 60,
    connections: [
      { to: 2, bearing: 30, pitch: -25, label: "Stairs" },
      { to: 4, bearing: 270, pitch: -25, label: "Window side" },
      { to: 5, bearing: 180, pitch: -25, label: "Main hall" },
    ],
  },
  {
    id: 4,
    label: "Ground Floor — Window Side",
    floor: "ground",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-4_bb2a7c9e.jpeg",
    mapX: 20, mapY: 55,
    connections: [
      { to: 3, bearing: 90, pitch: -25, label: "Seating area" },
      { to: 5, bearing: 180, pitch: -25, label: "Main hall" },
    ],
  },
  {
    id: 5,
    label: "Main Hall — Full View",
    floor: "ground",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-5_0e240249.jpeg",
    mapX: 40, mapY: 75,
    connections: [
      { to: 3, bearing: 0, pitch: -25, label: "Seating area" },
      { to: 4, bearing: 90, pitch: -25, label: "Window side" },
      { to: 6, bearing: 200, pitch: -25, label: "Bar counter" },
    ],
  },
  {
    id: 6,
    label: "Bar Counter — Entrance Side",
    floor: "ground",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-6_0178eefa.jpeg",
    mapX: 30, mapY: 88,
    connections: [
      { to: 5, bearing: 20, pitch: -25, label: "Main hall" },
      { to: 7, bearing: 180, pitch: -25, label: "Spiral staircase" },
    ],
  },
  {
    id: 7,
    label: "Spiral Staircase — Street View",
    floor: "ground",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-7_d5f67861.jpeg",
    mapX: 50, mapY: 92,
    connections: [
      { to: 6, bearing: 0, pitch: -25, label: "Bar counter" },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert bearing (compass degrees) + pitch to a 3D point on the sphere. */
function bpToVec(bearing: number, pitch: number, r = 390): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(bearing);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Get the bearing (0-360) from the camera look direction. */
function cameraBearing(camera: THREE.PerspectiveCamera): number {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
  return (bearing + 360) % 360;
}

/** Angular difference between two bearings (-180 to 180). */
function bearingDiff(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

/** Given a click position (NDC) and the camera, compute the bearing the user clicked. */
function clickBearing(
  clientX: number, clientY: number,
  container: HTMLElement,
  camera: THREE.PerspectiveCamera
): number {
  const rect = container.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const dir = ray.ray.direction;
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
  return (bearing + 360) % 360;
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
  const sphereMeshRef = useRef<THREE.Mesh | null>(null);
  const hotspotGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Drag state
  const lon = useRef(0);
  const lat = useRef(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);
  const lastClickTime = useRef(0);

  const [currentId, setCurrentId] = useState(initialId);
  const [isLoading, setIsLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredHotspot, setHoveredHotspot] = useState<number | null>(null);
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
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(80, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.01);
    cameraRef.current = camera;

    // Panorama sphere (inverted so texture faces inward)
    const geo = new THREE.SphereGeometry(500, 64, 48);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    sphereMeshRef.current = mesh;

    // Hotspot group
    const hotspotGroup = new THREE.Group();
    scene.add(hotspotGroup);
    hotspotGroupRef.current = hotspotGroup;

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      lat.current = Math.max(-85, Math.min(85, lat.current));
      const phi = THREE.MathUtils.degToRad(90 - lat.current);
      const theta = THREE.MathUtils.degToRad(lon.current);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
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

  // ── Load panorama texture ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sphereMeshRef.current) return;
    setIsLoading(true);

    const loader = new THREE.TextureLoader();
    loader.load(
      currentVP.url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const mat = sphereMeshRef.current!.material as THREE.MeshBasicMaterial;
        mat.map = texture;
        mat.needsUpdate = true;
        setIsLoading(false);
        buildHotspots(currentVP);
      },
      undefined,
      () => setIsLoading(false)
    );
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build Google Maps-style ground hotspots ──────────────────────────────────
  const buildHotspots = useCallback((vp: Viewpoint) => {
    const group = hotspotGroupRef.current;
    if (!group) return;

    // Clear
    while (group.children.length) {
      const child = group.children[0] as THREE.Mesh;
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else (child.material as THREE.Material)?.dispose();
      group.remove(child);
    }

    vp.connections.forEach((conn) => {
      // Place hotspot at floor level (pitch = -25 so it appears on the ground)
      const pos = bpToVec(conn.bearing, conn.pitch, 390);

      // ── Outer glow ring ──
      const glowGeo = new THREE.TorusGeometry(18, 1.5, 8, 48);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff, transparent: true, opacity: 0.6, depthTest: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(pos);
      glow.lookAt(0, 0, 0);
      glow.userData = { type: "hotspot", toId: conn.to, label: conn.label };

      // ── Inner filled ellipse (flat on ground) ──
      const ellipseGeo = new THREE.CircleGeometry(14, 32);
      const ellipseMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff, transparent: true, opacity: 0.15,
        depthTest: false, side: THREE.DoubleSide,
      });
      const ellipse = new THREE.Mesh(ellipseGeo, ellipseMat);
      ellipse.position.copy(pos);
      ellipse.lookAt(0, 0, 0);
      ellipse.userData = { type: "hotspot", toId: conn.to, label: conn.label };

      // ── Chevron arrow (Google Maps style) ──
      // Two rectangles forming a ">" pointing toward the centre of the sphere
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });

      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 1), arrowMat.clone());
      leftWing.position.set(-3, 3, 0);
      leftWing.rotation.z = -Math.PI / 4;

      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 1), arrowMat.clone());
      rightWing.position.set(-3, -3, 0);
      rightWing.rotation.z = Math.PI / 4;

      const stem = new THREE.Mesh(new THREE.BoxGeometry(10, 2.5, 1), arrowMat.clone());
      stem.position.set(2, 0, 0);

      const chevron = new THREE.Group();
      chevron.add(leftWing, rightWing, stem);
      chevron.position.copy(pos);
      chevron.lookAt(0, 0, 0);
      chevron.userData = { type: "hotspot", toId: conn.to, label: conn.label };

      group.add(glow, ellipse, chevron);
    });
  }, []);

  // ── Hotspot pulse animation ──────────────────────────────────────────────────
  useEffect(() => {
    let frame: number;
    const pulse = () => {
      frame = requestAnimationFrame(pulse);
      const group = hotspotGroupRef.current;
      if (!group) return;
      const t = Date.now() * 0.0025;
      group.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.userData?.type === "hotspot") {
          const mat = child.material as THREE.MeshBasicMaterial;
          const isHovered = child.userData.toId === hoveredHotspot;
          if (child.geometry instanceof THREE.TorusGeometry) {
            mat.opacity = isHovered ? 1 : 0.4 + 0.35 * Math.sin(t);
            mat.color.setHex(isHovered ? 0xffffff : 0x00e5ff);
          }
          if (child.geometry instanceof THREE.CircleGeometry) {
            mat.opacity = isHovered ? 0.4 : 0.1 + 0.1 * Math.sin(t);
          }
        }
      });
    };
    pulse();
    return () => cancelAnimationFrame(frame);
  }, [hoveredHotspot]);

  // ── Raycasting ───────────────────────────────────────────────────────────────
  const getHotspotAt = useCallback((clientX: number, clientY: number): { toId: number; label: string } | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const group = hotspotGroupRef.current;
    if (!container || !camera || !group) return null;

    const rect = container.getBoundingClientRect();
    mouseRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const hits = raycasterRef.current.intersectObjects(group.children, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData?.type === "hotspot") return { toId: obj.userData.toId, label: obj.userData.label };
        obj = obj.parent;
      }
    }
    return null;
  }, []);

  // ── Navigate with fade ───────────────────────────────────────────────────────
  const navigateTo = useCallback((id: number) => {
    if (id === currentId || isFading) return;
    setIsFading(true);
    setTimeout(() => {
      setCurrentId(id);
      lon.current = 0;
      lat.current = 0;
      setIsFading(false);
    }, 300);
  }, [currentId, isFading]);

  // ── Double-click-to-navigate (core Google Maps behaviour) ────────────────────
  const handleDoubleClick = useCallback((clientX: number, clientY: number) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    // First check if they double-clicked directly on a hotspot
    const hotspot = getHotspotAt(clientX, clientY);
    if (hotspot) { navigateTo(hotspot.toId); return; }

    // Compute the bearing the user clicked
    const clickedBearing = clickBearing(clientX, clientY, container, camera);

    // Find the connected viewpoint whose bearing is closest to where the user clicked
    const vp = VIEWPOINTS.find((v) => v.id === currentId)!;
    let bestConn: typeof vp.connections[0] | null = null;
    let bestDiff = Infinity;

    for (const conn of vp.connections) {
      const diff = Math.abs(bearingDiff(conn.bearing, clickedBearing));
      if (diff < bestDiff) { bestDiff = diff; bestConn = conn; }
    }

    // Only navigate if the click is within 70° of a connection (prevents accidental nav)
    if (bestConn && bestDiff < 70) {
      setNavHint(`Moving to: ${bestConn.label}`);
      setTimeout(() => setNavHint(null), 1500);
      navigateTo(bestConn.to);
    } else if (vp.connections.length > 0) {
      // Show hint that there's no exit in that direction
      setNavHint("No exit in that direction — try the arrows");
      setTimeout(() => setNavHint(null), 1800);
    }
  }, [currentId, getHotspotAt, navigateTo]);

  // ── Mouse handlers ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const hit = getHotspotAt(e.clientX, e.clientY);
    setHoveredHotspot(hit ? hit.toId : null);
    (mountRef.current as HTMLElement).style.cursor =
      hit ? "pointer" : isDragging.current ? "grabbing" : "grab";

    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    dragDistance.current += Math.abs(dx) + Math.abs(dy);
    lon.current -= dx * 0.18;
    lat.current += dy * 0.18;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (dragDistance.current < 5) {
      const now = Date.now();
      const timeSinceLast = now - lastClickTime.current;
      lastClickTime.current = now;

      if (timeSinceLast < 350) {
        // Double-click detected
        handleDoubleClick(e.clientX, e.clientY);
      } else {
        // Single click — only navigate if directly on a hotspot
        const hit = getHotspotAt(e.clientX, e.clientY);
        if (hit) navigateTo(hit.toId);
      }
    }
  };

  // ── Touch handlers ───────────────────────────────────────────────────────────
  const lastTapTime = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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

      if (timeSinceLast < 350) {
        // Double-tap
        handleDoubleClick(t.clientX, t.clientY);
      } else {
        const hit = getHotspotAt(t.clientX, t.clientY);
        if (hit) navigateTo(hit.toId);
      }
    }
  };

  // ── Mini-map ─────────────────────────────────────────────────────────────────
  const MiniMap = () => (
    <div className="absolute bottom-14 right-3 z-30 w-44 bg-black/85 border border-cyan/20 rounded-lg overflow-hidden backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between px-2 py-1 border-b border-cyan/10">
        <span className="font-mono text-[9px] text-cyan/70 tracking-wider">FLOOR PLAN</span>
        <span className="font-mono text-[9px] text-white/40">{currentVP.floor === "upper" ? "▲ UPPER" : "● GROUND"}</span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-36 p-1">
        <rect x="5" y="5" width="90" height="90" rx="3" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="1" />
        <rect x="55" y="5" width="40" height="50" rx="2" fill="rgba(0,229,255,0.03)" stroke="rgba(0,229,255,0.08)" strokeWidth="0.5" />
        <text x="75" y="17" textAnchor="middle" fill="rgba(0,229,255,0.25)" fontSize="4" fontFamily="monospace">UPPER</text>
        <text x="30" y="95" textAnchor="middle" fill="rgba(0,229,255,0.25)" fontSize="4" fontFamily="monospace">GROUND</text>

        {VIEWPOINTS.map((vp) =>
          vp.connections.map((conn) => {
            const target = VIEWPOINTS.find((v) => v.id === conn.to);
            if (!target) return null;
            const isActive = vp.id === currentId || target.id === currentId;
            return (
              <line key={`${vp.id}-${conn.to}`}
                x1={vp.mapX} y1={vp.mapY} x2={target.mapX} y2={target.mapY}
                stroke={isActive ? "rgba(0,229,255,0.55)" : "rgba(0,229,255,0.12)"}
                strokeWidth={isActive ? "1.2" : "0.5"}
                strokeDasharray={isActive ? "none" : "2,2"}
              />
            );
          })
        )}

        {VIEWPOINTS.map((vp) => {
          const isCurrent = vp.id === currentId;
          const isNeighbour = currentVP.connections.some((c) => c.to === vp.id);
          return (
            <g key={vp.id} style={{ cursor: "pointer" }} onClick={() => navigateTo(vp.id)}>
              <circle cx={vp.mapX} cy={vp.mapY}
                r={isCurrent ? 5.5 : isNeighbour ? 3.5 : 2.5}
                fill={isCurrent ? "#00e5ff" : isNeighbour ? "rgba(0,229,255,0.55)" : "rgba(0,229,255,0.2)"}
                stroke={isCurrent ? "white" : "rgba(0,229,255,0.35)"}
                strokeWidth={isCurrent ? "1.5" : "0.5"}
              />
              {isCurrent && (
                <circle cx={vp.mapX} cy={vp.mapY} r="5" fill="none" stroke="rgba(0,229,255,0.4)" strokeWidth="0.8">
                  <animate attributeName="r" from="5" to="11" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              <text x={vp.mapX} y={vp.mapY - 7} textAnchor="middle"
                fill={isCurrent ? "white" : "rgba(255,255,255,0.35)"}
                fontSize="3.5" fontFamily="monospace">{vp.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );

  // ── Viewpoint list ───────────────────────────────────────────────────────────
  const ViewpointList = () => (
    <div className="absolute left-3 top-12 bottom-14 z-30 w-40 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      {VIEWPOINTS.map((vp) => {
        const isCurrent = vp.id === currentId;
        const isNeighbour = currentVP.connections.some((c) => c.to === vp.id);
        return (
          <button key={vp.id} onClick={() => navigateTo(vp.id)}
            className={`text-left px-2 py-1.5 rounded-md transition-all text-[10px] font-mono leading-tight ${
              isCurrent ? "bg-cyan/20 border border-cyan/40 text-cyan"
              : isNeighbour ? "bg-white/5 border border-white/10 text-white/70 hover:bg-cyan/10 hover:text-cyan"
              : "bg-black/40 border border-white/5 text-white/25 hover:text-white/60"
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
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { isDragging.current = false; setHoveredHotspot(null); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Fade overlay */}
      <div className="absolute inset-0 bg-black pointer-events-none z-20 transition-opacity duration-300"
        style={{ opacity: isFading ? 1 : 0 }} />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
            <span className="font-mono text-xs text-cyan/70 tracking-widest">LOADING VIEWPOINT...</span>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">
            VIRTUAL TOUR · {currentVP.label}
          </span>
          <span className="font-mono text-[9px] text-white/30 ml-1">
            {currentVP.floor === "upper" ? "▲ Upper" : "● Ground"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowInfo(!showInfo)}
            className={`p-1.5 rounded transition-colors ${showInfo ? "bg-cyan/20 text-cyan" : "bg-white/10 text-white/60 hover:text-white"}`}>
            <Info size={12} />
          </button>
          <button onClick={() => setShowMap(!showMap)}
            className={`p-1.5 rounded transition-colors ${showMap ? "bg-cyan/20 text-cyan" : "bg-white/10 text-white/60 hover:text-white"}`}>
            <Map size={12} />
          </button>
          <button onClick={() => { lon.current = 0; lat.current = 0; }}
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

      {/* Viewpoint list */}
      <ViewpointList />

      {/* Mini-map */}
      {showMap && <MiniMap />}

      {/* Hotspot hover tooltip */}
      {hoveredHotspot !== null && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-black/85 border border-cyan/30 rounded-full pointer-events-none">
          <span className="font-mono text-[10px] text-cyan tracking-wider">
            <Navigation size={10} className="inline mr-1.5 -mt-0.5" />
            {currentVP.connections.find((c) => c.to === hoveredHotspot)?.label ?? "Navigate"}
          </span>
        </div>
      )}

      {/* Double-click navigation hint */}
      {navHint && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 bg-black/90 border border-cyan/40 rounded-lg pointer-events-none">
          <span className="font-mono text-xs text-cyan tracking-wider">{navHint}</span>
        </div>
      )}

      {/* Info panel */}
      {showInfo && (
        <div className="absolute top-12 right-3 z-30 w-52 bg-black/90 border border-cyan/20 rounded-lg p-3 backdrop-blur-sm">
          <h3 className="font-mono text-[10px] text-cyan tracking-wider mb-2">VIEWPOINT INFO</h3>
          <p className="font-mono text-[10px] text-white/70 mb-1">#{currentVP.id} · {currentVP.label}</p>
          <p className="font-mono text-[9px] text-white/40 mb-2">{currentVP.floor === "upper" ? "Upper Floor" : "Ground Floor"}</p>
          <div className="border-t border-white/10 pt-2">
            <p className="font-mono text-[9px] text-white/50 mb-1">EXITS ({currentVP.connections.length})</p>
            {currentVP.connections.map((c) => (
              <button key={c.to} onClick={() => navigateTo(c.to)}
                className="block w-full text-left font-mono text-[9px] text-cyan/70 hover:text-cyan py-0.5 transition-colors">
                → {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom hint bar */}
      {!isLoading && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center py-2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
          <span className="font-mono text-[9px] text-white/30 tracking-widest">
            DRAG TO LOOK · DOUBLE-CLICK TO WALK · CLICK ARROWS TO NAVIGATE · {currentVP.connections.length} EXIT{currentVP.connections.length !== 1 ? "S" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
