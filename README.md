# AI Voice Document Assistant

A conversational AI that **reasons** over natural language and edits a rich
document in real time. Not a dictation editor, not a rigid voice-command system:
the LLM is the brain of the application, and it drives a Word/Docs-class editor
by deciding — autonomously — what each spoken sentence _means_.

> Voice → Speech-to-Text → **LLM (understanding, context, decision)** → document mutation

---

## The core idea

Every utterance is interpreted with full context (document, cursor, selection,
history). The model decides whether it is dictation, an edit, an implicit
command, a rewrite, a restructure, a question, a correction, or a formatting
change — and acts by calling **tools**, never by matching keywords.

**The golden rule:** the AI never touches ProseMirror or the DOM directly. It
emits validated, typed operations from a closed DSL; a single deterministic
**Editor Controller** applies them. Creativity lives in the model; safety lives
in the actuator.

---

## Architecture (agent system)

| Module | Location | Responsibility |
| --- | --- | --- |
| Speech Recognition | `src/speech` | Mic capture, streaming STT, turn/endpoint detection |
| Conversation Manager | `src/core/conversation` | Dialogue history, turn serialization, interruptions |
| Context Manager | `src/core/context` | Assembles the budgeted context for each turn (RAG-ready) |
| AI Reasoning Engine | `src/core/ai` | System prompt, tool schema, model call, tool-call validation |
| Document State | `src/core/document` | Source of truth: stable block ids, projected index, versioning |
| Editor Controller | `src/editor` | The only actuator: operations → Tiptap transactions + inverse ops |
| Export Engine | `src/export` | DOCX / PDF |
| Storage | `src/storage` | Supabase: documents, versions, conversation log, autosave, Auth |

The `src/core` layer is **framework-agnostic pure domain** — no React, no
browser, no vendor SDK — and is unit-tested in isolation
(`tsconfig.core.json`, `npm run typecheck:core`).

### Data flow

```
Mic audio
  → Speech Recognition        (streaming STT + endpointing)
  → Conversation Manager      (history, serialized action queue)
  → Context Manager           (outline w/ stable ids + selection + history)
  → AI Reasoning Engine        (LLM → validated Operations | reply)
  → Editor Controller          (apply as Tiptap transaction, capture reverse-op, checkpoint)
  → Document State → UI → Storage
```

### How the AI interacts with the editor

The reasoning engine emits operations from the DSL in
`src/core/operations`. The Zod schemas there are the single source of truth:
TypeScript types are inferred from them, and the OpenAI tool definitions are
generated from them (`src/core/ai/tools.ts`), so the model's contract and our
validator can never drift.

