/**
 * Navbar - Top navigation bar
 * Design: Mission Control status bar with live indicators
 */
import { Link, useLocation } from "wouter";
import { Radar, LayoutDashboard, Info, Github } from "lucide-react";
import StatusIndicator from "./StatusIndicator";

export default function Navbar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Home", icon: Radar },
    { href: "/dashboard", label: "Mission Control", icon: LayoutDashboard },
    { href: "/how-it-works", label: "Architecture", icon: Info },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy-deep/90 backdrop-blur-md border-b border-border">
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-md bg-cyan/10 border border-cyan/30 flex items-center justify-center group-hover:bg-cyan/20 transition-colors">
            <Radar size={18} className="text-cyan" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold tracking-wide text-foreground">OpenClaw<span className="text-cyan">3D</span></span>
            <span className="font-mono text-[8px] tracking-widest text-muted-foreground uppercase">Drone Scanner</span>
          </div>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-xs tracking-wide transition-all ${
                location === href
                  ? "bg-cyan/10 text-cyan border border-cyan/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-4">
          <StatusIndicator status="online" label="GATEWAY" />
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </nav>
  );
}
