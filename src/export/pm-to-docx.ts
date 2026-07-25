import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { JsonValue } from "@/lib/json";
import { cssColorToHex } from "./color";

/**
 * ProseMirror/Tiptap JSON → a `docx` Document. Preserves the formatting the
 * assistant applies: headings, bold/italic/underline/strike/code, text color,
 * font size, highlight, links, alignment, lists, task lists, tables, quotes,
 * code blocks. This is the Export Engine's DOCX path.
 */

interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function markOf(marks: PMMark[] | undefined, type: string): PMMark | undefined {
  return marks?.find((m) => m.type === type);
}

/** Parse a font-size mark value ("14pt") into docx half-points. */
function halfPoints(size: unknown): number | undefined {
  if (typeof size !== "string") return undefined;
  const pt = parseFloat(size);
  return Number.isFinite(pt) ? Math.round(pt * 2) : undefined;
}

function runsFromInline(nodes: PMNode[] | undefined): (TextRun | ExternalHyperlink)[] {
  if (!nodes) return [];
  const runs: (TextRun | ExternalHyperlink)[] = [];

  for (const node of nodes) {
    if (node.type !== "text" || !node.text) continue;
    const marks = node.marks;

    const color = cssColorToHex(
      (markOf(marks, "textStyle")?.attrs?.color as string) ?? undefined,
    );
    const highlight = cssColorToHex(
      (markOf(marks, "highlight")?.attrs?.color as string) ?? undefined,
    );
    const size = halfPoints(markOf(marks, "fontSize")?.attrs?.size);
    const isCode = !!markOf(marks, "code");

    const run = new TextRun({
      text: node.text,
      bold: !!markOf(marks, "bold"),
      italics: !!markOf(marks, "italic"),
      strike: !!markOf(marks, "strike"),
      underline: markOf(marks, "underline") ? {} : undefined,
      color,
      size,
      font: isCode ? "Courier New" : undefined,
      shading: highlight
        ? { type: ShadingType.CLEAR, fill: highlight, color: "auto" }
        : undefined,
    });

    const link = markOf(marks, "link");
    if (link?.attrs?.href) {
      runs.push(
        new ExternalHyperlink({
          children: [run],
          link: String(link.attrs.href),
        }),
      );
    } else {
      runs.push(run);
    }
  }

  return runs;
}

function alignmentOf(node: PMNode) {
  const a = node.attrs?.textAlign;
  return typeof a === "string" ? ALIGN[a] : undefined;
}

function paragraph(node: PMNode, extra: Record<string, unknown> = {}): Paragraph {
  return new Paragraph({
    children: runsFromInline(node.content),
    alignment: alignmentOf(node),
    ...extra,
  });
}

function listParagraphs(node: PMNode, ordered: boolean): Paragraph[] {
  const out: Paragraph[] = [];
  node.content?.forEach((item, i) => {
    // A listItem/taskItem contains block content (usually one paragraph).
    const checked = item.attrs?.checked === true;
    item.content?.forEach((child) => {
      if (ordered) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${i + 1}. ` }),
              ...runsFromInline(child.content),
            ],
          }),
        );
      } else if (node.type === "taskList") {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: checked ? "☑ " : "☐ " }),
              ...runsFromInline(child.content),
            ],
          }),
        );
      } else {
        out.push(
          new Paragraph({
            children: runsFromInline(child.content),
            bullet: { level: 0 },
          }),
        );
      }
    });
  });
  return out;
}

function tableOf(node: PMNode): Table {
  const rows =
    node.content?.map(
      (row) =>
        new TableRow({
          children:
            row.content?.map(
              (cell) =>
                new TableCell({
                  children: (cell.content ?? []).map((p) => paragraph(p)),
                }),
            ) ?? [],
        }),
    ) ?? [];
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** A comparison exports as a borderless single-row table: side-by-side columns. */
function comparisonToDocx(node: PMNode): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cells =
    node.content?.map(
      (col) =>
        new TableCell({
          children: (col.content ?? []).flatMap((b) => blockToDocx(b)),
          margins: { top: 40, bottom: 40, left: 120, right: 120 },
        }),
    ) ?? [];
  return new Table({
    rows: [new TableRow({ children: cells })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    },
  });
}

function blockToDocx(node: PMNode): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return [paragraph(node, { heading: HEADING_LEVELS[level - 1] })];
    }
    case "paragraph":
      return [paragraph(node)];
    case "blockquote":
      return (node.content ?? []).map((p) =>
        paragraph(p, { indent: { left: 480 }, style: "IntenseQuote" }),
      );
    case "codeBlock":
      return [
        new Paragraph({
          children: [
            new TextRun({ text: node.content?.[0]?.text ?? "", font: "Courier New" }),
          ],
          shading: { type: ShadingType.CLEAR, fill: "F1F3F5", color: "auto" },
        }),
      ];
    case "bulletList":
      return listParagraphs(node, false);
    case "orderedList":
      return listParagraphs(node, true);
    case "taskList":
      return listParagraphs(node, false);
    case "table":
      return [tableOf(node)];
    case "comparison":
      return [comparisonToDocx(node)];
    case "horizontalRule":
      return [
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
          },
        }),
      ];
    default:
      return [paragraph(node)];
  }
}

export function buildDocxDocument(content: JsonValue, title: string): Document {
  const doc = content as unknown as PMNode;
  const children: (Paragraph | Table)[] = [];
  for (const block of doc.content ?? []) {
    children.push(...blockToDocx(block));
  }
  if (children.length === 0) children.push(new Paragraph({}));

  return new Document({
    title,
    sections: [{ children }],
  });
}
