/**
 * PanoramaViewer — Interactive 360° panorama viewer using Three.js.
 * Displays drone-captured panoramic images on the inside of a sphere.
 * Users can drag to look around. Includes a thumbnail strip to switch between shots.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Camera, ChevronLeft, ChevronRight, Download, Share2, X } from "lucide-react";

export const CAFE_PANORAMAS = [
  {
    id: 1,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-1_1c4e8fa8.jpeg",
    label: "Upper Floor — Staircase View",
  },
  {
    id: 2,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-2_ac2cb743.jpeg",
    label: "Staircase — Looking Down",
  },
  {
    id: 3,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-3_e9de660f.jpeg",
    label: "Ground Floor — Seating Area",
  },
  {
    id: 4,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-4_bb2a7c9e.jpeg",
    label: "Ground Floor — Window Side",
  },
  {
    id: 5,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-5_0e240249.jpeg",
    label: "Main Hall — Full View",
  },
  {
    id: 6,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-6_0178eefa.jpeg",
    label: "Bar Counter — Entrance Side",
  },
  {
    id: 7,
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/cafe-pano-7_d5f67861.jpeg",
    label: "Spiral Staircase — Street View",
  },
];

interface PanoramaViewerProps {
  onClose?: () => void;
  onGenerateModel?: (imageUrl: string) => void;
  initialIndex?: number;
}

export default function PanoramaViewer({ onClose, onGenerateModel, initialIndex = 0 }: PanoramaViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const lon = useRef(0);
  const lat = useRef(0);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);

  const currentPano = CAFE_PANORAMAS[currentIndex];

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    // Sphere geometry — texture on inside
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // flip normals inward

    const material = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (autoRotate && !isDragging.current) {
        lon.current += 0.03;
      }

      lat.current = Math.max(-85, Math.min(85, lat.current));
      const phi = THREE.MathUtils.degToRad(90 - lat.current);
      const theta = THREE.MathUtils.degToRad(lon.current);

      const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load texture when panorama changes
  useEffect(() => {
    if (!meshRef.current) return;
    setIsLoading(true);

    const loader = new THREE.TextureLoader();
    loader.load(
      currentPano.url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (meshRef.current) {
          (meshRef.current.material as THREE.MeshBasicMaterial).map = texture;
          (meshRef.current.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
        setIsLoading(false);
      },
      undefined,
      () => setIsLoading(false)
    );
  }, [currentIndex, currentPano.url]);

  // Auto-rotate ref sync
  useEffect(() => {
    // nothing — autoRotate is read inside the closure, but we need to keep ref in sync
  }, [autoRotate]);

  // Mouse/touch drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    setAutoRotate(false);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lon.current -= dx * 0.2;
    lat.current += dy * 0.2;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isDragging.current = false; };

  const onTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    setAutoRotate(false);
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - lastMouse.current.x;
    const dy = e.touches[0].clientY - lastMouse.current.y;
    lon.current -= dx * 0.2;
    lat.current += dy * 0.2;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = () => { isDragging.current = false; };

  const goTo = (idx: number) => {
    setCurrentIndex(Math.max(0, Math.min(CAFE_PANORAMAS.length - 1, idx)));
    lon.current = 0;
    lat.current = 0;
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = currentPano.url;
    a.download = `cafe-scan-${currentPano.id}.jpeg`;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <Camera size={14} className="text-cyan" />
          <span className="font-mono text-xs text-cyan tracking-wider">360° SCAN — {currentPano.label.toUpperCase()}</span>
          <span className="font-mono text-[10px] text-white/40 ml-2">{currentIndex + 1}/{CAFE_PANORAMAS.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title="Download this frame"
          >
            <Download size={13} />
          </button>
          {onGenerateModel && (
            <button
              onClick={() => onGenerateModel(currentPano.url)}
              className="px-2 py-1 rounded bg-cyan/20 hover:bg-cyan/40 border border-cyan/30 text-cyan font-mono text-[10px] tracking-wider transition-colors"
              title="Generate 3D model from this view"
            >
              GEN 3D
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Three.js canvas mount */}
      <div
        ref={mountRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
            <span className="font-mono text-xs text-cyan/70 tracking-wider">LOADING SCAN DATA...</span>
          </div>
        </div>
      )}

      {/* Navigation arrows */}
      <button
        onClick={() => goTo(currentIndex - 1)}
        disabled={currentIndex === 0}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => goTo(currentIndex + 1)}
        disabled={currentIndex === CAFE_PANORAMAS.length - 1}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        <ChevronRight size={18} />
      </button>

      {/* Drag hint */}
      {!isDragging.current && !isLoading && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="font-mono text-[10px] text-white/30 tracking-widest">DRAG TO LOOK AROUND</span>
        </div>
      )}

      {/* Thumbnail strip */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex gap-1.5 px-3 py-2 bg-gradient-to-t from-black/90 to-transparent overflow-x-auto scrollbar-hide">
        {CAFE_PANORAMAS.map((pano, idx) => (
          <button
            key={pano.id}
            onClick={() => goTo(idx)}
            className={`flex-shrink-0 w-14 h-9 rounded overflow-hidden border-2 transition-all ${
              idx === currentIndex ? "border-cyan scale-105" : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            <img src={pano.url} alt={pano.label} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
