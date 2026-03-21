/**
 * StatusIndicator - Glowing status dot with label
 * Design: Mission Control aerospace aesthetic
 */

interface StatusIndicatorProps {
  status: "online" | "offline" | "scanning" | "warning" | "processing";
  label: string;
  value?: string;
  className?: string;
}

const statusColors = {
  online: "bg-emerald-ok",
  offline: "bg-red-500",
  scanning: "bg-cyan",
  warning: "bg-amber-alert",
  processing: "bg-cyan",
};

const statusGlow = {
  online: "shadow-[0_0_8px_oklch(0.76_0.177_155.067)]",
  offline: "shadow-[0_0_8px_oklch(0.65_0.2_25)]",
  scanning: "shadow-[0_0_8px_oklch(0.78_0.154_194.769)]",
  warning: "shadow-[0_0_8px_oklch(0.82_0.165_84.429)]",
  processing: "shadow-[0_0_8px_oklch(0.78_0.154_194.769)]",
};

export default function StatusIndicator({ status, label, value, className = "" }: StatusIndicatorProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status]} ${statusGlow[status]}`} />
        {(status === "scanning" || status === "processing") && (
          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${statusColors[status]} animate-ping opacity-75`} />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        {value && <span className="text-xs font-mono text-foreground">{value}</span>}
      </div>
    </div>
  );
}
