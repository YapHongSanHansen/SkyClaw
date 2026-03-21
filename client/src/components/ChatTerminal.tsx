/**
 * ChatTerminal - OpenClaw command interface
 * Design: Terminal-style monospace interface with cyan accents
 * Simulates the Telegram/OpenClaw chat interaction
 */
import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "system" | "openclaw";
  text: string;
  timestamp: string;
}

interface ChatTerminalProps {
  onCommand?: (command: string) => void;
  messages: Message[];
  className?: string;
}

export default function ChatTerminal({ onCommand, messages, className = "" }: ChatTerminalProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onCommand?.(input.trim());
    setInput("");
  };

  const roleColors = {
    user: "text-amber-alert",
    system: "text-muted-foreground",
    openclaw: "text-cyan",
  };

  const roleLabels = {
    user: "YOU",
    system: "SYS",
    openclaw: "OPENCLAW",
  };

  return (
    <div className={`flex flex-col bg-navy-deep/80 glow-border rounded-lg overflow-hidden ${className}`}>
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-navy-mid/50">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-ok shadow-[0_0_6px_oklch(0.76_0.177_155.067)]" />
        <span className="font-mono text-xs tracking-wider text-cyan uppercase">OpenClaw Terminal</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">v2.1.0 | Telegram Bridge Active</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] font-bold tracking-wider ${roleColors[msg.role]}`}>
                [{roleLabels[msg.role]}]
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{msg.timestamp}</span>
            </div>
            <p className={`font-mono text-sm leading-relaxed pl-2 border-l-2 ${
              msg.role === "openclaw" ? "border-cyan/30 text-foreground" :
              msg.role === "user" ? "border-amber-alert/30 text-foreground" :
              "border-muted-foreground/20 text-muted-foreground"
            }`}>
              {msg.text}
            </p>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-border bg-navy-mid/30">
        <span className="font-mono text-xs text-cyan">{">"}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command... (e.g., 'Scan the living room for Airbnb')"
          className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        <button
          type="submit"
          className="p-1.5 rounded-md hover:bg-cyan/10 text-cyan transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
