/**
 * Tripo3D API Service
 * Handles all communication with the Tripo3D API for 3D model generation.
 * Supports: image-to-model, text-to-model, task polling, and model download.
 */

const TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi";

function getApiKey(): string {
  const key = process.env.TRIPO3D_API_KEY;
  if (!key) throw new Error("TRIPO3D_API_KEY is not set");
  return key;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getApiKey()}`,
  };
}

export interface TripoTaskResponse {
  code: number;
  data: {
    task_id: string;
  };
}

export interface TripoTaskStatus {
  code: number;
  data: {
    task_id: string;
    type: string;
    status: "queued" | "running" | "success" | "failed" | "banned" | "expired" | "cancelled" | "unknown";
    input: Record<string, unknown>;
    output: {
      model?: string;
      base_model?: string;
      pbr_model?: string;
      rendered_image?: string;
      generated_image?: string;
    };
    progress: number;
    create_time: number;
  };
}

/**
 * Generate a 3D model from an image URL.
 */
export async function imageToModel(imageUrl: string): Promise<TripoTaskResponse> {
  const res = await fetch(`${TRIPO_API_BASE}/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "image_to_model",
      model_version: "v3.0-20250812",
      file: {
        type: imageUrl.endsWith(".png") ? "png" : "jpg",
        url: imageUrl,
      },
      texture: true,
      pbr: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tripo3D API error (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<TripoTaskResponse>;
}

/**
 * Generate a 3D model from a text prompt.
 */
export async function textToModel(prompt: string): Promise<TripoTaskResponse> {
  const res = await fetch(`${TRIPO_API_BASE}/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "text_to_model",
      model_version: "v3.0-20250812",
      prompt,
      texture: true,
      pbr: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tripo3D API error (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<TripoTaskResponse>;
}

/**
 * Poll the status of a Tripo3D task.
 */
export async function getTaskStatus(taskId: string): Promise<TripoTaskStatus> {
  const res = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tripo3D API error (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<TripoTaskStatus>;
}
