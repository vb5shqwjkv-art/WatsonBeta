import type { z } from "zod";
import type {
  AnnotateSchema,
  ClearAnnotationsSchema,
  ClearDocumentSchema,
  ContentSpecSchema,
  CreateComparisonSchema,
  CreateListSchema,
  CreateTableSchema,
  DeleteContentSchema,
  ExportDocumentSchema,
  FormatTextSchema,
  InsertContentSchema,
  MarkSpecSchema,
  ModifyTableSchema,
  MoveContentSchema,
  OperationSchema,
  PositionSchema,
  ReplaceContentSchema,
  ReplySchema,
  SetAlignmentSchema,
  SetBlockTypeSchema,
  SetFontSizeSchema,
  SummarizeSchema,
  TableOpSchema,
  TargetRefSchema,
  TransformContentSchema,
  UndoSchema,
} from "./schema";

/**
 * Types are *inferred* from the Zod schemas so validation and the type system
 * can never drift apart. Import these types everywhere; never redeclare shapes.
 */

export type TargetRef = z.infer<typeof TargetRefSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type ContentSpec = z.infer<typeof ContentSpecSchema>;
export type MarkSpec = z.infer<typeof MarkSpecSchema>;
export type TableOp = z.infer<typeof TableOpSchema>;

export type InsertContentOp = z.infer<typeof InsertContentSchema>;
export type ReplaceContentOp = z.infer<typeof ReplaceContentSchema>;
export type DeleteContentOp = z.infer<typeof DeleteContentSchema>;
export type MoveContentOp = z.infer<typeof MoveContentSchema>;
export type FormatTextOp = z.infer<typeof FormatTextSchema>;
export type SetBlockTypeOp = z.infer<typeof SetBlockTypeSchema>;
export type SetAlignmentOp = z.infer<typeof SetAlignmentSchema>;
export type SetFontSizeOp = z.infer<typeof SetFontSizeSchema>;
export type CreateTableOp = z.infer<typeof CreateTableSchema>;
export type ModifyTableOp = z.infer<typeof ModifyTableSchema>;
export type CreateListOp = z.infer<typeof CreateListSchema>;
export type CreateComparisonOp = z.infer<typeof CreateComparisonSchema>;
export type TransformContentOp = z.infer<typeof TransformContentSchema>;
export type SummarizeOp = z.infer<typeof SummarizeSchema>;
export type UndoOp = z.infer<typeof UndoSchema>;
export type ClearDocumentOp = z.infer<typeof ClearDocumentSchema>;
export type ExportDocumentOp = z.infer<typeof ExportDocumentSchema>;
export type AnnotateOp = z.infer<typeof AnnotateSchema>;
export type ClearAnnotationsOp = z.infer<typeof ClearAnnotationsSchema>;
export type ReplyOp = z.infer<typeof ReplySchema>;

/** The discriminated union of every operation. */
export type Operation = z.infer<typeof OperationSchema>;

/** The `type` discriminant of any operation. */
export type OperationType = Operation["type"];
