import type { Node as PMNode } from "@tiptap/pm/model";
import {
  BlockType,
  type DocumentIndex,
  type IndexedBlock,
  type ListOutline,
  type TableOutline,
} from "@/core/document/types";

/**
 * Builds the projected {@link DocumentIndex} from a ProseMirror document. This
 * is the bridge from the editor's tree to the compact, id-forward outline the
 * reasoning engine consumes. Pure: it reads a `PMNode`, mutates nothing.
 */

const PREVIEW_LIMIT = 120;

const NODE_TYPE_MAP: Record<string, BlockType> = {
  paragraph: BlockType.Paragraph,
  heading: BlockType.Heading,
  bulletList: BlockType.BulletList,
  orderedList: BlockType.OrderedList,
  taskList: BlockType.TaskList,
  table: BlockType.Table,
  codeBlock: BlockType.CodeBlock,
  blockquote: BlockType.Blockquote,
  image: BlockType.Image,
  horizontalRule: BlockType.HorizontalRule,
};

function preview(node: PMNode): string {
  return node.textContent.slice(0, PREVIEW_LIMIT);
}

function tableOutline(node: PMNode, blockId: string): TableOutline {
  const rows = node.childCount;
  const firstRow = rows > 0 ? node.child(0) : null;
  const cols = firstRow ? firstRow.childCount : 0;

  let headers: string[] | undefined;
  if (firstRow) {
    const cells: string[] = [];
    let allHeaders = true;
    firstRow.forEach((cell) => {
      if (cell.type.name !== "tableHeader") allHeaders = false;
      cells.push(cell.textContent);
    });
    if (allHeaders && cells.length > 0) headers = cells;
  }

  return { tableId: blockId, rows, cols, headers };
}

function listOutline(node: PMNode, blockId: string): ListOutline {
  return {
    listId: blockId,
    ordered: node.type.name === "orderedList",
    task: node.type.name === "taskList",
    itemCount: node.childCount,
  };
}

export function buildIndex(doc: PMNode, docVersion: number): DocumentIndex {
  const blocks: IndexedBlock[] = [];

  doc.forEach((node, _offset, i) => {
    const type = NODE_TYPE_MAP[node.type.name];
    if (!type) return; // skip nodes we don't surface to the model

    const blockId =
      typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";

    const block: IndexedBlock = {
      blockId,
      type,
      level:
        type === BlockType.Heading && typeof node.attrs.level === "number"
          ? node.attrs.level
          : undefined,
      textPreview: preview(node),
      path: [i],
      table: type === BlockType.Table ? tableOutline(node, blockId) : undefined,
      list:
        type === BlockType.BulletList ||
        type === BlockType.OrderedList ||
        type === BlockType.TaskList
          ? listOutline(node, blockId)
          : undefined,
    };

    blocks.push(block);
  });

  return { blocks, docVersion };
}
