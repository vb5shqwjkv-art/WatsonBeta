import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { newBlockId } from "@/lib/ids";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * BlockId — stable identifiers for block-level nodes
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ProseMirror addresses nodes by integer positions that shift on every edit.
 * The AI cannot reason about those. This extension gives every addressable
 * block a stable `blockId` that survives edits, so "make THAT bold" / "move
 * THIS above" can be grounded to a concrete, durable target.
 *
 * A single appendTransaction pass assigns ids to new blocks and repairs
 * duplicates (e.g. after copy/paste of a block that carried its id along).
 */

export interface BlockIdOptions {
  /** Node type names that should carry a blockId. */
  types: string[];
  /** The attribute name (also the DOM data attribute, dash-cased). */
  attributeName: string;
}

export const DEFAULT_BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "taskList",
  "table",
  "horizontalRule",
  "image",
  "comparison",
  "comparisonColumn",
];

const blockIdPluginKey = new PluginKey("blockId");

export const BlockId = Extension.create<BlockIdOptions>({
  name: "blockId",

  addOptions() {
    return {
      types: DEFAULT_BLOCK_ID_TYPES,
      attributeName: "blockId",
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            // Keep ids out of copy/paste HTML so pasted blocks get fresh ids.
            rendered: true,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              const id = attributes[this.options.attributeName];
              return id ? { "data-block-id": id } : {};
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const { types, attributeName } = this.options;
    const typeSet = new Set(types);

    return [
      new Plugin({
        key: blockIdPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          const seen = new Set<string>();
          let modified = false;

          // Attribute-only changes never move positions, so the positions
          // gathered from newState.doc stay valid for the whole pass.
          newState.doc.descendants((node, pos) => {
            if (!typeSet.has(node.type.name)) return;
            const id: unknown = node.attrs[attributeName];
            if (typeof id !== "string" || id.length === 0 || seen.has(id)) {
              const fresh = newBlockId();
              tr.setNodeAttribute(pos, attributeName, fresh);
              seen.add(fresh);
              modified = true;
            } else {
              seen.add(id);
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
