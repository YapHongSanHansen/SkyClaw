/**
 * Telegram bot status checker for the frontend dashboard.
 * Returns whether the bot is connected and its username.
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

export async function getTelegramBotStatus(): Promise<{
  connected: boolean;
  username: string | null;
  firstName: string | null;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { connected: false, username: null, firstName: null };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.ok) {
      return {
        connected: true,
        username: data.result.username ?? null,
        firstName: data.result.first_name ?? null,
      };
    }
    return { connected: false, username: null, firstName: null };
  } catch {
    return { connected: false, username: null, firstName: null };
  }
}