- **Structural (deterministic):** `insert_content`, `replace_content`,
  `delete_content`, `move_content`, `format_text` (bold/italic/underline/strike/
  code/highlight/link/**color**), `set_block_type`, `set_alignment`,
  `set_font_size` (absolute pt or relative "+2"), `create_table`, `modify_table`,
  `create_list`
- **Generative (re-invoke the LLM):** `transform_content`, `summarize`
- **Meta:** `undo`, `restore_version`, `reply`

Targets are resolved references — a `blockId`, `@selection`, or `@last` — which
is how "make _that_ bold" and "move _this part_ above" become concrete edits.

---

## Project structure

```
app/                          Next.js App Router (routes + server APIs)
  api/ai/route.ts             Reasoning endpoint (keys stay server-side)
src/
  core/                       PURE DOMAIN (no React / browser / vendor SDK)
    document/                 model, index, selection, versioning
    operations/               operation DSL: Zod schema (source of truth) + types
    ai/                       tools, system-prompt, reasoning-engine, provider port
    conversation/             conversation-manager, turn queue
    context/                  context-manager (budgeting, retrieval hook)
  server/                     server-only adapters (OpenAI provider, env)
  editor/                     Editor Controller + Tiptap extensions   [phase 1]
  speech/                     mic client + realtime session           [phase 3]
  export/                     docx / pdf exporters                    [phase 4]
  storage/                    supabase client + repositories          [phase 4]
  components/ stores/ hooks/  UI + client state                       [phase 2+]
  lib/                        ids, result, json, logger
supabase/                     schema + migrations
tests/                        vitest (pure-core unit tests)
```

---

## Development status

**Phase 0 — Foundation (done):** project scaffolding, the pure-domain spine
(Document State model, operation DSL, AI tools + system prompt + reasoning
engine, conversation/context managers, semantic undo), the OpenAI provider
adapter, and the `/api/ai` reasoning endpoint.

**Phase 1 — Editor Controller + `blockId` backbone (done):**

- `blockId` Tiptap extension: assigns a stable id to every addressable block
  and repairs duplicates — the physical basis of referential grounding.
- Full editor feature set wired (`tiptap-config`): headings, lists, tables,
  task lists, code, quotes, links, marks, alignment.
- `document-indexer` (tree → projected outline), `selection-projector`
  (selection → blockIds), `reference-resolver` (`@selection` / `@last` /
  `@document` / blockId → concrete ranges).
- `EditorController`: the single actuator. Applies every structural operation
  as a Tiptap transaction, enforces optimistic-concurrency (`basedOnVersion`),
  and records one semantic checkpoint per turn for "go back".
- Table edits modeled as a pure 2-D transform (`table-model`) — "swap the
  columns" is deterministic and unit-tested, not fragile position math.

48 unit tests, incl. headless ProseMirror-schema tests for indexing/resolution.

**Phase 2 — Voice dictation, end-to-end (done):**

- The whole UI is the document sheet + one microphone button. Editing happens
  ONLY while the mic is on; the page is not otherwise user-editable. No chat,
  no questions — the only output is the page changing as you speak.
- The system prompt is a **dictation actuator**: it never chats, never asks,
  decomposes a compound utterance ("scrivilo in rosso e sottolinea, poi sotto
  fai una freccia e inizia un elenco puntato") into an ordered batch of tool
  calls, and interprets spoken schematization like a human taking dictation.
- Speech-to-Text via the Web Speech API behind a swappable `SttProvider` port
  (OpenAI Realtime / Whisper are drop-in alternatives).
- Client `DictationPipeline`: STT → Context Manager → `/api/ai` → resolve
  generative ops via `/api/ai/transform` → Editor Controller, serialized.
- Added text **color** ("in rosso") across the stack.
- **Line numbers**: every top-level block is numbered in a gutter, with the same
  number in the AI's context and a `line` reference in the DSL — so "al rigo 4
  sottolinea X" / "dopo il rigo 3 scrivi Y" resolve deterministically.

Verified in a real browser (Chromium): insert, color + underline + bold,
lists, tables, table column-swap, semantic undo, and editing by line number all
apply correctly with zero failures. 59 unit tests.

Hardening fixes from the Phase 2 review: undo no longer corrupts the checkpoint
stack; Color's setColor no longer swallows sibling marks; dictation appends at
the end (cursor parked, with a trailing paragraph after tables); the pristine
empty first line is replaced on first write; the Web Speech session stops
instead of looping on fatal errors (mic permission denied, etc.).

**Per-line numbering, autosave, and Italian-only (done):**

- **Every visual line is numbered** in a left gutter — including each wrapped
  line inside a paragraph, not just each block. Lines are measured from the
  rendered DOM (`visual-lines.ts`); the same numbers feed the AI's context, and
  "al rigo 4" maps to the block containing that visual line. Single continuous
  sheet (no A4 pagination).
- **Autosave every interaction** — every change is persisted (debounced) via a
  swappable `DocumentPersistence` port (localStorage now, Supabase in Phase 4)
  and restored on reload. A subtle "Salvato ✓" confirms it.
- **Italian only** — dictation runs in `it-IT`; the reasoning layer discards any
  utterance in another language.

Verified in real Chromium: 4 blocks rendering as 7 numbered visual lines (a long
paragraph spanning lines 3–6), line-targeting into a wrapped paragraph, autosave
surviving a reload, and a full actuator regression (insert, color/underline/bold
by line number, insert after a line, checklist, table swap + undo) with zero
failures.

Roadmap:

- **Phase 3** — Harden the voice loop: OpenAI Realtime/Whisper provider for
  robustness, barge-in, faster endpointing.
- **Phase 4** — Export (DOCX/PDF), autosave, versions, Supabase Auth.
- **Phase 5** — Latency, ambiguity handling, advanced tables.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in OpenAI + Supabase keys
npm run dev
```

Useful scripts:

```bash
npm run typecheck        # full project
npm run typecheck:core   # pure domain only (no framework deps)
npm run test             # vitest
npm run lint
```

---

## Stack

Next.js · React · TypeScript · TailwindCSS · Tiptap/ProseMirror · Zod ·
Zustand · Supabase (DB + Auth) · OpenAI (Realtime STT + GPT reasoning) ·
`docx` for export.
