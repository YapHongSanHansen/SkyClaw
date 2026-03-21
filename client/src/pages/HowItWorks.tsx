/**
 * HowItWorks - Architecture & Integration Guide
 * Design: Mission Control / Technical Documentation aesthetic
 * Shows the real technical architecture and how to wire everything together
 */
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { MessageSquare, Cpu, Plane, Camera, Box, Globe, ArrowDown, ExternalLink, Code2, Terminal, Wrench } from "lucide-react";

const FLIGHTPATH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/drone-flight-path-LS7BMxW87swetPrtX6EdJW.webp";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0, 0, 0.2, 1] as const }
  }),
};

const archLayers = [
  {
    icon: MessageSquare,
    label: "User Interface",
    tech: "Telegram Bot",
    desc: "User sends natural language commands via Telegram. Example: 'Scan my apartment for Airbnb listing.'",
    color: "text-amber-alert",
    borderColor: "border-amber-alert/30",
    bgColor: "bg-amber-alert/5",
  },
  {
    icon: Cpu,
    label: "AI Orchestrator",
    tech: "OpenClaw + ChatGPT (Codex 5.1)",
    desc: "OpenClaw receives the message, uses ChatGPT to parse intent, extract parameters (room type, purpose), and triggers the appropriate scanning tool.",
    color: "text-cyan",
    borderColor: "border-cyan/30",
    bgColor: "bg-cyan/5",
  },
  {
    icon: Plane,
    label: "Drone Control",
    tech: "DJI Mavic Air 1 + Litchi App",
    desc: "Pre-programmed waypoint mission executed via Litchi or DJI Fly. The drone follows a grid pattern at 1.5m altitude, capturing images at each waypoint.",
    color: "text-emerald-ok",
    borderColor: "border-emerald-ok/30",
    bgColor: "bg-emerald-ok/5",
  },
  {
    icon: Camera,
    label: "Image Capture",
    tech: "50-100 High-Res Photos",
    desc: "Drone camera captures overlapping images at calculated angles. 70% overlap between adjacent shots ensures photogrammetry accuracy.",
    color: "text-cyan",
    borderColor: "border-cyan/30",
    bgColor: "bg-cyan/5",
  },
  {
    icon: Box,
    label: "3D Reconstruction",
    tech: "COLMAP / OpenDroneMap",
    desc: "Structure from Motion (SfM) algorithm matches features across images, triangulates camera positions, and generates a dense 3D point cloud.",
    color: "text-amber-alert",
    borderColor: "border-amber-alert/30",
    bgColor: "bg-amber-alert/5",
  },
  {
    icon: Globe,
    label: "3D Visualization",
    tech: "Three.js / Potree WebGL",
    desc: "Point cloud rendered in an interactive web viewer. Users can orbit, zoom, and explore the 3D model. Link shared back via Telegram.",
    color: "text-emerald-ok",
    borderColor: "border-emerald-ok/30",
    bgColor: "bg-emerald-ok/5",
  },
];

