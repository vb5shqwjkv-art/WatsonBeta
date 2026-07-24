import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { BlockId } from "./extensions/block-id";

export interface EditorExtensionOptions {
  placeholder?: string;
}

/**
 * The complete extension set for the editor: a Word/Docs-class feature surface
 * (headings, lists, tables, task lists, code, quotes, links, marks, alignment)
 * plus the {@link BlockId} backbone that makes every block AI-addressable.
 *
 * Exposed as a factory so both the React editor and headless tooling (indexing,
 * export, tests via `getSchema`) build from one source of truth.
 */
export function getEditorExtensions(
  options: EditorExtensionOptions = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      // Our BlockId plugin manages ids; StarterKit's history stays enabled for
      // keystroke-level undo (semantic/turn-level undo lives in CheckpointStack).
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Underline,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Parla o scrivi…",
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockId,
  ];
}
