/**
 * PointCloudViewer - Three.js based 3D point cloud renderer
 * Design: Mission Control / Aerospace Command Center
 * Renders a simulated room point cloud with orbit controls
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface PointCloudViewerProps {
  className?: string;
  isScanning?: boolean;
  scanProgress?: number;
}

function generateRoomPointCloud(density: number = 15000): Float32Array {
  const points: number[] = [];
  const roomW = 6, roomH = 3, roomD = 5;

  // Floor
  for (let i = 0; i < density * 0.2; i++) {
    points.push((Math.random() - 0.5) * roomW, 0, (Math.random() - 0.5) * roomD);
  }
  // Ceiling
  for (let i = 0; i < density * 0.15; i++) {
    points.push((Math.random() - 0.5) * roomW, roomH, (Math.random() - 0.5) * roomD);
  }
  // Walls
  for (let i = 0; i < density * 0.1; i++) {
    points.push(-roomW / 2, Math.random() * roomH, (Math.random() - 0.5) * roomD);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push(roomW / 2, Math.random() * roomH, (Math.random() - 0.5) * roomD);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push((Math.random() - 0.5) * roomW, Math.random() * roomH, -roomD / 2);
  }
  for (let i = 0; i < density * 0.1; i++) {
    points.push((Math.random() - 0.5) * roomW, Math.random() * roomH, roomD / 2);
  }

  // Sofa (box shape)
  for (let i = 0; i < density * 0.08; i++) {
    const x = -1.5 + Math.random() * 2;
    const y = Math.random() * 0.8;
    const z = 1.5 + Math.random() * 0.8;
    points.push(x, y, z);
  }

  // Table
  for (let i = 0; i < density * 0.05; i++) {
    const x = 0.5 + Math.random() * 1.2;
    const y = 0.7 + Math.random() * 0.05;
    const z = 0.5 + Math.random() * 0.8;
    points.push(x, y, z);
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
    const x = 2.2 + Math.random() * 0.4;
    const y = Math.random() * 2;
    const z = -2 + Math.random() * 1;
    points.push(x, y, z);
  }

  // Add noise
  for (let i = 0; i < density * 0.02; i++) {
    points.push(
      (Math.random() - 0.5) * roomW * 1.1,
      Math.random() * roomH * 1.1,
      (Math.random() - 0.5) * roomD * 1.1
    );
  }

  return new Float32Array(points);
}

function generateColors(positions: Float32Array): Float32Array {
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const t = y / 3;
    // Cyan to blue gradient based on height
    colors[i] = 0.0 + t * 0.1;       // R
    colors[i + 1] = 0.7 + t * 0.15;  // G
    colors[i + 2] = 0.9 + t * 0.1;   // B
  }
  return colors;
}

export default function PointCloudViewer({ className = "", isScanning = false, scanProgress = 100 }: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const frameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false, prevX: 0, prevY: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const [loaded, setLoaded] = useState(false);

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

    // Generate point cloud
    const positions = generateRoomPointCloud(20000);
    const colors = generateColors(positions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;

    // Grid helper
    const grid = new THREE.GridHelper(10, 20, 0x00d4ff, 0x0a1a2e);
    grid.material.opacity = 0.15;
    grid.material.transparent = true;
    scene.add(grid);

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
      time += 0.005;

      if (!mouseRef.current.isDown) {
        rotationRef.current.y += 0.002;
      }

      const radius = 7;
      camera.position.x = Math.sin(rotationRef.current.y) * radius;
      camera.position.z = Math.cos(rotationRef.current.y) * radius;
      camera.position.y = 2 + rotationRef.current.x * 3;
      camera.lookAt(0, 1.5, 0);

      // Scanning effect: reveal points progressively
      if (isScanning && pointsRef.current) {
        const geo = pointsRef.current.geometry;
        const pos = geo.getAttribute("position");
        const visibleCount = Math.floor((scanProgress / 100) * pos.count);
        geo.setDrawRange(0, visibleCount);
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
  }, [isScanning, scanProgress]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-cyan animate-pulse-glow font-mono text-sm">INITIALIZING 3D ENGINE...</div>
        </div>
      )}
    </div>
  );
}
