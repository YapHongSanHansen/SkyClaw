import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { imageToModel, textToModel, getTaskStatus } from "./tripo3d";
import { storagePut } from "./storage";
import { getTelegramBotStatus } from "./telegramStatus";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  telegram: router({
    /** Check if the Telegram bot is connected and get its info */
    status: publicProcedure.query(async () => {
      return getTelegramBotStatus();
    }),
  }),

  tripo: router({
    /**
     * Generate a 3D model from an image URL.
     * Used when the drone captures an image and we want to create a 3D model.
     */
    imageToModel: publicProcedure
      .input(z.object({ imageUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        const result = await imageToModel(input.imageUrl);
        return {
          taskId: result.data.task_id,
          status: "queued" as const,
        };
      }),

    /**
     * Generate a 3D model from a text description.
     * Used when the user describes a space via OpenClaw chat.
     */
    textToModel: publicProcedure
      .input(z.object({ prompt: z.string().min(1).max(1024) }))
      .mutation(async ({ input }) => {
        const result = await textToModel(input.prompt);
        return {
          taskId: result.data.task_id,
          status: "queued" as const,
        };
      }),

    /**
     * Poll the status of a Tripo3D generation task.
     * Frontend calls this repeatedly until status is "success" or "failed".
     */
    taskStatus: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .query(async ({ input }) => {
        const result = await getTaskStatus(input.taskId);
        return {
          taskId: result.data.task_id,
          status: result.data.status,
          progress: result.data.progress,
          modelUrl: result.data.output?.model ?? null,
          renderedImage: result.data.output?.rendered_image ?? null,
          pbrModelUrl: result.data.output?.pbr_model ?? null,
        };
      }),

    /**
     * Proxy a Tripo3D GLB model through our S3 storage to avoid CORS issues.
     * Downloads the GLB from Tripo3D CDN (server-side, no CORS) and re-hosts it.
     */
    proxyModel: publicProcedure
      .input(z.object({ tripoUrl: z.string().url(), taskId: z.string() }))
      .mutation(async ({ input }) => {
        // Download GLB from Tripo3D server-side (no CORS restriction)
        const response = await fetch(input.tripoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        // Upload to our S3 storage with a stable key
        const key = `tripo-models/${input.taskId}.glb`;
        const { url } = await storagePut(key, buffer, 'model/gltf-binary');
        return { url };
      }),
  }),
});

export type AppRouter = typeof appRouter;
