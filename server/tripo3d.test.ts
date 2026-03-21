import { describe, expect, it } from "vitest";

describe("Tripo3D API Key Validation", () => {
  it("should have TRIPO3D_API_KEY set in environment", () => {
    const apiKey = process.env.TRIPO3D_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(apiKey!.startsWith("tsk_")).toBe(true);
  });

  it("should be able to reach Tripo3D API with the key", async () => {
    const apiKey = process.env.TRIPO3D_API_KEY;
    const response = await fetch("https://api.tripo3d.ai/v2/openapi/task/nonexistent-task-id", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });
    // We expect a 404 (task not found) rather than 401 (unauthorized)
    // This proves the API key is valid
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
