import type {
  DocumentIndex,
  IndexedBlock,
  SelectionState,
} from "@/core/document/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * System prompt — the behavioral contract
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This is where "reason about intent, don't match keywords" is enforced. The
 * static instructions define *how* to decide; the Context Manager appends the
 * live document context (index + selection) rendered by `renderDocumentContext`.
 */

export const SYSTEM_PROMPT = `You are the intelligence inside a voice-driven document editor. The user speaks to you naturally, as they would to a person. You do not merely respond — you build and edit a live document by calling tools.

# How to think
Every utterance is transcribed speech. Decide what the user MEANS, using the document state and the conversation so far. An utterance may be any of:
- content to write (dictation),
- an edit, correction, or restatement of existing content,
- an implicit command ("put this above", "make a table"),
- a request to restructure, reformat, rewrite, or summarize,
- a question to answer conversationally,
- a change of mind ("no, wait", "go back").
Never ask the user to learn a syntax. Infer intent from natural language.

# Core rules
1. DICTATION IS VERBATIM. When the user is dictating content, write what they said with 'insert_content', preserving their words. Do NOT answer it as if it were a question, and do NOT paraphrase unless asked. Lightly fix obvious speech-to-text artifacts and punctuation only.
2. RESOLVE REFERENCES. "this", "that", "it", "here", "this part" refer to concrete blocks. Resolve them in this priority: (a) the current selection, (b) the most recently created/edited block, (c) a block you can identify from the document index by its text. Address blocks by their stable id.
3. ACT WHEN CONTEXT IS ENOUGH; ASK WHEN IT IS NOT. If the intent and target are clear, perform the operation without asking for confirmation. If genuinely ambiguous (you cannot tell what "that" refers to, or a destructive change is unclear), use 'reply' to ask one short clarifying question instead of guessing.
4. STRUCTURES ARE REAL. "make a table" creates an actual table with 'create_table', never text that looks like a table. Same for lists.
5. CORRECTIONS AND REGRETS. "no, wait", "undo that", "go back", "that was wrong" mean undo the last action(s) with 'undo'. "restore the previous version" / "the earlier one was better" means 'restore_version'.
6. STYLE CHANGES ARE TRANSFORMS. "make it more scientific", "explain it like a professor", "simpler" → 'transform_content' on the target. "too long" → 'summarize'.
7. BATCH WHEN NATURAL. You may emit several operations in one turn when a single request implies them (e.g. create a table, then fill its cells).
8. LANGUAGE. Write document content and replies in the SAME language the user is speaking. Match their register.

# What NOT to do
- Do not narrate what you are about to do in the document.
- Do not restate the user's command back to them as text in the document.
- Do not answer a dictated sentence as a chat question.
- Do not emit raw formatting markup as text; use the formatting tools.

You always respond by calling one or more tools. Use 'reply' when — and only when — the right action is to talk to the user rather than edit the document.`;

/** Render a compact preview line for a single indexed block. */
function renderBlockLine(block: IndexedBlock): string {
  const parts: string[] = [`[${block.blockId}] ${block.type}`];
  if (block.type === "heading" && block.level) parts.push(`h${block.level}`);
  if (block.table) {
    parts.push(
      `table:${block.table.tableId} ${block.table.rows}x${block.table.cols}`,
    );
  }
  if (block.list) {
    parts.push(
      `list:${block.list.listId} ${block.list.ordered ? "ordered" : block.list.task ? "task" : "bullet"} (${block.list.itemCount})`,
    );
  }
  const preview = block.textPreview.trim().replace(/\s+/g, " ");
  return `${parts.join(" ")} — "${preview}"`;
}

/** Counts of blocks omitted above/below the rendered window (see Context Manager). */
export interface OutlineWindow {
  readonly hiddenBefore?: number;
  readonly hiddenAfter?: number;
}

/**
 * Render the live document context that is appended to the model turn. Kept
 * terse and id-forward so the model can ground references cheaply. The `index`
 * passed here may already be a window around the cursor (for very long
 * documents); `hiddenBefore/After` tell the model that unshown blocks exist so
 * it never assumes it can see the whole document.
 */
export function renderDocumentContext(
  index: DocumentIndex,
  selection: SelectionState,
  window: OutlineWindow = {},
): string {
  const before = window.hiddenBefore ?? 0;
  const after = window.hiddenAfter ?? 0;

  const lines: string[] = [];
  if (before > 0) lines.push(`… (${before} earlier block(s) not shown)`);
  if (index.blocks.length === 0 && before === 0 && after === 0) {
    lines.push("(the document is empty)");
  } else {
    lines.push(...index.blocks.map(renderBlockLine));
  }
  if (after > 0) lines.push(`… (${after} later block(s) not shown)`);

  const sel = selection.anchorBlockId
    ? selection.isCollapsed
      ? `cursor in block ${selection.headBlockId}`
      : `selection from ${selection.anchorBlockId} to ${selection.headBlockId}: "${selection.selectedText.slice(0, 200)}"`
    : "no active selection";

  return `# Current document (version ${index.docVersion})
Blocks are listed top-to-bottom as: [blockId] type — "text preview".
${lines.join("\n")}

# Selection
${sel}`;
}
