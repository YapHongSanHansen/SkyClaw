/**
 * TelemetryPanel - Drone telemetry sidebar
 * Design: Mission Control data readouts with glowing accents
 */
import { Battery, Wifi, Navigation, Thermometer, Camera, HardDrive } from "lucide-react";
import StatusIndicator from "./StatusIndicator";
import { Progress } from "@/components/ui/progress";

interface TelemetryData {
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
}

interface TelemetryPanelProps {
  data: TelemetryData;
  className?: string;
}

export default function TelemetryPanel({ data, className = "" }: TelemetryPanelProps) {
  return (
    <div className={`flex flex-col gap-4 bg-navy-deep/80 glow-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="font-mono text-xs tracking-wider text-cyan uppercase">Drone Telemetry</span>
        <StatusIndicator status={data.droneStatus} label="STATUS" />
      </div>

      {/* Battery */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery size={14} className={data.battery > 20 ? "text-emerald-ok" : "text-destructive"} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Battery</span>
          </div>
          <span className="font-mono text-sm font-bold text-foreground">{data.battery}%</span>
        </div>
        <Progress value={data.battery} className="h-1.5" />
      </div>

      {/* Signal */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Signal</span>
        </div>
        <span className="font-mono text-sm font-bold text-foreground">{data.signal}%</span>
      </div>

      {/* Altitude & Speed */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy-mid/50 rounded-md p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Navigation size={12} className="text-cyan" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Alt</span>
          </div>
          <span className="font-mono text-lg font-bold text-foreground">{data.altitude.toFixed(1)}<span className="text-xs text-muted-foreground ml-0.5">m</span></span>
        </div>
        <div className="bg-navy-mid/50 rounded-md p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Thermometer size={12} className="text-amber-alert" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Temp</span>
          </div>
          <span className="font-mono text-lg font-bold text-foreground">{data.temperature}<span className="text-xs text-muted-foreground ml-0.5">°C</span></span>
        </div>
      </div>

      {/* Scan Progress */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-cyan">Scan Progress</span>
          <span className="font-mono text-sm font-bold text-cyan">{data.scanProgress}%</span>
        </div>
        <Progress value={data.scanProgress} className="h-2" />
      </div>

      {/* Waypoints */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation size={14} className="text-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Waypoint</span>
        </div>
        <span className="font-mono text-sm text-foreground">
          <span className="text-cyan font-bold">{data.currentWaypoint}</span>
          <span className="text-muted-foreground">/{data.totalWaypoints}</span>
        </span>
      </div>

      {/* Images */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera size={14} className="text-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Images</span>
        </div>
        <span className="font-mono text-sm font-bold text-foreground">{data.imagesCaptures}</span>
      </div>

      {/* Flight Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Flight Time</span>
        </div>
        <span className="font-mono text-sm font-bold text-foreground">{data.flightTime}</span>
      </div>

      {/* Speed */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Ground Speed</span>
        <span className="font-mono text-sm font-bold text-foreground">{data.speed.toFixed(1)} <span className="text-xs text-muted-foreground">m/s</span></span>
      </div>
    </div>
  );
}
