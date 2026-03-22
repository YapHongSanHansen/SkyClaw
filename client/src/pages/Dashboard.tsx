/**
 * Dashboard - Mission Control page
 * Design: Split-panel command center
 * Left: Chat terminal | Center: Viewport | Right: Telemetry
 *
 * View modes:
 *  - SCAN: animated point cloud (drone scanning simulation)
 *  - TOUR / 3D MODEL: same immersive 360° virtual tour of the actual cafe photos
 *    (double-click anywhere to walk, click arrows to navigate — Google Maps style)
 *
 * The "3D MODEL" tab is intentionally merged with TOUR — the virtual tour IS the
 * accurate 3D spatial output. A separate Tripo3D GLB mesh from a single photo
 * would not match the real cafe, so it has been removed.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import * as THREE from "three";
import { trpc } from "@/lib/trpc";

let messageCounter = 100;
import Navbar from "@/components/Navbar";
import ChatTerminal from "@/components/ChatTerminal";
import TelemetryPanel from "@/components/TelemetryPanel";
import PointCloudViewer from "@/components/PointCloudViewer";
import CafeWalkthrough from "@/components/CafeWalkthrough";
import { Maximize2, Minimize2, Scan, Map, Share2, Check } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "system" | "openclaw";
  text: string;
  timestamp: string;
}

const now = () => new Date().toLocaleTimeString("en-US", { hour12: false });

const initialMessages: Message[] = [
  { id: "1", role: "system", text: "OpenClaw Gateway connected. Telegram bridge active.", timestamp: "09:00:00" },
  { id: "2", role: "system", text: "DJI Mavic Air 1 detected. Battery: 87%. Signal: Strong.", timestamp: "09:00:01" },
  { id: "3", role: "openclaw", text: "Ready for commands. Try:\n• 'Scan the cafe for my social media'\n• 'Scan the living room for Airbnb'\n• 'Tour' — open immersive virtual tour\n• 'help' for all commands", timestamp: "09:00:02" },
];

function isCafeScanCommand(lower: string): boolean {
  const cafeTriggers = ["cafe", "coffee shop", "restaurant", "social media", "instagram", "post", "share"];
  const scanTriggers = ["scan", "map", "capture", "shoot", "record", "photograph", "tour"];
  const hasCafe = cafeTriggers.some((t) => lower.includes(t));
  const hasScan = scanTriggers.some((t) => lower.includes(t));
  return hasCafe || (hasScan && hasCafe);
}

export default function Dashboard() {
  // ── Clear stale Tripo3D localStorage on first mount ──────────────────────────
  useEffect(() => {
    localStorage.removeItem("tripo_active_task_id");
    localStorage.removeItem("tripo_model_url");
    localStorage.removeItem("tripo_rendered_image");
    localStorage.removeItem("tripo_view_mode");
  }, []);

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // viewMode: "pointcloud" = scan animation, "tour" = immersive virtual tour
  // "model" is now an alias for "tour" — they show the same thing
  const [viewMode, setViewMode] = useState<"pointcloud" | "tour">("pointcloud");
  const [copied, setCopied] = useState(false);

  const [telemetry, setTelemetry] = useState<{
    battery: number; altitude: number; speed: number; signal: number;
    temperature: number; imagesCaptures: number; totalWaypoints: number;
    currentWaypoint: number; flightTime: string;
    droneStatus: "online" | "offline" | "scanning" | "warning" | "processing";
    scanProgress: number;
    pitch: number; yaw: number; camPitch: number; roll: number;
  }>({
    battery: 87, altitude: 0, speed: 0, signal: 95, temperature: 24,
    imagesCaptures: 0, totalWaypoints: 16, currentWaypoint: 0,
    flightTime: "00:00", droneStatus: "online", scanProgress: 0,
    pitch: 0, yaw: 0, camPitch: 0, roll: 0,
  });

  const addMessage = useCallback((role: Message["role"], text: string) => {
    messageCounter += 1;
    const id = `msg-${messageCounter}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, role, text, timestamp: now() }]);
  }, []);

  // ── Cafe scan — simulates drone flight then opens immersive virtual tour ─────
  const simulateCafeScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setViewMode("pointcloud");
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.8, speed: 0.6 }));

    addMessage("openclaw", `Acknowledged. Initiating cafe scan sequence...\nDrone will fly a 360° sweep capturing 62 positions from your walkthrough video.`);
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 600);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.8m. Entering cafe airspace."), 1800);
    setTimeout(() => addMessage("system", "IMU calibrated. Axis telemetry online."), 2200);
    setTimeout(() => addMessage("openclaw", `Executing panoramic sweep. Capturing 62 frames.`), 2800);

    let progress = 0;
    let waypoint = 0;
    let seconds = 0;

    scanIntervalRef.current = setInterval(() => {
      progress += 3;
      seconds += 1;
      // Simulate realistic axis values during flight
      const simYaw = ((progress * 5.8) % 360) - 180; // -180 to 180, sweeping
      const simPitch = -8 + Math.sin(progress * 0.08) * 5; // slight nose-down oscillation
      const simCamPitch = -45 + Math.sin(progress * 0.05) * 15; // camera tilting down
      const simRoll = Math.sin(progress * 0.12) * 3; // gentle banking

      if (progress % 14 === 0) {
        waypoint = Math.min(waypoint + 1, 62);
        addMessage("system", `WP${waypoint}/62 | Pitch: ${simPitch.toFixed(1)}° | Yaw: ${simYaw.toFixed(1)}° | Cam: ${simCamPitch.toFixed(1)}° | Roll: ${simRoll.toFixed(1)}°`);
      }

      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");

      setScanProgress(Math.min(progress, 100));
      setTelemetry((t) => ({
        ...t, scanProgress: Math.min(progress, 100),
        currentWaypoint: waypoint, imagesCaptures: waypoint * 3,
        battery: Math.round(Math.max(t.battery - 0.4, 20)),
        altitude: 1.8 + Math.sin(progress * 0.04) * 0.4,
        speed: 0.4 + Math.random() * 0.4,
        flightTime: `${mins}:${secs}`,
        totalWaypoints: 62,
        pitch: simPitch, yaw: simYaw, camPitch: simCamPitch, roll: simRoll,
      }));

      if (progress >= 100) {
        clearInterval(scanIntervalRef.current!);
        setIsScanning(false);
        setTelemetry((t) => ({
          ...t, droneStatus: "processing", speed: 0, altitude: 0,
          scanProgress: 100, currentWaypoint: 62,
          imagesCaptures: 62,
        }));

        addMessage("system", `Scan complete. 62 frames captured.`);
        addMessage("openclaw", "Building immersive virtual tour from your cafe photos...");

        setTimeout(() => {
          setViewMode("tour");
          setTelemetry((t) => ({ ...t, droneStatus: "online" }));
          addMessage("openclaw",
            `Virtual tour ready! You're now inside the cafe.\n\n` +
            `Controls:\n` +
            `• Drag to look around in 360°\n` +
            `• DOUBLE-CLICK anywhere to walk in that direction\n` +
            `• Click the glowing arrows to navigate\n` +
            `• Mini-map (bottom-right) to jump to any spot\n\n` +
            `7 viewpoints across 2 floors. Share link ready!`
          );
        }, 1500);
      }
    }, 300);
  }, [addMessage]);

  // ── Generic scan (non-cafe) ──────────────────────────────────────────────────
  const simulateScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setViewMode("pointcloud");
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.5, speed: 0.8 }));
    addMessage("openclaw", "Acknowledged. Initiating scan sequence...");
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 800);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.5m"), 2000);
    setTimeout(() => addMessage("system", "IMU calibrated. Axis telemetry online."), 2500);
    setTimeout(() => addMessage("openclaw", "Executing waypoint mission. 16 waypoints loaded."), 3000);

    let progress = 0, waypoint = 0, images = 0, seconds = 0;
    scanIntervalRef.current = setInterval(() => {
      progress += 2; seconds += 1;
      const gYaw = ((progress * 7.2) % 360) - 180;
      const gPitch = -5 + Math.sin(progress * 0.1) * 4;
      const gCamPitch = -30 + Math.sin(progress * 0.06) * 10;
      const gRoll = Math.sin(progress * 0.15) * 2.5;
      if (progress % 12 === 0) {
        waypoint = Math.min(waypoint + 1, 16); images += Math.floor(Math.random() * 4) + 3;
        addMessage("system", `WP${waypoint}/16 | Pitch: ${gPitch.toFixed(1)}° | Yaw: ${gYaw.toFixed(1)}° | Cam: ${gCamPitch.toFixed(1)}° | Roll: ${gRoll.toFixed(1)}°`);
      }
      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");
      setScanProgress(Math.min(progress, 100));
      setTelemetry((t) => ({
        ...t, scanProgress: Math.min(progress, 100), currentWaypoint: waypoint,
        imagesCaptures: images, battery: Math.round(Math.max(t.battery - 0.3, 20)),
        altitude: 1.5 + Math.sin(progress * 0.05) * 0.3, speed: 0.5 + Math.random() * 0.5,
        flightTime: `${mins}:${secs}`,
        pitch: gPitch, yaw: gYaw, camPitch: gCamPitch, roll: gRoll,
      }));
      if (progress >= 100) {
        clearInterval(scanIntervalRef.current!);
        setIsScanning(false);
        setTelemetry((t) => ({ ...t, droneStatus: "processing", speed: 0, altitude: 0, scanProgress: 100, currentWaypoint: 16, imagesCaptures: images + 5 }));
        addMessage("system", `Scan complete. ${images + 5} images captured.`);
        addMessage("openclaw", "Processing images with COLMAP photogrammetry engine...");
        setTimeout(() => {
          addMessage("openclaw", "3D point cloud generated. 23,847 points reconstructed.");
          setTelemetry((t) => ({ ...t, droneStatus: "online" }));
        }, 3000);
      }
    }, 300);
  }, [addMessage]);

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleCopyShare = useCallback(() => {
    // Share the current page URL with a ?tour=1 param for social media
    const url = `${window.location.origin}/dashboard?tour=1`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // ── Command handler ──────────────────────────────────────────────────────────
  const handleCommand = useCallback((command: string) => {
    addMessage("user", command);
    const lower = command.toLowerCase();

    if (isCafeScanCommand(lower) || lower.includes("scan the cafe") || lower.includes("scan cafe") || lower.includes("virtual tour") || lower.includes("tour the cafe")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood! Scanning the cafe for an immersive virtual tour.\nDrone will capture 62 positions as it walks through the space.`);
        setTimeout(() => simulateCafeScan(), 800);
      }, 400);
    } else if (lower.includes("tour") || lower.includes("360") || lower.includes("walk") || lower.includes("explore")) {
      setViewMode("tour");
      addMessage("openclaw", "Opening immersive virtual tour.\nDouble-click anywhere to walk in that direction. Drag to look around.");
    } else if (lower.includes("scan") || lower.includes("map") || lower.includes("airbnb")) {
      setTimeout(() => {
        addMessage("openclaw", `Preparing scan mission for interior mapping.`);
        setTimeout(() => simulateScan(), 1000);
      }, 500);
    } else if (lower.includes("status") || lower.includes("battery") || lower.includes("check")) {
      setTimeout(() => {
        addMessage("openclaw", `Drone: Battery ${telemetry.battery.toFixed(0)}% | Signal ${telemetry.signal}% | ${telemetry.droneStatus}`);
      }, 500);
    } else if (lower.includes("help")) {
      setTimeout(() => {
        addMessage("openclaw",
          "Available commands:\n" +
          "• 'Scan the cafe for my social media' — immersive virtual tour of the cafe\n" +
          "• 'Scan [room] for Airbnb' — interior mapping scan\n" +
          "• 'Tour' / '360' / 'Explore' — open virtual tour directly\n" +
          "• 'Status' — check drone status\n" +
          "• 'Stop' — abort current mission"
        );
      }, 500);
    } else if (lower.includes("stop") || lower.includes("abort")) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        setIsScanning(false);
        setTelemetry((t) => ({ ...t, droneStatus: "online", speed: 0 }));
        addMessage("openclaw", "Mission aborted. Drone returning to home position.");
      } else addMessage("openclaw", "No active mission to abort.");
    } else {
      setTimeout(() => {
        addMessage("openclaw", `I understand you said "${command}".\nTry: 'scan the cafe for social media', 'tour', or 'help'.`);
      }, 500);
    }
  }, [addMessage, simulateCafeScan, simulateScan, telemetry]);

  const viewportLabel =
    viewMode === "tour" ? "3D Walkthrough | Cafe" : "3D Viewport | Point Cloud";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Mission Control Header */}
      <div className="pt-14 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Mission Control</h1>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">OpenClaw + DJI Mavic Air 1 | Real-time Drone Operations & 3D Virtual Tour</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View mode toggle — SCAN and TOUR/3D MODEL */}
            <div className="flex items-center gap-1 bg-card/50 border border-border rounded-md p-0.5">
              <button
                onClick={() => setViewMode("pointcloud")}
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${viewMode === "pointcloud" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Scan size={12} className="inline mr-1" />SCAN
              </button>
              <button
                onClick={() => setViewMode("tour")}
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${viewMode === "tour" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Map size={12} className="inline mr-1" />3D TOUR
              </button>
            </div>

            {viewMode === "tour" && (
              <button
                onClick={handleCopyShare}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan/10 border border-cyan/30 text-cyan font-mono text-[10px] tracking-wider hover:bg-cyan/20 transition-colors"
              >
                {copied ? <Check size={12} /> : <Share2 size={12} />}
                {copied ? "COPIED!" : "SHARE"}
              </button>
            )}

            <span className={`px-2.5 py-1 rounded-md font-mono text-[10px] tracking-wider uppercase ${
              isScanning ? "bg-cyan/10 text-cyan border border-cyan/30" :
              telemetry.droneStatus === "processing" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
              "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}>
              {isScanning ? `SCANNING ${scanProgress}%` : telemetry.droneStatus === "processing" ? "PROCESSING" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout: 3 panels */}
      <div className="flex-1 px-4 sm:px-6 pb-4">
        <div className={`max-w-[1600px] mx-auto h-[calc(100vh-140px)] grid gap-4 ${
          viewportExpanded ? "grid-cols-1" : "lg:grid-cols-[320px_1fr_280px] grid-cols-1"
        }`}>
          {!viewportExpanded && (
            <ChatTerminal messages={messages} onCommand={handleCommand} className="h-[300px] lg:h-full" />
          )}

          {/* Center: Viewport */}
          <div className="relative glow-border-active rounded-lg overflow-hidden bg-black/40 min-h-[400px]">
            {/* Header — only for pointcloud mode (tour has its own header) */}
            {viewMode !== "tour" && (
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">{viewportLabel}</span>
                <div className="flex items-center gap-2 pointer-events-auto">
                  {isScanning && <span className="font-mono text-[10px] text-amber-400 animate-pulse">SCANNING {scanProgress}%</span>}
                  <button
                    onClick={() => setViewportExpanded(!viewportExpanded)}
                    className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {viewportExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Viewport content */}
            {viewMode === "tour" ? (
              <CafeWalkthrough />
            ) : (
              <PointCloudViewer className="w-full h-full" isScanning={isScanning} scanProgress={scanProgress} />
            )}

            {/* Footer — only for pointcloud mode */}
            {viewMode !== "tour" && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {`Points: ${isScanning ? Math.floor(scanProgress * 238.47) : "23,847"} | Drag to rotate`}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {`Three.js r${THREE.REVISION || "183"}`}
                </span>
              </div>
            )}
          </div>

          {!viewportExpanded && (
            <TelemetryPanel data={telemetry} className="h-[300px] lg:h-full overflow-y-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
