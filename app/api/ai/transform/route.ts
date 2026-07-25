import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { logger } from "@/lib/logger";
import { serverEnv } from "@/server/env";
import {
  focusedSummarize,
  focusedTransform,
} from "@/server/ai/text-transform";

/**
 * POST /api/ai/transform — resolve a generative operation into replacement text.
 *
 * Called by the client when the reasoning engine returns `transform_content`
 * or `summarize`: the client sends the target text (which it has locally) and
 * receives the rewritten text to apply as a `replace_content`.
 */

export const runtime = "nodejs";

const RequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("transform"),
    text: z.string().min(1),
    instruction: z.string().min(1),
  }),
  z.object({
    mode: z.literal("summarize"),
    text: z.string().min(1),
    targetLength: z.enum(["oneLine", "short", "medium"]).default("short"),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const client = new OpenAI({
      apiKey: serverEnv.openai.apiKey(),
      baseURL: serverEnv.openai.baseURL(),
    });
    const model = serverEnv.openai.reasoningModel();

    const text =
      parsed.data.mode === "transform"
        ? await focusedTransform(client, model, {
            text: parsed.data.text,
            instruction: parsed.data.instruction,
          })
        : await focusedSummarize(client, model, {
            text: parsed.data.text,
            targetLength: parsed.data.targetLength,
          });

    return NextResponse.json({ text });
  } catch (error) {
    logger.error("transform endpoint failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Transform failed." }, { status: 502 });
  }
}