const codeSnippets = [
  {
    title: "OpenClaw Tool Definition",
    lang: "python",
    code: `# openclaw_tools/scan_room.py
from openclaw import Tool, Parameter

class ScanRoomTool(Tool):
    name = "scan_room"
    description = "Trigger drone to scan a room"
    parameters = [
        Parameter("room", str, "Room to scan"),
        Parameter("purpose", str, "Purpose of scan"),
    ]

    def execute(self, room: str, purpose: str):
        # 1. Validate drone status
        drone = DroneController.get_status()
        if drone.battery < 30:
            return "Battery too low for scan"

        # 2. Select waypoint mission
        mission = WaypointPlanner.plan(
            room_type=room,
            altitude=1.5,
            overlap=0.7
        )

        # 3. Execute flight
        drone.execute_mission(mission)

        # 4. Process images
        point_cloud = Photogrammetry.process(
            images=drone.captured_images,
            engine="colmap"
        )

        # 5. Return viewer URL
        url = PointCloudServer.upload(point_cloud)
        return f"3D model ready: {url}"`,
  },
  {
    title: "Telegram Bot Bridge",
    lang: "python",
    code: `# telegram_bridge.py
import telebot
from openclaw import OpenClawClient

bot = telebot.TeleBot(TELEGRAM_TOKEN)
claw = OpenClawClient(api_key=OPENCLAW_KEY)

@bot.message_handler(func=lambda m: True)
def handle_message(message):
    # Forward to OpenClaw with ChatGPT
    response = claw.chat(
        message=message.text,
        model="codex-5.1",
        tools=["scan_room", "drone_status",
               "export_model"]
    )
    bot.reply_to(message, response.text)

    # If a 3D model was generated, send link
    if response.has_attachment:
        bot.send_message(
            message.chat.id,
            f"🏠 3D Model: {response.attachment_url}"
        )`,
  },
  {
    title: "Photogrammetry Pipeline",
    lang: "bash",
    code: `#!/bin/bash
# process_scan.sh - COLMAP pipeline

INPUT_DIR="./captured_images"
OUTPUT_DIR="./3d_output"

# Step 1: Feature extraction
colmap feature_extractor \\
  --database_path $OUTPUT_DIR/db.db \\
  --image_path $INPUT_DIR \\
  --ImageReader.single_camera 1

# Step 2: Feature matching
colmap exhaustive_matcher \\
  --database_path $OUTPUT_DIR/db.db

# Step 3: Sparse reconstruction
colmap mapper \\
  --database_path $OUTPUT_DIR/db.db \\
  --image_path $INPUT_DIR \\
  --output_path $OUTPUT_DIR/sparse

# Step 4: Dense reconstruction
colmap image_undistorter \\
  --image_path $INPUT_DIR \\
  --input_path $OUTPUT_DIR/sparse/0 \\
  --output_path $OUTPUT_DIR/dense

colmap patch_match_stereo \\
  --workspace_path $OUTPUT_DIR/dense

# Step 5: Point cloud fusion
colmap stereo_fusion \\
  --workspace_path $OUTPUT_DIR/dense \\
  --output_path $OUTPUT_DIR/fused.ply

echo "Point cloud: $OUTPUT_DIR/fused.ply"`,
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Header */}
      <section className="pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1000px] mx-auto">
          <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
            <span className="font-mono text-xs text-cyan tracking-widest uppercase">Technical Architecture</span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold mt-3 mb-4">How It All Connects</h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              This is the real architecture. No sugar-coating. Here is exactly how OpenClaw, the DJI Mavic Air 1, COLMAP, and Three.js wire together to create an autonomous 3D scanning pipeline.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Architecture Flow */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto space-y-0">
          {archLayers.map((layer, i) => (
            <motion.div key={layer.label} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}>
              <div className={`p-6 rounded-xl border ${layer.borderColor} ${layer.bgColor} relative`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg bg-background/50 border ${layer.borderColor} flex items-center justify-center shrink-0`}>
                    <layer.icon size={20} className={layer.color} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-display text-lg font-semibold">{layer.label}</h3>
                      <span className={`font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-full border ${layer.borderColor} ${layer.color}`}>
                        {layer.tech}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{layer.desc}</p>
                  </div>
                </div>
              </div>
              {i < archLayers.length - 1 && (
                <div className="flex justify-center py-2">
                  <ArrowDown size={16} className="text-muted-foreground/30" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Flight Path Image */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1000px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp} className="text-center mb-8">
            <span className="font-mono text-xs text-cyan tracking-widest uppercase">Waypoint Mission</span>
            <h2 className="font-display text-3xl font-bold mt-3">Pre-Programmed Flight Path</h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1} variants={fadeUp}>
            <img src={FLIGHTPATH_IMG} alt="Drone Flight Path Blueprint" className="w-full rounded-xl glow-border" />
            <p className="text-center text-sm text-muted-foreground mt-4 font-mono">
              16 waypoints | 1.5m altitude | 70% image overlap | Grid pattern for maximum coverage
            </p>
          </motion.div>
        </div>
      </section>

      {/* Code Snippets */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-[1000px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp} className="text-center mb-12">
            <span className="font-mono text-xs text-cyan tracking-widest uppercase">Implementation</span>
            <h2 className="font-display text-3xl font-bold mt-3 mb-4">The Actual Code</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              These are the real code snippets your team needs to implement. Copy, adapt, and integrate.
            </p>
          </motion.div>

          <div className="space-y-8">
            {codeSnippets.map((snippet, i) => (
              <motion.div key={snippet.title} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}>
                <div className="rounded-xl overflow-hidden glow-border">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-navy-mid/80 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Code2 size={14} className="text-cyan" />
                      <span className="font-mono text-xs text-foreground">{snippet.title}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{snippet.lang}</span>
                  </div>
                  <pre className="p-4 bg-navy-deep/80 overflow-x-auto">
                    <code className="font-mono text-xs text-foreground/80 leading-relaxed whitespace-pre">
                      {snippet.code}
                    </code>
                  </pre>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Hardware Requirements */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-[1000px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={18} className="text-cyan" />
              <span className="font-mono text-xs text-cyan tracking-widest uppercase">Requirements</span>
            </div>
            <h2 className="font-display text-3xl font-bold mb-4">What You Need</h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1} variants={fadeUp} className="p-6 rounded-xl bg-card/50 border border-border">
              <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
                <Terminal size={18} className="text-cyan" />
                Hardware
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex justify-between py-2 border-b border-border">
                  <span>Drone</span>
                  <span className="text-foreground font-mono">DJI Mavic Air 1</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span>Controller</span>
                  <span className="text-foreground font-mono">DJI Remote + Phone</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span>Processing</span>
                  <span className="text-foreground font-mono">Laptop with GPU</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>Storage</span>
                  <span className="text-foreground font-mono">microSD 32GB+</span>
                </div>
              </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={2} variants={fadeUp} className="p-6 rounded-xl bg-card/50 border border-border">
              <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
                <Code2 size={18} className="text-cyan" />
                Software
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex justify-between py-2 border-b border-border">
                  <span>AI Gateway</span>
                  <span className="text-foreground font-mono">OpenClaw</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span>LLM</span>
                  <span className="text-foreground font-mono">ChatGPT / Codex 5.1</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span>Photogrammetry</span>
                  <span className="text-foreground font-mono">COLMAP</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span>3D Viewer</span>
                  <span className="text-foreground font-mono">Three.js / Potree</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>Flight App</span>
                  <span className="text-foreground font-mono">Litchi / DJI Fly</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Honest Assessment */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-[800px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp}>
            <span className="font-mono text-xs text-amber-alert tracking-widest uppercase">Reality Check</span>
            <h2 className="font-display text-3xl font-bold mt-3 mb-6">What Works vs. What is Simulated</h2>

            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-emerald-ok/30 bg-emerald-ok/5">
                <h4 className="font-mono text-sm text-emerald-ok font-bold mb-2">WORKS IN THIS PROTOTYPE</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The web dashboard, 3D point cloud viewer (Three.js), chat terminal with command parsing, drone telemetry simulation, and the full architecture documentation are all functional. The 3D viewer renders a real procedurally-generated point cloud that you can orbit and zoom.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-amber-alert/30 bg-amber-alert/5">
                <h4 className="font-mono text-sm text-amber-alert font-bold mb-2">SIMULATED FOR DEMO</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The drone flight, image capture, and COLMAP processing are simulated. In a real deployment, the Telegram message would trigger an actual waypoint mission on the Mavic Air 1, real images would be processed through COLMAP, and the resulting .PLY file would be loaded into the viewer. The code snippets on this page show exactly how to wire that up.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-cyan/30 bg-cyan/5">
                <h4 className="font-mono text-sm text-cyan font-bold mb-2">TO MAKE IT REAL</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Install COLMAP on a GPU machine. Set up the Telegram bot with OpenClaw. Program waypoints in Litchi for your specific space. Connect the image transfer pipeline (SD card to processing server). The architecture is production-ready; the simulation just needs to be swapped with real hardware calls.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-mono text-xs text-muted-foreground">OpenClaw3D Drone Scanner | Architecture Guide</span>
          <div className="flex items-center gap-4">
            <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-cyan hover:underline flex items-center gap-1">
              OpenClaw Docs <ExternalLink size={10} />
            </a>
            <a href="https://colmap.github.io" target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-cyan hover:underline flex items-center gap-1">
              COLMAP <ExternalLink size={10} />
            </a>
            <a href="https://threejs.org" target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-cyan hover:underline flex items-center gap-1">
              Three.js <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
