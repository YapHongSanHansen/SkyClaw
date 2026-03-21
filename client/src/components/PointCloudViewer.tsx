/**
 * PointCloudViewer - Three.js based 3D point cloud renderer
 * Design: Mission Control / Aerospace Command Center
 * Features:
 *  - Simulated room point cloud with orbit controls
 *  - Animated 3D drone that flies along waypoints during scan (synced with progress)
 *  - Drone parks in corner after scan completes, hovering/scanning
 *  - "DRONE POV" toggle to switch camera to drone's first-person view
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Video, Eye, RotateCcw } from "lucide-react";

interface PointCloudViewerProps {
  className?: string;
  isScanning?: boolean;
  scanProgress?: number;
}

// ── Room dimensions ───────────────────────────────────────────────────────────
const ROOM_W = 6, ROOM_H = 3, ROOM_D = 5;

// ── Drone flight waypoints (a scanning pattern through the room) ──────────────
const DRONE_WAYPOINTS: THREE.Vector3[] = [
  // Start at entrance
  new THREE.Vector3(0, 2.2, 2.2),
  // Fly to front-left
  new THREE.Vector3(-2, 2.0, 1.5),
  // Sweep left wall
  new THREE.Vector3(-2.5, 1.8, 0),
  // Continue to back-left
  new THREE.Vector3(-2, 2.0, -1.5),
  // Back wall center
  new THREE.Vector3(0, 2.2, -2),
  // Back-right
  new THREE.Vector3(2, 2.0, -1.5),
  // Right wall
  new THREE.Vector3(2.5, 1.8, 0),
  // Front-right
  new THREE.Vector3(2, 2.0, 1.5),
  // Center high pass
  new THREE.Vector3(0, 2.5, 0),
  // Low pass over table
  new THREE.Vector3(1, 1.2, 0.8),
  // Low pass over sofa
  new THREE.Vector3(-0.5, 1.2, 1.8),
  // Sweep back to center
  new THREE.Vector3(0, 2.0, 0),
  // Final high orbit
  new THREE.Vector3(-1.5, 2.4, -1),
  new THREE.Vector3(1.5, 2.4, 1),
  // Return to center
  new THREE.Vector3(0, 2.2, 0),
  // Park position (top-right corner of room)
  new THREE.Vector3(2.5, 2.6, -2.2),
];

// ── Park position (where drone hovers after scan) ─────────────────────────────
const PARK_POS = new THREE.Vector3(2.5, 2.6, -2.2);

function generateRoomPointCloud(density: number = 15000): Float32Array {
  const points: number[] = [];
  // Floor
  for (let i = 0; i < density * 0.2; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, 0, (Math.random() - 0.5) * ROOM_D);
  }
  // Ceiling
  for (let i = 0; i < density * 0.15; i++) {
    points.push((Math.random() - 0.5) * ROOM_W, ROOM_H, (Math.random() - 0.5) * ROOM_D);
  }
  // Walls
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
  // Sofa
  for (let i = 0; i < density * 0.08; i++) {
    points.push(-1.5 + Math.random() * 2, Math.random() * 0.8, 1.5 + Math.random() * 0.8);
  }
  // Table
  for (let i = 0; i < density * 0.05; i++) {
    points.push(0.5 + Math.random() * 1.2, 0.7 + Math.random() * 0.05, 0.5 + Math.random() * 0.8);
  }
  // Table legs
  for (let leg = 0; leg < 4; leg++) {
    const lx = leg < 2 ? 0.55 : 1.65;
    const lz = leg % 2 === 0 ? 0.55 : 1.25;
    for (let i = 0; i < density * 0.005; i++) {
      points.push(lx + (Math.random() - 0.5) * 0.05, Math.random() * 0.7, lz + (Math.random() - 0.5) * 0.05);
    }
  }
  // Bookshelf
  for (let i = 0; i < density * 0.06; i++) {
    points.push(2.2 + Math.random() * 0.4, Math.random() * 2, -2 + Math.random() * 1);
  }
  // Noise
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

// ── Build a simple drone mesh (body + 4 arms + 4 rotors) ─────────────────────
function createDroneMesh(): THREE.Group {
  const drone = new THREE.Group();

  // Body — dark metallic capsule
  const bodyGeo = new THREE.BoxGeometry(0.22, 0.08, 0.14);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  drone.add(body);

  // Camera lens on front
  const lensGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.6 });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(0.12, -0.01, 0);
  drone.add(lens);

  // Arms + rotors
  const armPositions = [
    { x: 0.18, z: 0.12 },
    { x: 0.18, z: -0.12 },
    { x: -0.18, z: 0.12 },
    { x: -0.18, z: -0.12 },
  ];

  const armMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.6, roughness: 0.4 });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.4,
    emissive: 0x00d4ff, emissiveIntensity: 0.3,
  });

  armPositions.forEach(({ x, z }) => {
    // Arm
    const armGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x * 0.5, 0.02, z);
    drone.add(arm);

    // Rotor disc
    const rotorGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.005, 16);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(x, 0.06, z);
    rotor.userData.isRotor = true;
    drone.add(rotor);
  });

  // LED lights underneath
  const ledGeo = new THREE.SphereGeometry(0.012, 6, 6);
  const ledFront = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1 }));
  ledFront.position.set(0.1, -0.05, 0);
  drone.add(ledFront);

  const ledBack = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 }));
  ledBack.position.set(-0.1, -0.05, 0);
  drone.add(ledBack);

  // Scan beam (visible cone of light pointing down)
  const beamGeo = new THREE.ConeGeometry(0.3, 0.8, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, -0.45, 0);
  beam.userData.isBeam = true;
  drone.add(beam);

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
    setDronePov((prev) => !prev);
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

    // Lighting for the drone
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 5, 3);
    scene.add(dirLight);

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

    // Mouse controls
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
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x += dy * 0.005;
      rotationRef.current.x = Math.max(-1, Math.min(1, rotationRef.current.x));
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

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
          // Flying along waypoints
          targetPos = getDronePosition(progress);
          lookTarget = getDroneLookTarget(progress);
        } else {
          // Parked — hover in corner with gentle bob
          targetPos = PARK_POS.clone();
          targetPos.y += Math.sin(time * 2) * 0.05;
          lookTarget = new THREE.Vector3(0, 1.5, 0); // Look at room center
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
          droneGroup.rotation.x = -0.1; // Forward tilt
        } else {
          droneGroup.rotation.z = Math.sin(time * 1.5) * 0.03;
          droneGroup.rotation.x = 0;
        }

        // Spin rotors
        droneGroup.children.forEach((child) => {
          if (child.userData.isRotor) {
            child.rotation.y += scanning ? 0.8 : 0.3;
          }
          // Pulse scan beam
          if (child.userData.isBeam) {
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
            mat.opacity = scanning ? 0.08 + Math.sin(time * 4) * 0.04 : 0.03;
          }
        });
      }

      // ── Camera ──────────────────────────────────────────────────────────
      if (isPov && droneGroup) {
        // Drone POV: camera at drone position, looking where drone looks
        const dronePos = droneGroup.position.clone();
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(droneGroup.quaternion);
        // Slightly below and behind the drone
        camera.position.copy(dronePos).add(new THREE.Vector3(0, -0.05, 0));
        camera.lookAt(dronePos.clone().add(fwd.multiplyScalar(3)).add(new THREE.Vector3(0, -0.5, 0)));
        camera.fov = 90;
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
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-mono text-[10px] tracking-wider transition-all backdrop-blur-sm ${
              dronePov
                ? "bg-cyan/20 text-cyan border border-cyan/40 shadow-[0_0_12px_rgba(0,212,255,0.3)]"
                : "bg-black/50 text-muted-foreground border border-white/10 hover:text-foreground hover:border-white/20"
            }`}
            title={dronePov ? "Switch to orbit view" : "Switch to drone camera"}
          >
            {dronePov ? <Eye size={12} /> : <Video size={12} />}
            {dronePov ? "ORBIT VIEW" : "DRONE POV"}
          </button>

          {dronePov && (
            <button
              onClick={() => setDronePov(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/50 text-muted-foreground border border-white/10 hover:text-foreground hover:border-white/20 font-mono text-[10px] tracking-wider transition-all backdrop-blur-sm"
            >
              <RotateCcw size={12} />
              RESET CAM
            </button>
          )}
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
