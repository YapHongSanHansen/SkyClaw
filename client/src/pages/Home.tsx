/**
 * Home - Landing page for OpenClaw Drone 3D Scanner
 * Design: Mission Control / Aerospace Command Center
 * Dark background, cyan accents, immersive hero with generated imagery
 */
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Radar, ArrowRight, Scan, Brain, Box, Building2, Gamepad2, GraduationCap, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/hero-drone-scanning-HkzRXqzQusFS5e38vdyeKA.webp";
const POINTCLOUD_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/3d-pointcloud-room-LtMea6jGnBHeWZ5RnnSuhZ.webp";
const FLIGHTPATH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328986460/MFw4EaEo6cHsQkkfMQCXGv/drone-flight-path-LS7BMxW87swetPrtX6EdJW.webp";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0, 0, 0.2, 1] as const }
  }),
};

const useCases = [
  { icon: Building2, title: "Airbnb & Real Estate", desc: "Create immersive 3D tours for property listings. Guests see exactly what they're booking." },
  { icon: Gamepad2, title: "Gaming & VR", desc: "Scan real rooms and import them as 3D environments for game development and VR experiences." },
  { icon: GraduationCap, title: "Schools & Campuses", desc: "Virtual campus tours for prospective students. Map classrooms, labs, and facilities." },
  { icon: Box, title: "Restaurants & Retail", desc: "Let customers explore your space before visiting. Interior mapping for renovation planning." },
];

const steps = [
  { num: "01", title: "Command", desc: "Tell OpenClaw what to scan via Telegram. Natural language, no technical knowledge needed." },
  { num: "02", title: "Fly", desc: "Drone autonomously executes a pre-programmed scanning route through the space." },
  { num: "03", title: "Capture", desc: "50-100 high-resolution images captured at calculated waypoints for optimal coverage." },
  { num: "04", title: "Process", desc: "Photogrammetry engine (COLMAP) reconstructs the space into a 3D point cloud model." },
  { num: "05", title: "Deliver", desc: "Interactive 3D model link sent back to your Telegram. Share it with anyone." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-14">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/60" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div className="space-y-8">
            <motion.div
              initial="hidden" animate="visible" custom={0} variants={fadeUp}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan/20 bg-cyan/5"
            >
              <div className="w-2 h-2 rounded-full bg-cyan animate-pulse-glow" />
              <span className="font-mono text-xs text-cyan tracking-wider">HACKATHON PROJECT 2026</span>
            </motion.div>

            <motion.h1
              initial="hidden" animate="visible" custom={1} variants={fadeUp}
              className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
            >
              Scan Any Space.
              <br />
              <span className="text-cyan glow-text">Build 3D Models.</span>
              <br />
              <span className="text-muted-foreground text-4xl sm:text-5xl lg:text-5xl">With Just a Command.</span>
            </motion.h1>

            <motion.p
              initial="hidden" animate="visible" custom={2} variants={fadeUp}
              className="text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              OpenClaw + DJI Mavic Air 1 + Photogrammetry. Tell your AI assistant to scan a room via Telegram, and get back an interactive 3D point cloud model in minutes. No expertise required.
            </motion.p>

            <motion.div
              initial="hidden" animate="visible" custom={3} variants={fadeUp}
              className="flex flex-wrap gap-4"
            >
              <Link href="/dashboard">
                <Button size="lg" className="bg-cyan text-background hover:bg-cyan/90 font-mono tracking-wider gap-2 px-6">
                  <Radar size={18} />
                  Launch Mission Control
                  <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline" className="border-cyan/30 text-cyan hover:bg-cyan/10 font-mono tracking-wider gap-2">
                  <Scan size={18} />
                  How It Works
                </Button>
              </Link>
            </motion.div>

            {/* Tech stack badges */}
            <motion.div
              initial="hidden" animate="visible" custom={4} variants={fadeUp}
              className="flex flex-wrap gap-2 pt-4"
            >
              {["OpenClaw", "ChatGPT / Codex", "DJI Mavic Air 1", "COLMAP", "Three.js", "Telegram"].map((tech) => (
                <span key={tech} className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 font-mono text-[10px] text-muted-foreground tracking-wider uppercase">
                  {tech}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right: Floating images */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="relative hidden lg:block"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-cyan/5 rounded-2xl blur-3xl" />
              <img
                src={POINTCLOUD_IMG}
                alt="3D Point Cloud Visualization"
                className="relative rounded-xl glow-border-active w-full"
              />
              {/* Floating flight path card */}
              <div className="absolute -bottom-8 -left-8 w-48 rounded-lg overflow-hidden glow-border animate-float">
                <img src={FLIGHTPATH_IMG} alt="Drone Flight Path" className="w-full" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground">
          <span className="font-mono text-[10px] tracking-widest uppercase">Scroll</span>
          <ChevronDown size={16} className="animate-bounce" />
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp}
            className="text-center mb-16"
          >
            <span className="font-mono text-xs text-cyan tracking-widest uppercase">Target Markets</span>
            <h2 className="font-display text-4xl font-bold mt-3 mb-4">Who Needs 3D Interior Mapping?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Every industry that deals with physical spaces can benefit from autonomous 3D scanning. Here are the markets we are targeting.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((uc, i) => (
              <motion.div
                key={uc.title}
                initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}
                className="group p-6 rounded-xl bg-card/50 border border-border hover:border-cyan/30 hover:bg-cyan/5 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center mb-4 group-hover:bg-cyan/20 transition-colors">
                  <uc.icon size={22} className="text-cyan" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{uc.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{uc.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline Steps */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp}
            className="text-center mb-16"
          >
            <span className="font-mono text-xs text-cyan tracking-widest uppercase">The Pipeline</span>
            <h2 className="font-display text-4xl font-bold mt-3 mb-4">From Voice Command to 3D Model</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Five steps. Fully automated. The user only needs to speak or type a command.
            </p>
          </motion.div>

          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}
                className="flex items-start gap-6 py-8 border-b border-border last:border-0 group"
              >
                <span className="font-mono text-3xl font-bold text-cyan/20 group-hover:text-cyan/60 transition-colors shrink-0 w-16">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-display text-xl font-semibold mb-1 group-hover:text-cyan transition-colors">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-[800px] mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0} variants={fadeUp}>
            <Brain size={48} className="text-cyan mx-auto mb-6" />
            <h2 className="font-display text-4xl font-bold mb-4">Try the Mission Control</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              See the full prototype in action. Command the drone, watch it scan, and explore the 3D model in real-time.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="bg-cyan text-background hover:bg-cyan/90 font-mono tracking-wider gap-2 px-8">
                <Radar size={18} />
                Open Mission Control
                <ArrowRight size={16} />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Radar size={16} className="text-cyan" />
            <span className="font-mono text-xs text-muted-foreground">OpenClaw3D Drone Scanner</span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
            HACKATHON 2026 | OpenClaw + DJI Mavic Air 1 + COLMAP + Three.js
          </span>
        </div>
      </footer>
    </div>
  );
}
