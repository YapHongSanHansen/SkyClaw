/**
 * Dashboard - Mission Control page
 * Design: Split-panel command center
 * Left: Chat terminal | Center: 3D viewport | Right: Telemetry
 * Now with Tripo3D integration for real 3D model generation
 * and fully immersive Google Maps-style virtual tour for cafe scan demo
 */
import { useState, useCallback, useRef, useEffect } from "react";
import * as THREE from "three";
import { trpc } from "@/lib/trpc";

let messageCounter = 100;
import Navbar from "@/components/Navbar";
import ChatTerminal from "@/components/ChatTerminal";
import TelemetryPanel from "@/components/TelemetryPanel";
import PointCloudViewer from "@/components/PointCloudViewer";
import ModelViewer from "@/components/ModelViewer";
import VirtualTour, { VIEWPOINTS, type Viewpoint } from "@/components/VirtualTour";
import { Maximize2, Minimize2, Box, Scan, Map, Share2, Check } from "lucide-react";

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
  { id: "3", role: "openclaw", text: "Ready for commands. Try:\n• 'Scan the cafe for my social media'\n• 'Generate 3D model of a modern kitchen'\n• 'Scan the living room for Airbnb'\n• 'help' for all commands", timestamp: "09:00:02" },
];

function isCafeScanCommand(lower: string): boolean {
  const cafeTriggers = ["cafe", "coffee shop", "restaurant", "social media", "instagram", "post", "share"];
  const scanTriggers = ["scan", "map", "capture", "shoot", "record", "photograph", "tour"];
  const hasCafe = cafeTriggers.some((t) => lower.includes(t));
  const hasScan = scanTriggers.some((t) => lower.includes(t));
  return hasCafe || (hasScan && hasCafe);
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => localStorage.getItem('tripo_active_task_id'));
  const [modelUrl, setModelUrl] = useState<string | null>(() => localStorage.getItem('tripo_model_url'));
  const [renderedImage, setRenderedImage] = useState<string | null>(() => localStorage.getItem('tripo_rendered_image'));
  const [viewMode, setViewMode] = useState<"pointcloud" | "tour" | "model">(() => {
    const saved = localStorage.getItem('tripo_view_mode');
    if (saved === 'model') return 'model';
    if (saved === 'tour') return 'tour';
    return 'pointcloud';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (activeTaskId) localStorage.setItem('tripo_active_task_id', activeTaskId);
    else localStorage.removeItem('tripo_active_task_id');
  }, [activeTaskId]);
  useEffect(() => {
    if (modelUrl) localStorage.setItem('tripo_model_url', modelUrl);
    else localStorage.removeItem('tripo_model_url');
  }, [modelUrl]);
  useEffect(() => {
    if (renderedImage) localStorage.setItem('tripo_rendered_image', renderedImage);
    else localStorage.removeItem('tripo_rendered_image');
  }, [renderedImage]);
  useEffect(() => {
    localStorage.setItem('tripo_view_mode', viewMode);
  }, [viewMode]);

  const textToModelMutation = trpc.tripo.textToModel.useMutation();
  const imageToModelMutation = trpc.tripo.imageToModel.useMutation();
  const proxyModelMutation = trpc.tripo.proxyModel.useMutation();

  const taskStatusQuery = trpc.tripo.taskStatus.useQuery(
    { taskId: activeTaskId ?? "" },
    {
      enabled: !!activeTaskId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 3000;
        if (data.status === "success" || data.status === "failed") return false;
        return 3000;
      },
    }
  );

  useEffect(() => {
    if (!taskStatusQuery.data || !activeTaskId) return;
    const { status, modelUrl: url, renderedImage: img } = taskStatusQuery.data;
    if (status === "success") {
      const tripoUrl = taskStatusQuery.data?.pbrModelUrl ?? url;
      const taskId = activeTaskId;
      if (tripoUrl && taskId) {
        addMessage("openclaw", "Model generated! Uploading to secure storage...");
        setActiveTaskId(null);
        proxyModelMutation.mutate(
          { tripoUrl, taskId },
          {
            onSuccess: (data) => {
              setModelUrl(data.url);
              setRenderedImage(img ?? null);
              setViewMode("model");
              setIsGenerating(false);
              setShareUrl(data.url);
              addMessage("openclaw", `3D model ready!\nLoaded in the viewport — rotate, zoom, and explore.\nRendered with PBR materials and textures.\n\nShare link ready — click the SHARE button above the viewport.`);
            },
            onError: () => {
              setModelUrl(tripoUrl);
              setRenderedImage(img ?? null);
              setViewMode("model");
              setIsGenerating(false);
              addMessage("openclaw", `3D model ready! Loaded in viewport.`);
            },
          }
        );
      }
    }
    if (status === "failed") {
      setIsGenerating(false);
      setActiveTaskId(null);
      addMessage("openclaw", "3D model generation failed. Please try again with a different prompt or image.");
    }
  }, [taskStatusQuery.data, activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [telemetry, setTelemetry] = useState<{
    battery: number; altitude: number; speed: number; signal: number;
    temperature: number; imagesCaptures: number; totalWaypoints: number;
    currentWaypoint: number; flightTime: string;
    droneStatus: "online" | "offline" | "scanning" | "warning" | "processing";
    scanProgress: number;
  }>({
    battery: 87, altitude: 0, speed: 0, signal: 95, temperature: 24,
    imagesCaptures: 0, totalWaypoints: 16, currentWaypoint: 0,
    flightTime: "00:00", droneStatus: "online", scanProgress: 0,
  });

  const addMessage = useCallback((role: Message["role"], text: string) => {
    messageCounter += 1;
    const id = `msg-${messageCounter}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, role, text, timestamp: now() }]);
  }, []);

  const generateFromText = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    addMessage("openclaw", `Sending to Tripo3D: "${prompt}"\nThis typically takes 30-90 seconds...`);
    try {
      const result = await textToModelMutation.mutateAsync({ prompt });
      setActiveTaskId(result.taskId);
      addMessage("system", `Task queued: ${result.taskId.substring(0, 16)}... Polling for results.`);
    } catch (err: unknown) {
      setIsGenerating(false);
      addMessage("openclaw", `Failed to start generation: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [addMessage, textToModelMutation]);

  const generateFromImage = useCallback(async (imageUrl: string) => {
    setIsGenerating(true);
    addMessage("openclaw", `Processing image for 3D reconstruction...\nThis typically takes 30-90 seconds...`);
    try {
      const result = await imageToModelMutation.mutateAsync({ imageUrl });
      setActiveTaskId(result.taskId);
      addMessage("system", `Task queued: ${result.taskId.substring(0, 16)}... Polling for results.`);
    } catch (err: unknown) {
      setIsGenerating(false);
      addMessage("openclaw", `Failed to start generation: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [addMessage, imageToModelMutation]);

  // Cafe scan — simulates drone flight then opens immersive virtual tour
  const simulateCafeScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.8, speed: 0.6 }));

    addMessage("openclaw", "Acknowledged. Initiating cafe scan sequence...\nDrone will fly a 360° sweep capturing panoramic views at 7 key positions.");
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 600);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.8m. Entering cafe airspace."), 1800);
    setTimeout(() => addMessage("openclaw", `Executing panoramic sweep. Capturing ${VIEWPOINTS.length} viewpoints.`), 2800);

    let progress = 0;
    let waypoint = 0;
    let seconds = 0;

    scanIntervalRef.current = setInterval(() => {
      progress += 3;
      seconds += 1;
      if (progress % 14 === 0) {
        waypoint = Math.min(waypoint + 1, VIEWPOINTS.length);
        const vp = VIEWPOINTS[waypoint - 1];
        if (vp) addMessage("system", `Viewpoint ${waypoint}/${VIEWPOINTS.length}: ${vp.label} — captured.`);
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
        totalWaypoints: VIEWPOINTS.length,
      }));

      if (progress >= 100) {
        clearInterval(scanIntervalRef.current!);
        setIsScanning(false);
        setTelemetry((t) => ({
          ...t, droneStatus: "processing", speed: 0, altitude: 0,
          scanProgress: 100, currentWaypoint: VIEWPOINTS.length,
          imagesCaptures: VIEWPOINTS.length * 3 + 4,
        }));

        addMessage("system", `Scan complete. ${VIEWPOINTS.length * 3 + 4} images captured.`);
        addMessage("openclaw", "Building immersive virtual tour...");

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

          // Tour IS the 3D output — no separate model generation needed
        }, 1500);
      }
    }, 300);
  }, [addMessage]);

  const simulateScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setViewMode("pointcloud");
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.5, speed: 0.8 }));
    addMessage("openclaw", "Acknowledged. Initiating scan sequence...");
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 800);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.5m"), 2000);
    setTimeout(() => addMessage("openclaw", "Executing waypoint mission. 16 waypoints loaded."), 3000);

    let progress = 0, waypoint = 0, images = 0, seconds = 0;
    scanIntervalRef.current = setInterval(() => {
      progress += 2; seconds += 1;
      if (progress % 12 === 0) { waypoint = Math.min(waypoint + 1, 16); images += Math.floor(Math.random() * 4) + 3; }
      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");
      setScanProgress(Math.min(progress, 100));
      setTelemetry((t) => ({
        ...t, scanProgress: Math.min(progress, 100), currentWaypoint: waypoint,
        imagesCaptures: images, battery: Math.round(Math.max(t.battery - 0.3, 20)),
        altitude: 1.5 + Math.sin(progress * 0.05) * 0.3, speed: 0.5 + Math.random() * 0.5,
        flightTime: `${mins}:${secs}`,
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

  const handleCopyShare = useCallback(() => {
    const url = shareUrl ?? modelUrl ?? VIEWPOINTS[4].url;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl, modelUrl]);

  const handleCommand = useCallback((command: string) => {
    addMessage("user", command);
    const lower = command.toLowerCase();

    if (isCafeScanCommand(lower) || lower.includes("scan the cafe") || lower.includes("scan cafe") || lower.includes("virtual tour") || lower.includes("tour the cafe")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood! Scanning the cafe for an immersive virtual tour.\nDrone will capture 360° panoramic views at ${VIEWPOINTS.length} key positions.`);
        setTimeout(() => simulateCafeScan(), 800);
      }, 400);
    } else if (lower.includes("generate") || lower.includes("create 3d") || lower.includes("model of")) {
      setTimeout(() => {
        addMessage("openclaw", `Routing to Tripo3D for AI-powered 3D generation.`);
        setTimeout(() => generateFromText(command), 500);
      }, 500);
    } else if (lower.includes("http") && (lower.includes(".jpg") || lower.includes(".png") || lower.includes(".jpeg") || lower.includes(".webp"))) {
      const urlMatch = command.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        setTimeout(() => {
          addMessage("openclaw", `Image URL detected. Sending to Tripo3D for 3D reconstruction.`);
          setTimeout(() => generateFromImage(urlMatch[1]), 500);
        }, 500);
      }
    } else if (lower.includes("scan") || lower.includes("map") || lower.includes("airbnb")) {
      setTimeout(() => {
        addMessage("openclaw", `Preparing scan mission for interior mapping.`);
        setTimeout(() => simulateScan(), 1000);
      }, 500);
    } else if (lower.includes("tour") || lower.includes("360") || lower.includes("walk")) {
      setViewMode("tour");
      addMessage("openclaw", "Opening immersive virtual tour. Drag to look around, click glowing arrows to navigate.");
    } else if (lower.includes("show model") || lower.includes("view model")) {
      if (modelUrl) { setViewMode("model"); addMessage("openclaw", "Switching to 3D model view."); }
      else addMessage("openclaw", "No 3D model yet. Try 'scan the cafe for social media' to generate one.");
    } else if (lower.includes("show pointcloud") || lower.includes("show scan")) {
      setViewMode("pointcloud"); addMessage("openclaw", "Switching to point cloud view.");
    } else if (lower.includes("status") || lower.includes("battery") || lower.includes("check")) {
      setTimeout(() => {
        addMessage("openclaw", `Drone: Battery ${telemetry.battery.toFixed(0)}% | Signal ${telemetry.signal}% | ${telemetry.droneStatus}`);
        if (activeTaskId) addMessage("openclaw", `Tripo3D: ${activeTaskId.substring(0, 16)}... | ${taskStatusQuery.data?.status ?? "polling"} | ${Math.round((taskStatusQuery.data?.progress ?? 0) * 100)}%`);
      }, 500);
    } else if (lower.includes("help")) {
      setTimeout(() => {
        addMessage("openclaw",
          "Available commands:\n" +
          "• 'Scan the cafe for my social media' — immersive virtual tour + 3D model\n" +
          "• 'Scan [room] for Airbnb' — interior mapping scan\n" +
          "• 'Generate 3D model of [description]' — text-to-3D via Tripo3D\n" +
          "• Paste an image URL — image-to-3D conversion\n" +
          "• 'Tour' / '360' — open virtual tour\n" +
          "• 'Show model' / 'Show pointcloud' — switch viewport\n" +
          "• 'Status' — check drone & task status\n" +
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
        addMessage("openclaw", `I understand you said "${command}".\nTry: 'scan the cafe for social media', 'generate 3D model of [description]', or 'help'.`);
      }, 500);
    }
  }, [addMessage, simulateCafeScan, simulateScan, generateFromText, generateFromImage, telemetry, activeTaskId, taskStatusQuery.data, modelUrl]);

  const viewportLabel =
    viewMode === "model" ? "3D Viewport | Tripo3D Model" :
    viewMode === "tour" ? "Immersive Virtual Tour | Cafe" :
    "3D Viewport | Point Cloud";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Mission Control Header */}
      <div className="pt-14 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Mission Control</h1>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">OpenClaw + DJI Mavic Air 1 + Tripo3D | Real-time Drone Operations & 3D Generation</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View mode toggle */}
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
                <Map size={12} className="inline mr-1" />TOUR
              </button>
              <button
                onClick={() => setViewMode("model")}
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${viewMode === "model" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Box size={12} className="inline mr-1" />3D MODEL
              </button>
            </div>

            {(modelUrl || viewMode === "tour") && (
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
              isGenerating ? "bg-purple-500/10 text-purple-400 border border-purple-500/30" :
              telemetry.droneStatus === "processing" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
              "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}>
              {isScanning ? "SCANNING" : isGenerating ? "GENERATING 3D" : telemetry.droneStatus === "processing" ? "PROCESSING" : "STANDBY"}
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
            {/* Header — only for non-tour modes (tour has its own header) */}
            {viewMode !== "tour" && (
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">{viewportLabel}</span>
                <div className="flex items-center gap-2 pointer-events-auto">
                  {isScanning && <span className="font-mono text-[10px] text-amber-400 animate-pulse">SCANNING {scanProgress}%</span>}
                  {isGenerating && (
                    <span className="font-mono text-[10px] text-purple-400 animate-pulse">
                      GENERATING {taskStatusQuery.data ? `${Math.round((taskStatusQuery.data.progress ?? 0) * 100)}%` : "..."}
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
            )}

            {/* Viewport content */}
            {viewMode === "tour" ? (
              <VirtualTour initialId={5} />
            ) : viewMode === "model" && modelUrl ? (
              <ModelViewer modelUrl={modelUrl} posterUrl={renderedImage ?? undefined} className="w-full h-full" />
            ) : (
              <PointCloudViewer className="w-full h-full" isScanning={isScanning} scanProgress={scanProgress} />
            )}

            {/* Footer — only for non-tour modes */}
            {viewMode !== "tour" && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {viewMode === "model" && modelUrl
                    ? "Tripo3D GLB Model | Drag to rotate, scroll to zoom"
                    : `Points: ${isScanning ? Math.floor(scanProgress * 238.47) : "23,847"} | Drag to rotate`}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {viewMode === "model" ? "model-viewer" : `Three.js r${THREE.REVISION || "183"}`}
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
