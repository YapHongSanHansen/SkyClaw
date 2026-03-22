/**
 * SkyClaw Telegram Bot Integration
 *
 * A real Telegram bot that responds to scan commands, sends simulated
 * drone telemetry updates, and links users to the web dashboard.
 *
 * Commands:
 *   /start  — Welcome message with bot overview
 *   /scan   — Start a simulated room scan with live telemetry
 *   /status — Check drone status
 *   /help   — List all commands
 *
 * Also responds to natural language like "scan the room for Airbnb"
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

// Track active scans to prevent overlapping
const activeScans = new Map<number, boolean>();

// Store the last scan result per chat for /status
const lastScanResults = new Map<
  number,
  { timestamp: number; images: number; points: number }
>();

// Dashboard URL — will be set when server starts
let dashboardUrl = "";

export function setDashboardUrl(url: string) {
  dashboardUrl = url;
}

// ── Telegram API helpers ─────────────────────────────────────────────────────

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  options?: { parse_mode?: string; reply_markup?: unknown }
) {
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode ?? "HTML",
      reply_markup: options?.reply_markup,
    }),
  });
  return res.json();
}

async function sendChatAction(
  token: string,
  chatId: number,
  action: string = "typing"
) {
  await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function handleStart(token: string, chatId: number) {
  const msg = `🛸 <b>SkyClaw 3D Drone Scanner</b>

Welcome to OpenClaw Mission Control.

I can command a DJI Mavic Air 1 to autonomously scan any interior space and generate an interactive 3D point cloud model.

<b>Commands:</b>
/scan — Start a room scan
/status — Check drone status
/help — All commands

Or just tell me what to scan:
<i>"Scan the living room for Airbnb"</i>
<i>"Scan the cafe for social media"</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🚀 Start Scan", callback_data: "scan" },
        { text: "📊 Dashboard", url: dashboardUrl || "https://openclaw3d.manus.space/dashboard" },
      ],
    ],
  };

  await sendMessage(token, chatId, msg, { reply_markup: keyboard });
}

async function handleHelp(token: string, chatId: number) {
  const msg = `📋 <b>SkyClaw Commands</b>

/start — Welcome & overview
/scan — Start autonomous room scan
/status — Drone & last scan status
/help — This message

<b>Natural language:</b>
• "Scan the bedroom for Airbnb"
• "Map the office for VR"
• "Scan the restaurant"

<b>Tech Stack:</b>
OpenClaw + DJI Mavic Air 1 + COLMAP + Three.js`;

  await sendMessage(token, chatId, msg);
}

async function handleStatus(token: string, chatId: number) {
  const lastScan = lastScanResults.get(chatId);
  const isScanning = activeScans.get(chatId) ?? false;

  let scanInfo = "No scans completed yet.";
  if (lastScan) {
    const ago = Math.round((Date.now() - lastScan.timestamp) / 1000);
    const agoStr =
      ago < 60
        ? `${ago}s ago`
        : ago < 3600
          ? `${Math.round(ago / 60)}m ago`
          : `${Math.round(ago / 3600)}h ago`;
    scanInfo = `Last scan: ${agoStr}
📸 ${lastScan.images} images captured
☁️ ${lastScan.points.toLocaleString()} points reconstructed`;
  }

  const msg = `📡 <b>Drone Status</b>

🟢 <b>Status:</b> ${isScanning ? "SCANNING" : "STANDBY"}
🔋 Battery: 87%
📶 Signal: Strong
🌡️ Temp: 24°C
🛰️ GPS: Locked

<b>Last Scan:</b>
${scanInfo}`;

  await sendMessage(token, chatId, msg);
}

async function handleScan(
  token: string,
  chatId: number,
  purpose: string = "interior mapping"
) {
  if (activeScans.get(chatId)) {
    await sendMessage(
      token,
      chatId,
      "⚠️ Scan already in progress. Please wait for completion."
    );
    return;
  }

  activeScans.set(chatId, true);

  // Phase 1: Initialization
  await sendChatAction(token, chatId);
  await sendMessage(
    token,
    chatId,
    `🎯 <b>Mission: ${purpose}</b>

Initializing scan sequence...`
  );

  await delay(1500);
  await sendMessage(
    token,
    chatId,
    `⚙️ <b>Pre-flight Check</b>
✅ DJI Mavic Air 1 connected
✅ IMU calibrated
✅ Battery: 87%
✅ GPS lock: 12 satellites
✅ Obstacle avoidance: Active`
  );

  await delay(2000);
  await sendMessage(
    token,
    chatId,
    `🚁 <b>Takeoff</b>
Motors armed. Ascending to 1.5m...
Flight plan: 16 waypoints loaded.`
  );

  // Phase 2: Waypoint scanning with telemetry
  await delay(2000);
  const totalWaypoints = 16;
  const batchSize = 4;

  for (let wp = 1; wp <= totalWaypoints; wp += batchSize) {
    if (!activeScans.get(chatId)) break;

    await sendChatAction(token, chatId, "upload_photo");

    const endWp = Math.min(wp + batchSize - 1, totalWaypoints);
    const pitch = (-2 + Math.random() * -8).toFixed(1);
    const yaw = (-180 + Math.random() * 360).toFixed(1);
    const camPitch = (-20 + Math.random() * -20).toFixed(1);
    const roll = (-3 + Math.random() * 6).toFixed(1);
    const alt = (1.2 + Math.random() * 1.0).toFixed(1);
    const speed = (0.5 + Math.random() * 1.0).toFixed(1);
    const images = endWp * 3;
    const progress = Math.round((endWp / totalWaypoints) * 100);

    const bar = "█".repeat(Math.round(progress / 10)) + "░".repeat(10 - Math.round(progress / 10));

    await sendMessage(
      token,
      chatId,
      `📍 <b>WP ${wp}-${endWp}/${totalWaypoints}</b> [${bar}] ${progress}%

<b>Axis Telemetry:</b>
┌ Pitch: ${pitch}°  |  Yaw: ${yaw}°
└ Cam: ${camPitch}°  |  Roll: ${roll}°

Alt: ${alt}m  |  Speed: ${speed}m/s
📸 ${images} images captured`
    );

    await delay(3000);
  }

  // Phase 3: Processing
  await sendMessage(
    token,
    chatId,
    `✅ <b>Scan Complete</b>
📸 48 images captured across 16 waypoints.
🔄 Processing with COLMAP photogrammetry engine...`
  );

  await delay(3000);
  await sendChatAction(token, chatId);

  const totalPoints = 23847;
  lastScanResults.set(chatId, {
    timestamp: Date.now(),
    images: 48,
    points: totalPoints,
  });

  // Phase 4: Results
  const resultMsg = `🎉 <b>3D Model Ready!</b>

☁️ <b>${totalPoints.toLocaleString()}</b> points reconstructed
📐 Room dimensions: 6.2m × 4.8m × 3.0m
🏠 Purpose: ${purpose}

Open the interactive 3D viewer in your browser:`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🌐 View 3D Model",
          url: dashboardUrl || "https://openclaw3d.manus.space/dashboard",
        },
      ],
      [
        {
          text: "🔄 Scan Again",
          callback_data: "scan",
        },
        {
          text: "🏠 Virtual Tour",
          url: (dashboardUrl || "https://openclaw3d.manus.space/dashboard") + "?tour=1",
        },
      ],
    ],
  };

  await sendMessage(token, chatId, resultMsg, { reply_markup: keyboard });
  activeScans.set(chatId, false);
}

// ── Natural language parsing ─────────────────────────────────────────────────

function parseScanIntent(text: string): string | null {
  const lower = text.toLowerCase();
  const scanPatterns = [
    /scan\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+))?$/i,
    /map\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+))?$/i,
    /capture\s+(?:the\s+)?(.+)/i,
    /photograph\s+(?:the\s+)?(.+)/i,
  ];

  for (const pattern of scanPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const room = match[1]?.trim() || "room";
      const purpose = match[2]?.trim() || "interior mapping";
      return `${room} — ${purpose}`;
    }
  }

  // Simple keyword check
  if (
    lower.includes("scan") ||
    lower.includes("map") ||
    lower.includes("capture")
  ) {
    return "interior mapping";
  }

  return null;
}

// ── Main message handler ─────────────────────────────────────────────────────

async function handleMessage(token: string, message: TelegramMessage) {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  // Command handling
  if (text.startsWith("/start")) {
    await handleStart(token, chatId);
    return;
  }
  if (text.startsWith("/help")) {
    await handleHelp(token, chatId);
    return;
  }
  if (text.startsWith("/status")) {
    await handleStatus(token, chatId);
    return;
  }
  if (text.startsWith("/scan")) {
    const args = text.replace(/^\/scan\s*/, "").trim();
    await handleScan(token, chatId, args || "interior mapping");
    return;
  }

  // Natural language scan detection
  const scanIntent = parseScanIntent(text);
  if (scanIntent) {
    await handleScan(token, chatId, scanIntent);
    return;
  }

  // Default response
  await sendMessage(
    token,
    chatId,
    `🤖 I didn't understand that. Try:
• /scan — Start a room scan
• "Scan the living room for Airbnb"
• /help — See all commands`
  );
}

