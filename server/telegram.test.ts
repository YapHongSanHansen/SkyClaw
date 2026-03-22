import { describe, it, expect } from "vitest";

describe("Telegram Bot Token Validation", () => {
  it("should have TELEGRAM_BOT_TOKEN set in environment", () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);
    // Telegram tokens follow the pattern: <bot_id>:<hash>
    expect(token).toMatch(/^\d+:[A-Za-z0-9_-]+$/);
  });

  it("should validate the token with Telegram API (getMe)", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toBeDefined();
    expect(data.result.is_bot).toBe(true);
    console.log(`Bot username: @${data.result.username}`);
  });
});
