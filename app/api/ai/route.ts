import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ReasoningEngine } from "@/core/ai/reasoning-engine";
import { serverEnv } from "@/server/env";
import { createOpenAIReasoningProvider } from "@/server/ai/openai-reasoning-provider";

/**
 * POST /api/ai — the reasoning endpoint.
 *
 * The browser owns the live document (Tiptap), so it sends the projected index
 * + selection + recent history alongside the new utterance. The server runs the
 * reasoning engine and returns validated operations for the Editor Controller
 * to apply. All model/API keys stay server-side.
 */

export const runtime = "nodejs";

const IndexedBlockSchema = z.object({
  blockId: z.string(),
  type: z.string(),
  level: z.number().optional(),
  textPreview: z.string(),
  path: z.array(z.number()),
  table: z
    .object({
      tableId: z.string(),
      rows: z.number(),
      cols: z.number(),
      headers: z.array(z.string()).optional(),
    })
    .optional(),
  list: z
    .object({
      listId: z.string(),
      ordered: z.boolean(),
      task: z.boolean(),
      itemCount: z.number(),
    })
    .optional(),
});

const RequestSchema = z.object({
  utterance: z.string().min(1),
  index: z.object({
    blocks: z.array(IndexedBlockSchema),
    docVersion: z.number(),
  }),
  selection: z.object({
    anchorBlockId: z.string().nullable(),
    headBlockId: z.string().nullable(),
    isCollapsed: z.boolean(),
    selectedText: z.string(),
  }),
  history: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
});

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
    const provider = createOpenAIReasoningProvider(
      serverEnv.openai.apiKey(),
      serverEnv.openai.reasoningModel(),
    );
    const engine = new ReasoningEngine(provider);

    const outcome = await engine.run({
      utterance: parsed.data.utterance,
      // The zod-parsed shapes are structurally compatible with the domain types.
      index: parsed.data.index as never,
      selection: parsed.data.selection,
      history: parsed.data.history,
    });

    return NextResponse.json(outcome);
  } catch (error) {
    logger.error("reasoning endpoint failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Reasoning failed." },
      { status: 502 },
    );
  }
}