async function handleCallbackQuery(token: string, callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  if (!chatId) return;

  if (callback.data === "scan") {
    // Answer the callback to remove loading state
    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback.id }),
    });
    await handleScan(token, chatId, "interior mapping");
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: { id: number; first_name: string; username?: string };
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat: { id: number } };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ── Polling loop ─────────────────────────────────────────────────────────────

let pollingActive = false;
let lastUpdateId = 0;

export async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set, bot disabled.");
    return;
  }

  // Verify token
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/getMe`);
    const data = await res.json();
    if (!data.ok) {
      console.error("[Telegram] Invalid bot token:", data.description);
      return;
    }
    console.log(
      `[Telegram] Bot @${data.result.username} connected and listening.`
    );
  } catch (err) {
    console.error("[Telegram] Failed to connect:", err);
    return;
  }

  // Delete any existing webhook to use polling
  await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, { method: "POST" });

  pollingActive = true;
  pollUpdates(token);
}

async function pollUpdates(token: string) {
  while (pollingActive) {
    try {
      const res = await fetch(
        `${TELEGRAM_API}${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`,
        { signal: AbortSignal.timeout(35000) }
      );
      const data = await res.json();

      if (data.ok && data.result?.length > 0) {
        for (const update of data.result as TelegramUpdate[]) {
          lastUpdateId = update.update_id;

          if (update.message) {
            handleMessage(token, update.message).catch((err) =>
              console.error("[Telegram] Error handling message:", err)
            );
          }
          if (update.callback_query) {
            handleCallbackQuery(token, update.callback_query).catch((err) =>
              console.error("[Telegram] Error handling callback:", err)
            );
          }
        }
      }
    } catch (err: unknown) {
      // Timeout is expected with long polling
      if (err instanceof Error && err.name !== "TimeoutError") {
        console.error("[Telegram] Polling error:", err);
        await delay(5000);
      }
    }
  }
}

export function stopTelegramBot() {
  pollingActive = false;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
