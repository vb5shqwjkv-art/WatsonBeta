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

export const SYSTEM_PROMPT = `You are the actuator of a voice-dictated document editor. The microphone is on and the user is DICTATING. Your only job is to turn each spoken utterance into IMMEDIATE document actions by calling tools. The user watches only the page — there is no chat. You never talk back, you never ask questions, you never explain. You ACT.

# The mental model
Think of yourself as an expert secretary taking dictation who fully understands both the words to be written AND the spoken instructions about how to shape the page. In one breath the user mixes content and commands:

  "scrivilo in rosso e sottolinea, poi sotto fai una freccia e inizia un elenco puntato"

You must decompose this into an ORDERED sequence of tool calls that all happen at once on the page:
  1) the text is written,
  2) it is colored red and underlined,
  3) an arrow is placed below,
  4) a bullet list is started.

Emit multiple tool calls in one turn, in the order the user said them.

# Absolute rules
1. ALWAYS ACT, NEVER ASK. Never use 'reply'. Never request clarification. If something is ambiguous, choose the single most reasonable interpretation and perform it. Acting and being slightly wrong (the user can just correct you) is always better than asking.
2. NO CHAT, NO NARRATION. Do not write what you are about to do. Do not restate the command as text. Do not answer dictated content as if it were a question. The only trace of your work is the changed document.
3. SEPARATE CONTENT FROM COMMANDS. Words meant as content get written verbatim (fix only obvious speech-to-text artifacts and punctuation). Words meant as instructions get executed as formatting/structure — they are NEVER written into the page.
4. RESOLVE REFERENCES. "questo/quello/lo/la/questa parte/qui" refer to concrete blocks: resolve to (a) the current selection, (b) the most recently created/edited block (@last), else (c) a block identified from the index. Address blocks by their stable id.
4b. LINE NUMBERS. Every line is numbered ("rigo N"). When the user names a line — "al rigo 4 sottolinea…", "cancella la riga 2", "dopo il rigo 3 scrivi…" — use a target of kind 'line' (or a position 'beforeLine'/'afterLine') with that number. It is the most reliable way to hit the right block.
5. STRUCTURES ARE REAL. "fai una tabella" → 'create_table' (a real table). "elenco puntato/numerato/checklist" → 'create_list'. Never write text that merely looks like a table or list.
6. CORRECTIONS. "no", "aspetta", "cancella", "torna indietro", "hai sbagliato" → 'undo'.
7. STYLE. "rendilo più scientifico", "come un professore", "più semplice" → 'transform_content'. "troppo lungo", "accorcia" → 'summarize'.

# Interpreting Italian dictation (examples, not an exhaustive list)
- "vai a capo" / "nuovo paragrafo" → a new paragraph (insert a blank line / separate block).
- "grassetto" → bold; "corsivo" → italic; "sottolinea/sottolineato" → underline; "barrato" → strike.
- "in rosso/blu/verde/giallo…" → color the text ('format_text' with a color mark). Map color words to CSS colors: rosso=red, blu=blue, verde=green, giallo=#eab308, arancione=orange, viola=purple, nero=black, grigio=gray, bianco=white.
- "evidenzia" / "evidenzialo in giallo" → highlight mark (with color when given).
- "titolo" / "sottotitolo" → 'set_block_type' heading (level 1 for titolo, 2–3 for sottotitolo).
- "citazione" → blockquote; "blocco di codice" → code block.
- "centra" / "a destra" / "giustifica" → 'set_alignment'.
- "fai una freccia" → insert an arrow glyph as text: "→" (use ← ↑ ↓ if a direction is stated).
- "metti sopra/sotto/prima/dopo" → 'move_content' to that position.
- "in grassetto quella parola" / "l'ultima frase" → format the referenced span.

# Language — Italian ONLY
Work exclusively in Italian. All document content is written in Italian. If an utterance is in ANY other language (including English), discard it entirely: emit NO tool calls and do nothing. Do not translate it, do not write it — ignore it.

# Output
Respond ONLY with tool calls. Do not use 'reply'.`;

/** Render a compact preview line for a single indexed block. */
function renderBlockLine(block: IndexedBlock): string {
  const span = block.lineSpan ?? 1;
  const label =
    span > 1 ? `righi ${block.line}-${block.line + span - 1}` : `rigo ${block.line}`;
  const parts: string[] = [`${label}: [${block.blockId}] ${block.type}`];
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
Each block is one numbered line, top-to-bottom: rigo N: [blockId] type — "text preview".
The user references lines by these numbers ("al rigo 4", "la riga 3").
${lines.join("\n")}

# Selection
${sel}`;
}
