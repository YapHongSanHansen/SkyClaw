/**
 * Dashboard - Mission Control page
 * Design: Split-panel command center
 * Left: Chat terminal | Center: 3D viewport | Right: Telemetry
 */
import { useState, useCallback, useRef } from "react";

let messageCounter = 100;
import Navbar from "@/components/Navbar";
import ChatTerminal from "@/components/ChatTerminal";
import TelemetryPanel from "@/components/TelemetryPanel";
import PointCloudViewer from "@/components/PointCloudViewer";
import { Maximize2, Minimize2 } from "lucide-react";

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
  { id: "3", role: "openclaw", text: "Ready for commands. Try: 'Scan the living room for Airbnb' or 'Start security patrol'.", timestamp: "09:00:02" },
];

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [telemetry, setTelemetry] = useState<{
    battery: number;
    altitude: number;
    speed: number;
    signal: number;
    temperature: number;
    imagesCaptures: number;
    totalWaypoints: number;
    currentWaypoint: number;
    flightTime: string;
    droneStatus: "online" | "offline" | "scanning" | "warning" | "processing";
    scanProgress: number;
  }>({
    battery: 87,
    altitude: 0,
    speed: 0,
    signal: 95,
    temperature: 24,
    imagesCaptures: 0,
    totalWaypoints: 16,
    currentWaypoint: 0,
    flightTime: "00:00",
    droneStatus: "online",
    scanProgress: 0,
  });

  const addMessage = useCallback((role: Message["role"], text: string) => {
    messageCounter += 1;
    const id = `msg-${messageCounter}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, role, text, timestamp: now() }]);
  }, []);

  const simulateScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.5, speed: 0.8 }));

    addMessage("openclaw", "Acknowledged. Initiating scan sequence...");

    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 800);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.5m"), 2000);
    setTimeout(() => addMessage("openclaw", "Executing waypoint mission. 16 waypoints loaded. Capturing images at each waypoint."), 3000);

    let progress = 0;
    let waypoint = 0;
    let images = 0;
    let seconds = 0;

    scanIntervalRef.current = setInterval(() => {
      progress += 2;
      seconds += 1;
      if (progress % 12 === 0) {
        waypoint = Math.min(waypoint + 1, 16);
        images += Math.floor(Math.random() * 4) + 3;
      }

      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");

      setScanProgress(Math.min(progress, 100));
      setTelemetry((t) => ({
        ...t,
        scanProgress: Math.min(progress, 100),
        currentWaypoint: waypoint,
        imagesCaptures: images,
        battery: Math.round(Math.max(t.battery - 0.3, 20)),
        altitude: 1.5 + Math.sin(progress * 0.05) * 0.3,
        speed: 0.5 + Math.random() * 0.5,
        flightTime: `${mins}:${secs}`,
      }));

      if (progress >= 100) {
        clearInterval(scanIntervalRef.current!);
        setIsScanning(false);
        setTelemetry((t) => ({
          ...t,
          droneStatus: "processing",
          speed: 0,
          altitude: 0,
          scanProgress: 100,
          currentWaypoint: 16,
          imagesCaptures: images + 5,
        }));
        addMessage("system", `Scan complete. ${images + 5} images captured across 16 waypoints.`);
        addMessage("openclaw", "Processing images with COLMAP photogrammetry engine...");

        setTimeout(() => {
          addMessage("openclaw", "3D point cloud generated successfully. 23,847 points reconstructed.");
          addMessage("openclaw", "Model available in the 3D viewport. You can rotate and zoom to explore.");
          setTelemetry((t) => ({ ...t, droneStatus: "online" }));
        }, 3000);
      }
    }, 300);
  }, [addMessage]);

  const handleCommand = useCallback((command: string) => {
    addMessage("user", command);
    const lower = command.toLowerCase();

    if (lower.includes("scan") || lower.includes("map") || lower.includes("airbnb") || lower.includes("3d")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood. Parsing command: "${command}". Preparing scan mission for interior mapping.`);
        setTimeout(() => simulateScan(), 1000);
      }, 500);
    } else if (lower.includes("status") || lower.includes("battery") || lower.includes("check")) {
      setTimeout(() => {
        addMessage("openclaw", `Drone Status: Battery ${telemetry.battery.toFixed(0)}% | Signal ${telemetry.signal}% | Temp ${telemetry.temperature}°C | Status: ${telemetry.droneStatus}`);
      }, 500);
    } else if (lower.includes("help")) {
      setTimeout(() => {
        addMessage("openclaw", "Available commands:\n• 'Scan [room] for [purpose]' - Start a 3D scan\n• 'Status' - Check drone status\n• 'Stop' - Abort current mission\n• 'Export' - Export 3D model");
      }, 500);
    } else if (lower.includes("stop") || lower.includes("abort")) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        setIsScanning(false);
        setTelemetry((t) => ({ ...t, droneStatus: "online", speed: 0 }));
        addMessage("openclaw", "Mission aborted. Drone returning to home position.");
      } else {
        addMessage("openclaw", "No active mission to abort.");
      }
    } else {
      setTimeout(() => {
        addMessage("openclaw", `I understand you said "${command}". I can help with scanning, mapping, and 3D model generation. Try 'scan the room for Airbnb' or type 'help' for available commands.`);
      }, 500);
    }
  }, [addMessage, simulateScan, telemetry]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Mission Control Header */}
      <div className="pt-14 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Mission Control</h1>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">OpenClaw + DJI Mavic Air 1 | Real-time Drone Operations</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-md font-mono text-[10px] tracking-wider uppercase ${
              isScanning ? "bg-cyan/10 text-cyan border border-cyan/30" : "bg-emerald-ok/10 text-emerald-ok border border-emerald-ok/30"
            }`}>
              {isScanning ? "SCANNING" : telemetry.droneStatus === "processing" ? "PROCESSING" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout: 3 panels */}
      <div className="flex-1 px-4 sm:px-6 pb-4">
        <div className={`max-w-[1600px] mx-auto h-[calc(100vh-140px)] grid gap-4 ${
          viewportExpanded ? "grid-cols-1" : "lg:grid-cols-[320px_1fr_280px] grid-cols-1"
        }`}>
          {/* Left: Chat Terminal */}
          {!viewportExpanded && (
            <ChatTerminal
              messages={messages}
              onCommand={handleCommand}
              className="h-[300px] lg:h-full"
            />
          )}

          {/* Center: 3D Viewport */}
          <div className="relative glow-border-active rounded-lg overflow-hidden bg-black/40 min-h-[400px]">
            {/* Viewport header */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent">
              <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">3D Viewport | Point Cloud</span>
              <div className="flex items-center gap-2">
                {isScanning && (
                  <span className="font-mono text-[10px] text-amber-alert animate-pulse-glow">
                    SCANNING {scanProgress}%
                  </span>
                )}
                <button
                  onClick={() => setViewportExpanded(!viewportExpanded)}
                  className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {viewportExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>

            {/* 3D Viewer */}
            <PointCloudViewer
              className="w-full h-full"
              isScanning={isScanning}
              scanProgress={scanProgress}
            />

            {/* Viewport footer */}
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
              <span className="font-mono text-[10px] text-muted-foreground">
                Points: {isScanning ? Math.floor(scanProgress * 238.47) : "23,847"} | Drag to rotate
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Three.js r{THREE.REVISION || "183"}
              </span>
            </div>
          </div>

          {/* Right: Telemetry */}
          {!viewportExpanded && (
            <TelemetryPanel data={telemetry} className="h-[300px] lg:h-full overflow-y-auto" />
          )}
        </div>
      </div>
    </div>
  );
}

// Need THREE for version display
import * as THREE from "three";
