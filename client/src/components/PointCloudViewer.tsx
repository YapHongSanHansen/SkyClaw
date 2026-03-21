/**
 * PointCloudViewer - Three.js based 3D point cloud renderer
 * Design: Mission Control / Aerospace Command Center
 * Features:
 *  - Simulated room point cloud with orbit controls
 *  - Animated 3D drone (BRIGHT WHITE for stage visibility) that flies along waypoints during scan
 *  - Drone parks in corner after scan completes, hovering/scanning
 *  - "DRONE POV" toggle with full mouse orbit controls to look around inside the point cloud
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Video, Eye, RotateCcw, Move } from "lucide-react";

interface PointCloudViewerProps {
  className?: string;
  isScanning?: boolean;
  scanProgress?: number;
}

// ── Room dimensions ───────────────────────────────────────────────────────────
const ROOM_W = 6, ROOM_H = 3, ROOM_D = 5;

// ── Drone flight waypoints (a scanning pattern through the room) ──────────────
const DRONE_WAYPOINTS: THREE.Vector3[] = [
  new THREE.Vector3(0, 2.2, 2.2),
  new THREE.Vector3(-2, 2.0, 1.5),
  new THREE.Vector3(-2.5, 1.8, 0),
  new THREE.Vector3(-2, 2.0, -1.5),
  new THREE.Vector3(0, 2.2, -2),
  new THREE.Vector3(2, 2.0, -1.5),
  new THREE.Vector3(2.5, 1.8, 0),
  new THREE.Vector3(2, 2.0, 1.5),
  new THREE.Vector3(0, 2.5, 0),
  new THREE.Vector3(1, 1.2, 0.8),
  new THREE.Vector3(-0.5, 1.2, 1.8),
  new THREE.Vector3(0, 2.0, 0),
  new THREE.Vector3(-1.5, 2.4, -1),
  new THREE.Vector3(1.5, 2.4, 1),
  new THREE.Vector3(0, 2.2, 0),
  new THREE.Vector3(2.5, 2.6, -2.2),
];

// ── Park position (where drone hovers after scan) ─────────────────────────────
const PARK_POS = new THREE.Vector3(2.5, 2.6, -2.2);

function generateRoomPointCloud(density: number = 15000): Float32Array {
  const points: number[] = [];
  for (let i = 0; i < density * 0.2; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, 0, (Math.random() - 0.5) * ROOM_D);
  }
  for (let i = 0; i < density * 0.15; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, ROOM_H, (Math.random() - 0.5) * ROOM_D);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push(-ROOM_W / 2, Math.random() * ROOM_H, (Math.random() - 0.5) * ROOM_D);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push(ROOM_W / 2, Math.random() * ROOM_H, (Math.random() - 0.5) * ROOM_D);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, Math.random() * ROOM_H, -ROOM_D / 2);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, Math.random() * ROOM_H, ROOM_D / 2);
  }
  for (let i = 0; i < density * 0.08; i++) {
    points.push(-1.5 + Math.random() * 2, Math.random() * 0.8, 1.5 + Math.random() * 0.8);
  }
  for (let i = 0; i < density * 0.05; i++) {
    points.push(0.5 + Math.random() * 1.2, 0.7 + Math.random() * 0.05, 0.5 + Math.random() * 0.8);
  }
  for (let leg = 0; leg < 4; leg++) {
    const lx = leg < 2 ? 0.55 : 1.65;
    const lz = leg % 2 === 0 ? 0.55 : 1.25;
    for (let i = 0; i < density * 0.005; i++) {
      points.push(lx + (Math.random() - 0.5) * 0.05, Math.random() * 0.7, lz + (Math.random() - 0.5) * 0.05);
    }
  }
  for (let i = 0; i < density * 0.06; i++) {
    points.push(2.2 + Math.random() * 0.4, Math.random() * 2, -2 + Math.random() * 1);
  }
  for (let i = 0; i < density * 0.02; i++) {
    points.push(
      (Math.random() - 0.5) * ROOM_W * 1.1,
      Math.random() * ROOM_H * 1.1,
      (Math.random() - 0.5) * ROOM_D * 1.1
    );
  }
  return new Float32Array(points);
}

function generateColors(positions: Float32Array): Float32Array {
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const t = y / 3;
    colors[i] = 0.0 + t * 0.1;
    colors[i + 1] = 0.7 + t * 0.15;
    colors[i + 2] = 0.9 + t * 0.1;
  }
  return colors;
}

// ── Build a BRIGHT WHITE drone mesh for stage visibility ─────────────────────
function createDroneMesh(): THREE.Group {
  const drone = new THREE.Group();

  // Body — BRIGHT WHITE with glow
  const bodyGeo = new THREE.BoxGeometry(0.28, 0.10, 0.18);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
    metalness: 0.1,
    roughness: 0.3,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  drone.add(body);

  // Camera lens on front — bright cyan
  const lensGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x00d4ff,
    emissive: 0x00d4ff,
    emissiveIntensity: 1.0,
  });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(0.15, -0.01, 0);
  drone.add(lens);

  // Arms + rotors — WHITE arms, bright white spinning rotors
  const armPositions = [
    { x: 0.22, z: 0.15 },
    { x: 0.22, z: -0.15 },
    { x: -0.22, z: 0.15 },
    { x: -0.22, z: -0.15 },
  ];

  const armMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.3,
    metalness: 0.2,
    roughness: 0.4,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.7,
  });

  armPositions.forEach(({ x, z }) => {
    // Arm — thicker for visibility
    const armGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x * 0.5, 0.02, z);
    drone.add(arm);

    // Rotor disc — larger for visibility
    const rotorGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.006, 16);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(x, 0.07, z);
    rotor.userData.isRotor = true;
    drone.add(rotor);

    // Rotor glow ring
    const ringGeo = new THREE.RingGeometry(0.09, 0.11, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, 0.075, z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData.isRotor = true;
    drone.add(ring);
  });

  // LED lights — brighter and bigger
  const ledGeo = new THREE.SphereGeometry(0.02, 8, 8);
  const ledFront = new THREE.Mesh(
    ledGeo,
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2 })
  );
  ledFront.position.set(0.12, -0.06, 0);
  drone.add(ledFront);

  const ledBack = new THREE.Mesh(
    ledGeo,
    new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 })
  );
  ledBack.position.set(-0.12, -0.06, 0);
  drone.add(ledBack);

  // Side LEDs — white for extra visibility
  const ledSide1 = new THREE.Mesh(
    ledGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
  );
  ledSide1.position.set(0, -0.06, 0.08);
  drone.add(ledSide1);

  const ledSide2 = new THREE.Mesh(
    ledGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
  );
  ledSide2.position.set(0, -0.06, -0.08);
  drone.add(ledSide2);

  // Scan beam (visible cone of light pointing down) — brighter
  const beamGeo = new THREE.ConeGeometry(0.35, 1.0, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, -0.55, 0);
  beam.userData.isBeam = true;
  drone.add(beam);

  // Point light on drone so it illuminates nearby points
  const droneLight = new THREE.PointLight(0xffffff, 2, 3);
  droneLight.position.set(0, 0, 0);
  drone.add(droneLight);

  // Scale up the entire drone for better visibility
  drone.scale.setScalar(1.5);

  return drone;
}

// ── Interpolate drone position along waypoints based on progress (0–100) ──────
function getDronePosition(progress: number): THREE.Vector3 {
  const totalWaypoints = DRONE_WAYPOINTS.length;
  const t = (progress / 100) * (totalWaypoints - 1);
  const idx = Math.floor(t);
  const frac = t - idx;
  if (idx >= totalWaypoints - 1) return DRONE_WAYPOINTS[totalWaypoints - 1].clone();
  const a = DRONE_WAYPOINTS[idx];
  const b = DRONE_WAYPOINTS[idx + 1];
  return new THREE.Vector3().lerpVectors(a, b, frac);
}

// ── Get drone look direction (towards next waypoint) ──────────────────────────
function getDroneLookTarget(progress: number): THREE.Vector3 {
  const totalWaypoints = DRONE_WAYPOINTS.length;
  const t = (progress / 100) * (totalWaypoints - 1);
  const idx = Math.min(Math.floor(t) + 1, totalWaypoints - 1);
  return DRONE_WAYPOINTS[idx].clone();
}

export default function PointCloudViewer({ className = "", isScanning = false, scanProgress = 100 }: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const droneRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false, prevX: 0, prevY: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const scanProgressRef = useRef(scanProgress);
  const isScanningRef = useRef(isScanning);
  const dronePovRef = useRef(false);
  // POV camera orbit angles (yaw/pitch) — user can drag to look around
  const povOrbitRef = useRef({ yaw: 0, pitch: 0 });
  const povZoomRef = useRef(90); // FOV for POV mode
  const [loaded, setLoaded] = useState(false);
  const [dronePov, setDronePov] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  // Keep refs in sync
  useEffect(() => { scanProgressRef.current = scanProgress; }, [scanProgress]);
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);
  useEffect(() => { dronePovRef.current = dronePov; }, [dronePov]);
  useEffect(() => {
    if (!isScanning && scanProgress >= 100) setScanDone(true);
    if (isScanning) setScanDone(false);
  }, [isScanning, scanProgress]);

  const toggleDronePov = useCallback(() => {
    setDronePov((prev) => {
      if (!prev) {
        // Reset POV orbit when entering POV mode
        povOrbitRef.current = { yaw: 0, pitch: 0 };
        povZoomRef.current = 90;
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting for the drone — brighter
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(3, 5, 3);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-3, 3, -3);
    scene.add(dirLight2);

    // Generate point cloud
    const positions = generateRoomPointCloud(20000);
    const colors = generateColors(positions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.03, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;

    // Grid helper
    const grid = new THREE.GridHelper(10, 20, 0x00d4ff, 0x0a1a2e);
    (grid.material as THREE.Material).opacity = 0.15;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Create drone
    const drone = createDroneMesh();
    drone.position.copy(DRONE_WAYPOINTS[0]);
    scene.add(drone);
    droneRef.current = drone;

    setLoaded(true);

    // Mouse controls — handle both orbit view and POV mode
    const onMouseDown = (e: MouseEvent) => {
      mouseRef.current.isDown = true;
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };
    const onMouseUp = () => { mouseRef.current.isDown = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.isDown) return;
      const dx = e.clientX - mouseRef.current.prevX;
      const dy = e.clientY - mouseRef.current.prevY;

      if (dronePovRef.current) {
        // POV mode: drag to look around
        povOrbitRef.current.yaw += dx * 0.005;
        povOrbitRef.current.pitch -= dy * 0.005;
        // Clamp pitch to prevent flipping
        povOrbitRef.current.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, povOrbitRef.current.pitch));
      } else {
        // Normal orbit mode
        rotationRef.current.y += dx * 0.005;
        rotationRef.current.x += dy * 0.005;
        rotationRef.current.x = Math.max(-1, Math.min(1, rotationRef.current.x));
      }

      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };

    // Scroll to zoom in POV mode
    const onWheel = (e: WheelEvent) => {
      if (dronePovRef.current) {
        e.preventDefault();
        povZoomRef.current += e.deltaY * 0.05;
        povZoomRef.current = Math.max(30, Math.min(120, povZoomRef.current));
      }
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    container.addEventListener("wheel", onWheel, { passive: false });

    // Touch controls for mobile
    let lastTouchX = 0, lastTouchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        mouseRef.current.isDown = true;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && mouseRef.current.isDown) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        if (dronePovRef.current) {
          povOrbitRef.current.yaw += dx * 0.005;
          povOrbitRef.current.pitch -= dy * 0.005;
          povOrbitRef.current.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, povOrbitRef.current.pitch));
        } else {
          rotationRef.current.y += dx * 0.005;
          rotationRef.current.x += dy * 0.005;
          rotationRef.current.x = Math.max(-1, Math.min(1, rotationRef.current.x));
        }
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    };
    const onTouchEnd = () => { mouseRef.current.isDown = false; };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd);

    // Animation loop
    let time = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      time += 0.016;

      const droneGroup = droneRef.current;
      const progress = scanProgressRef.current;
      const scanning = isScanningRef.current;
      const isPov = dronePovRef.current;

      // ── Update drone position ───────────────────────────────────────────
      if (droneGroup) {
        let targetPos: THREE.Vector3;
        let lookTarget: THREE.Vector3;

        if (scanning) {
          targetPos = getDronePosition(progress);
          lookTarget = getDroneLookTarget(progress);
        } else {
          targetPos = PARK_POS.clone();
          targetPos.y += Math.sin(time * 2) * 0.05;
          lookTarget = new THREE.Vector3(0, 1.5, 0);
        }

        // Smooth interpolation
        droneGroup.position.lerp(targetPos, 0.08);

        // Face the direction of travel
        const dir = lookTarget.clone().sub(droneGroup.position).normalize();
        const targetQuat = new THREE.Quaternion();
        const lookMat = new THREE.Matrix4().lookAt(droneGroup.position, lookTarget, new THREE.Vector3(0, 1, 0));
        targetQuat.setFromRotationMatrix(lookMat);
        droneGroup.quaternion.slerp(targetQuat, 0.05);

        // Tilt drone slightly in direction of movement
        if (scanning) {
          droneGroup.rotation.z = Math.sin(time * 3) * 0.08;
          droneGroup.rotation.x = -0.1;
        } else {
          droneGroup.rotation.z = Math.sin(time * 1.5) * 0.03;
          droneGroup.rotation.x = 0;
        }

        // Spin rotors + pulse beam
        droneGroup.children.forEach((child) => {
          if (child.userData.isRotor) {
            child.rotation.y += scanning ? 0.8 : 0.3;
          }
          if (child.userData.isBeam) {
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
            mat.opacity = scanning ? 0.1 + Math.sin(time * 4) * 0.05 : 0.04;
          }
        });
      }

      // ── Hide drone in POV mode so it doesn't block the CCTV view ─────
      if (droneGroup) {
        droneGroup.visible = !isPov;
      }

      // ── Camera ──────────────────────────────────────────────────────────
      if (isPov && droneGroup) {
        // CCTV-style POV: elevated corner position looking down at the room
        // Camera sits at a high corner like a security camera
        const cctvPos = new THREE.Vector3(ROOM_W / 2 - 0.3, ROOM_H - 0.2, -ROOM_D / 2 + 0.3);
        camera.position.copy(cctvPos);

        // User can orbit the look target with drag
        const yaw = povOrbitRef.current.yaw;
        const pitch = povOrbitRef.current.pitch;

        // Base look direction: towards room center and slightly down
        const baseLookTarget = new THREE.Vector3(0, 0.5, 0);
        // Apply user's yaw/pitch offset to the look target
        const offset = new THREE.Vector3(
          Math.sin(yaw) * 4,
          Math.sin(pitch) * 3,
          Math.cos(yaw) * 4
        );
        const lookTarget = baseLookTarget.clone().add(offset);

        camera.lookAt(lookTarget);
        camera.fov = povZoomRef.current;
        camera.updateProjectionMatrix();
      } else {
        // Normal orbit camera
        if (!mouseRef.current.isDown) {
          rotationRef.current.y += 0.002;
        }
        const radius = 7;
        camera.position.x = Math.sin(rotationRef.current.y) * radius;
        camera.position.z = Math.cos(rotationRef.current.y) * radius;
        camera.position.y = 2 + rotationRef.current.x * 3;
        camera.lookAt(0, 1.5, 0);
        camera.fov = 60;
        camera.updateProjectionMatrix();
      }

      // ── Scanning effect: reveal points progressively ────────────────────
      if (scanning && pointsRef.current) {
        const geo = pointsRef.current.geometry;
        const pos = geo.getAttribute("position");
        const visibleCount = Math.floor((progress / 100) * pos.count);
        geo.setDrawRange(0, visibleCount);
      } else if (pointsRef.current) {
        const geo = pointsRef.current.geometry;
        const pos = geo.getAttribute("position");
        geo.setDrawRange(0, pos.count);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-cyan animate-pulse-glow font-mono text-sm">INITIALIZING 3D ENGINE...</div>
        </div>
      )}

      {/* Drone POV toggle button — top-right of viewport */}
      {loaded && (
        <div className="absolute top-12 right-3 z-20 flex flex-col gap-2">
          <button
            onClick={toggleDronePov}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md font-mono text-[11px] tracking-wider transition-all backdrop-blur-sm ${
              dronePov
                ? "bg-cyan/20 text-cyan border border-cyan/40 shadow-[0_0_12px_rgba(0,212,255,0.3)]"
                : "bg-black/50 text-muted-foreground border border-white/10 hover:text-foreground hover:border-white/20"
            }`}
            title={dronePov ? "Switch to orbit view" : "Switch to drone camera"}
          >
            {dronePov ? <Eye size={14} /> : <Video size={14} />}
            {dronePov ? "ORBIT VIEW" : "DRONE POV"}
          </button>

          {dronePov && (
            <>
              <button
                onClick={() => {
                  povOrbitRef.current = { yaw: 0, pitch: 0 };
                  povZoomRef.current = 90;
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-black/50 text-muted-foreground border border-white/10 hover:text-foreground hover:border-white/20 font-mono text-[11px] tracking-wider transition-all backdrop-blur-sm"
              >
                <RotateCcw size={14} />
                RESET VIEW
              </button>
            </>
          )}
        </div>
      )}

      {/* POV mode hint */}
      {loaded && dronePov && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-cyan/30 backdrop-blur-sm">
            <Move size={12} className="text-cyan" />
            <span className="font-mono text-[10px] text-cyan/80 tracking-wider">DRAG TO LOOK AROUND • SCROLL TO ZOOM</span>
          </div>
        </div>
      )}

      {/* Drone status indicator */}
      {loaded && (isScanning || scanDone) && (
        <div className="absolute top-12 left-3 z-20">
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md backdrop-blur-sm font-mono text-[10px] tracking-wider ${
            isScanning
              ? "bg-cyan/10 border border-cyan/30 text-cyan"
              : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isScanning ? "bg-cyan animate-pulse" : "bg-emerald-400"}`} />
            {isScanning ? `DRONE FLYING • WP ${Math.floor((scanProgress / 100) * 16)}/16` : "DRONE PARKED • HOVERING"}
          </div>
        </div>
      )}
    </div>
  );
}
