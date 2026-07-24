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
  `delete_content`, `move_content`, `format_text`, `set_block_type`,
  `set_alignment`, `create_table`, `modify_table`, `create_list`
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

**Phase 0 — Foundation (this commit):** project scaffolding, the pure-domain
spine (Document State model, operation DSL, AI tools + system prompt +
reasoning engine, conversation/context managers, semantic undo), the OpenAI
provider adapter, and the `/api/ai` reasoning endpoint. Unit-tested.

Roadmap:

- **Phase 1** — Editor Controller + Tiptap `blockId` extension: apply operations
  as transactions, build the projected index, capture inverse ops.
- **Phase 2** — Editor UI + text-driven turns (drive the pipeline before voice).
- **Phase 3** — Voice loop: Speech Recognition + Conversation Manager end-to-end.
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
