/**
 * Dashboard - Mission Control page
 * Design: Split-panel command center
 * Left: Chat terminal | Center: 3D viewport | Right: Telemetry
 * Now with Tripo3D integration for real 3D model generation
 * and 360° panorama viewer for cafe scan demo
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
import PanoramaViewer, { CAFE_PANORAMAS } from "@/components/PanoramaViewer";
import { Maximize2, Minimize2, Box, Scan, Camera, Share2, Download, Copy, Check } from "lucide-react";

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

// Detect if a command is a cafe/social media scan request
function isCafeScanCommand(lower: string): boolean {
  const cafeTriggers = ["cafe", "coffee shop", "restaurant", "social media", "instagram", "post", "share"];
  const scanTriggers = ["scan", "map", "capture", "shoot", "record", "photograph"];
  const hasCafeTrigger = cafeTriggers.some((t) => lower.includes(t));
  const hasScanTrigger = scanTriggers.some((t) => lower.includes(t));
  return hasCafeTrigger || (hasScanTrigger && hasCafeTrigger);
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tripo3D state - persist taskId to localStorage so polling survives page refresh
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => {
    return localStorage.getItem('tripo_active_task_id');
  });
  const [modelUrl, setModelUrl] = useState<string | null>(() => localStorage.getItem('tripo_model_url'));
  const [renderedImage, setRenderedImage] = useState<string | null>(() => localStorage.getItem('tripo_rendered_image'));
  const [viewMode, setViewMode] = useState<"pointcloud" | "model" | "panorama">(() => {
    const saved = localStorage.getItem('tripo_view_mode');
    if (saved === 'model') return 'model';
    if (saved === 'panorama') return 'panorama';
    return 'pointcloud';
  });
  const [isGenerating, setIsGenerating] = useState(false);

  // Social media share state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync state to localStorage
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

  // tRPC mutations
  const textToModelMutation = trpc.tripo.textToModel.useMutation();
  const imageToModelMutation = trpc.tripo.imageToModel.useMutation();
  const proxyModelMutation = trpc.tripo.proxyModel.useMutation();

  // Task polling
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

  // Watch for task completion
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

  // Generate 3D model from text prompt via Tripo3D
  const generateFromText = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    addMessage("openclaw", `Sending to Tripo3D: "${prompt}"\nThis typically takes 30-90 seconds...`);
    try {
      const result = await textToModelMutation.mutateAsync({ prompt });
      setActiveTaskId(result.taskId);
      addMessage("system", `Task queued: ${result.taskId.substring(0, 16)}... Polling for results.`);
    } catch (err: unknown) {
      setIsGenerating(false);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      addMessage("openclaw", `Failed to start generation: ${errorMsg}`);
    }
  }, [addMessage, textToModelMutation]);

  // Generate 3D model from image URL via Tripo3D
  const generateFromImage = useCallback(async (imageUrl: string) => {
    setIsGenerating(true);
    addMessage("openclaw", `Processing image for 3D reconstruction...\nThis typically takes 30-90 seconds...`);
    try {
      const result = await imageToModelMutation.mutateAsync({ imageUrl });
      setActiveTaskId(result.taskId);
      addMessage("system", `Task queued: ${result.taskId.substring(0, 16)}... Polling for results.`);
    } catch (err: unknown) {
      setIsGenerating(false);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      addMessage("openclaw", `Failed to start generation: ${errorMsg}`);
    }
  }, [addMessage, imageToModelMutation]);

  // Cafe scan simulation — shows panoramas then generates 3D from best image
  const simulateCafeScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.8, speed: 0.6 }));

    addMessage("openclaw", "Acknowledged. Initiating cafe scan sequence...\nDrone will fly a 360° sweep capturing panoramic views.");
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 600);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.8m. Entering cafe airspace."), 1800);
    setTimeout(() => addMessage("openclaw", `Executing panoramic sweep. Capturing ${CAFE_PANORAMAS.length} panoramic shots at key positions.`), 2800);

    let progress = 0;
    let waypoint = 0;
    let seconds = 0;

    scanIntervalRef.current = setInterval(() => {
      progress += 3;
      seconds += 1;
      if (progress % 14 === 0) {
        waypoint = Math.min(waypoint + 1, CAFE_PANORAMAS.length);
        const pano = CAFE_PANORAMAS[waypoint - 1];
        if (pano) {
          addMessage("system", `Waypoint ${waypoint}/${CAFE_PANORAMAS.length}: ${pano.label} — captured.`);
        }
      }

      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = (seconds % 60).toString().padStart(2, "0");

      setScanProgress(Math.min(progress, 100));
      setTelemetry((t) => ({
        ...t,
        scanProgress: Math.min(progress, 100),
        currentWaypoint: waypoint,
        imagesCaptures: waypoint * 3 + Math.floor(Math.random() * 2),
        battery: Math.round(Math.max(t.battery - 0.4, 20)),
        altitude: 1.8 + Math.sin(progress * 0.04) * 0.4,
        speed: 0.4 + Math.random() * 0.4,
        flightTime: `${mins}:${secs}`,
        totalWaypoints: CAFE_PANORAMAS.length,
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
          currentWaypoint: CAFE_PANORAMAS.length,
          imagesCaptures: CAFE_PANORAMAS.length * 3 + 4,
        }));

        addMessage("system", `Scan complete. ${CAFE_PANORAMAS.length * 3 + 4} images captured across ${CAFE_PANORAMAS.length} waypoints.`);
        addMessage("openclaw", "Panoramic scan complete! Loading 360° viewer...");

        setTimeout(() => {
          setViewMode("panorama");
          addMessage("openclaw", `All ${CAFE_PANORAMAS.length} panoramic views loaded.\n\n📸 You can:\n• Drag to look around in 360°\n• Click thumbnails to switch views\n• Press GEN 3D to create a 3D model from any view\n• Download individual frames for social media\n\nGenerating 3D model from best capture...`);
          setTelemetry((t) => ({ ...t, droneStatus: "online" }));

          // Auto-trigger 3D generation from the main hall panorama (best for 3D)
          setTimeout(() => {
            const bestPano = CAFE_PANORAMAS[4]; // Main Hall — Full View
            generateFromImage(bestPano.url);
          }, 1500);
        }, 1500);
      }
    }, 300);
  }, [addMessage, generateFromImage]);

  const simulateScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setViewMode("pointcloud");
    setTelemetry((t) => ({ ...t, droneStatus: "scanning", altitude: 1.5, speed: 0.8 }));

    addMessage("openclaw", "Acknowledged. Initiating scan sequence...");
    setTimeout(() => addMessage("system", "Drone armed. Motors spinning up."), 800);
    setTimeout(() => addMessage("system", "Takeoff complete. Altitude: 1.5m"), 2000);
    setTimeout(() => addMessage("openclaw", "Executing waypoint mission. 16 waypoints loaded."), 3000);

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

  const handleCopyShare = useCallback(() => {
    const url = shareUrl ?? modelUrl ?? CAFE_PANORAMAS[0].url;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl, modelUrl]);

  const handleCommand = useCallback((command: string) => {
    addMessage("user", command);
    const lower = command.toLowerCase();

    // Cafe / social media scan — highest priority
    if (isCafeScanCommand(lower) || lower.includes("scan the cafe") || lower.includes("scan cafe")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood! Scanning the cafe for social media content.\nDrone will capture 360° panoramic views of all key areas.`);
        setTimeout(() => simulateCafeScan(), 800);
      }, 400);
    }
    // Generate 3D model from text
    else if (lower.includes("generate") || lower.includes("create 3d") || lower.includes("model of")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood. Parsing command: "${command}". Routing to Tripo3D for AI-powered 3D generation.`);
        setTimeout(() => generateFromText(command), 500);
      }, 500);
    }
    // Generate from image URL
    else if (lower.includes("http") && (lower.includes(".jpg") || lower.includes(".png") || lower.includes(".jpeg") || lower.includes(".webp"))) {
      const urlMatch = command.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        setTimeout(() => {
          addMessage("openclaw", `Image URL detected. Sending to Tripo3D for 3D reconstruction.`);
          setTimeout(() => generateFromImage(urlMatch[1]), 500);
        }, 500);
      }
    }
    // Generic scan commands (non-cafe)
    else if (lower.includes("scan") || lower.includes("map") || lower.includes("airbnb")) {
      setTimeout(() => {
        addMessage("openclaw", `Understood. Parsing command: "${command}". Preparing scan mission for interior mapping.`);
        setTimeout(() => simulateScan(), 1000);
      }, 500);
    }
    // Show panorama
    else if (lower.includes("panorama") || lower.includes("360") || lower.includes("show cafe")) {
      setViewMode("panorama");
      addMessage("openclaw", "Switching to 360° panorama view. Drag to look around.");
    }
    // Switch view mode
    else if (lower.includes("show model") || lower.includes("view model")) {
      if (modelUrl) {
        setViewMode("model");
        addMessage("openclaw", "Switching to 3D model view.");
      } else {
        addMessage("openclaw", "No 3D model available yet. Try 'scan the cafe for social media' to generate one.");
      }
    }
    else if (lower.includes("show pointcloud") || lower.includes("view pointcloud") || lower.includes("show scan")) {
      setViewMode("pointcloud");
      addMessage("openclaw", "Switching to point cloud view.");
    }
    // Status
    else if (lower.includes("status") || lower.includes("battery") || lower.includes("check")) {
      setTimeout(() => {
        addMessage("openclaw", `Drone Status: Battery ${telemetry.battery.toFixed(0)}% | Signal ${telemetry.signal}% | Temp ${telemetry.temperature}°C | Status: ${telemetry.droneStatus}`);
        if (activeTaskId) {
          addMessage("openclaw", `Tripo3D Task: ${activeTaskId.substring(0, 16)}... | Status: ${taskStatusQuery.data?.status ?? "polling..."} | Progress: ${Math.round((taskStatusQuery.data?.progress ?? 0) * 100)}%`);
        }
      }, 500);
    }
    // Help
    else if (lower.includes("help")) {
      setTimeout(() => {
        addMessage("openclaw", "Available commands:\n• 'Scan the cafe for my social media' — 360° panoramic scan + 3D model\n• 'Scan [room] for Airbnb' — Interior mapping scan\n• 'Generate 3D model of [description]' — Text-to-3D via Tripo3D\n• Paste an image URL — Image-to-3D conversion\n• 'Show panorama' — View 360° cafe scan\n• 'Show model' / 'Show pointcloud' — Switch viewport\n• 'Status' — Check drone & task status\n• 'Stop' — Abort current mission");
      }, 500);
    }
    // Stop
    else if (lower.includes("stop") || lower.includes("abort")) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        setIsScanning(false);
        setTelemetry((t) => ({ ...t, droneStatus: "online", speed: 0 }));
        addMessage("openclaw", "Mission aborted. Drone returning to home position.");
      } else {
        addMessage("openclaw", "No active mission to abort.");
      }
    }
    // Default
    else {
      setTimeout(() => {
        addMessage("openclaw", `I understand you said "${command}". I can help with:\n• 'Scan the cafe for social media' — full 360° scan\n• 'Generate 3D model of [description]'\n• 'Scan [room] for Airbnb'\nType 'help' for all commands.`);
      }, 500);
    }
  }, [addMessage, simulateCafeScan, simulateScan, generateFromText, generateFromImage, telemetry, activeTaskId, taskStatusQuery.data, modelUrl]);

  const viewportLabel = viewMode === "model"
    ? "3D Viewport | Tripo3D Model"
    : viewMode === "panorama"
    ? "360° Panorama | Cafe Scan"
    : "3D Viewport | Point Cloud";

  const viewportFooter = viewMode === "model" && modelUrl
    ? "Tripo3D GLB Model | Drag to rotate, scroll to zoom"
    : viewMode === "panorama"
    ? "360° Panoramic Scan | Drag to look around • Click thumbnails to switch views"
    : `Points: ${isScanning ? Math.floor(scanProgress * 238.47) : "23,847"} | Drag to rotate`;

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
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${
                  viewMode === "pointcloud" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Scan size={12} className="inline mr-1" />
                SCAN
              </button>
              <button
                onClick={() => setViewMode("panorama")}
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${
                  viewMode === "panorama" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Camera size={12} className="inline mr-1" />
                360°
              </button>
              <button
                onClick={() => setViewMode("model")}
                className={`px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-colors ${
                  viewMode === "model" ? "bg-cyan/20 text-cyan" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Box size={12} className="inline mr-1" />
                3D MODEL
              </button>
            </div>

            {/* Share button — visible when we have a model or panorama */}
            {(modelUrl || viewMode === "panorama") && (
              <button
                onClick={handleCopyShare}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan/10 border border-cyan/30 text-cyan font-mono text-[10px] tracking-wider hover:bg-cyan/20 transition-colors"
                title="Copy share link"
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
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
              <span className="font-mono text-[10px] text-cyan tracking-widest uppercase">
                {viewportLabel}
              </span>
              <div className="flex items-center gap-2 pointer-events-auto">
                {isScanning && (
                  <span className="font-mono text-[10px] text-amber-400 animate-pulse">
                    SCANNING {scanProgress}%
                  </span>
                )}
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

            {/* Viewport content */}
            {viewMode === "panorama" ? (
              <PanoramaViewer
                onGenerateModel={(imageUrl) => {
                  addMessage("user", `Generate 3D model from this panoramic view`);
                  addMessage("openclaw", "Sending panoramic image to Tripo3D for 3D reconstruction...");
                  generateFromImage(imageUrl);
                }}
              />
            ) : viewMode === "model" && modelUrl ? (
              <ModelViewer
                modelUrl={modelUrl}
                posterUrl={renderedImage ?? undefined}
                className="w-full h-full"
              />
            ) : (
              <PointCloudViewer
                className="w-full h-full"
                isScanning={isScanning}
                scanProgress={scanProgress}
              />
            )}

            {/* Viewport footer — only show for non-panorama modes (panorama has its own UI) */}
            {viewMode !== "panorama" && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                <span className="font-mono text-[10px] text-muted-foreground">{viewportFooter}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {viewMode === "model" ? "model-viewer" : `Three.js r${THREE.REVISION || "183"}`}
                </span>
              </div>
            )}
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
