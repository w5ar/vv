import { z } from 'zod';
import { SourceRefSchema, Vec2Schema } from './common';
import { DiagnosticSchema } from './issues';

/**
 * Output of the import pipeline (stages A–F), consumed by the "Pregled uvoza"
 * (import review) screen. Every element keeps a repository-relative file path
 * and, where possible, a line number or SVG element id.
 */

export const AssetTypeSchema = z.enum([
  'symbol-svg',
  'diagram-svg',
  'procedure-md',
  'raster-image',
  'pdf',
  'other',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const SvgGroupInfoSchema = z.strictObject({
  elementId: z.string().optional(),
  label: z.string().optional(),
  depth: z.number().int(),
  childCount: z.number().int(),
  isLayer: z.boolean(),
  dataAttributes: z.record(z.string(), z.string()).default({}),
});
export type SvgGroupInfo = z.infer<typeof SvgGroupInfoSchema>;

export const SvgInventorySchema = z.strictObject({
  width: z.string().optional(),
  height: z.string().optional(),
  viewBox: z.array(z.number()).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  elementCounts: z.record(z.string(), z.number().int()),
  groups: z.array(SvgGroupInfoSchema),
  ids: z.array(z.string()),
  referencedAssets: z.array(z.string()),
  texts: z.array(z.string()),
  removedBySanitizer: z.array(z.string()),
  parseError: z.string().optional(),
  synthetic: z.boolean().default(false),
});
export type SvgInventory = z.infer<typeof SvgInventorySchema>;

export const MarkdownInventorySchema = z.strictObject({
  title: z.string().optional(),
  headings: z.number().int(),
  numberedItems: z.number().int(),
  links: z.array(z.string()),
  images: z.array(z.string()),
  synthetic: z.boolean().default(false),
});
export type MarkdownInventory = z.infer<typeof MarkdownInventorySchema>;

export const InventoryItemSchema = z.strictObject({
  file: z.string(),
  assetType: AssetTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  svg: SvgInventorySchema.optional(),
  markdown: MarkdownInventorySchema.optional(),
  duplicateOf: z.array(z.string()).default([]),
  /** Set for generated render copies (e.g. diagrams with embedded symbols): the original file. */
  renderCopyOf: z.string().optional(),
  possibleSymbolIds: z.array(z.string()).default([]),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const SymbolProposalSchema = z.strictObject({
  proposedId: z.string(),
  file: z.string(),
  elementId: z.string().optional(),
  name: z.string(),
  nameSource: z.enum(['review', 'legend', 'title', 'label', 'filename']),
  /** Where the proposed name comes from (legend table row, SVG title). */
  nameRef: SourceRefSchema.optional(),
  category: z.string(),
  reviewStatus: z.enum(['verified', 'requires-review', 'rejected']),
  reviewed: z.boolean(),
  portCount: z.number().int(),
  notes: z.array(z.string()).default([]),
});
export type SymbolProposal = z.infer<typeof SymbolProposalSchema>;

export const ConfidenceSchema = z.enum(['metadata', 'heuristic', 'unresolved']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const DiagramInstanceSchema = z.strictObject({
  /** Deterministic key within the diagram: `data-instance` if present, else `<symbol-file-stem>@<x>,<y>`. */
  key: z.string(),
  elementId: z.string().optional(),
  instanceId: z.string().optional(),
  rawRef: z.string().optional(),
  symbolId: z.string().nullable(),
  position: Vec2Schema.optional(),
  rotation: z.number().optional(),
  stageId: z.string().optional(),
  label: z.string().optional(),
  /** Uniform scale of the instance relative to the symbol's logical size (1 = unscaled). */
  scale: z.number().optional(),
  /** Facing direction (degrees) taken from an attached direction marker, for personnel. */
  facing: z.number().optional(),
  /** Key of the instance this marker is attached to (direction markers). */
  attachedTo: z.string().optional(),
  confidence: ConfidenceSchema,
});
export type DiagramInstance = z.infer<typeof DiagramInstanceSchema>;

export const DiagramConnectionSchema = z.strictObject({
  elementId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  stageId: z.string().optional(),
  confidence: ConfidenceSchema,
});
export type DiagramConnection = z.infer<typeof DiagramConnectionSchema>;

export const DiagramAnalysisSchema = z.strictObject({
  file: z.string(),
  title: z.string().optional(),
  viewBox: z.array(z.number()).optional(),
  stages: z.array(z.strictObject({ stageId: z.string(), label: z.string().optional(), elementId: z.string().optional() })),
  instances: z.array(DiagramInstanceSchema),
  labels: z.array(
    z.strictObject({
      text: z.string(),
      position: Vec2Schema.optional(),
      elementId: z.string().optional(),
      stageId: z.string().optional(),
    }),
  ),
  connections: z.array(DiagramConnectionSchema),
  /** Free lines/paths (e.g. laid hose lines), with endpoints and stroke width. */
  lines: z
    .array(
      z.strictObject({
        index: z.number().int(),
        from: Vec2Schema,
        to: Vec2Schema,
        strokeWidth: z.number().optional(),
        /** Equipment type the line style denotes, from the reviewed line-style table. */
        equipmentTypeId: z.string().optional(),
        stageId: z.string().optional(),
      }),
    )
    .default([]),
  /** Render copy verified against this original (or mismatch noted). */
  renderCopies: z.array(z.string()).default([]),
  /** True when the diagram has drawing primitives but no recognisable symbol instances. */
  flattened: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type DiagramAnalysis = z.infer<typeof DiagramAnalysisSchema>;

export const StepCandidateSchema = z.strictObject({
  /** Stable id: `<file-slug>#<section-slug>/<n>` (numbered), `/p<i>` (paragraph) or `/l<i>` (list item). */
  id: z.string(),
  kind: z.enum(['numbered', 'paragraph', 'list-item']).default('numbered'),
  file: z.string(),
  sectionId: z.string(),
  sectionPath: z.array(z.string()),
  number: z.number().int().optional(),
  /** Verbatim Markdown text of the list item. */
  text: z.string(),
  line: z.number().int(),
  lineEnd: z.number().int(),
  roleMentions: z.array(z.string()),
  equipmentMentions: z.array(z.string()),
  diagramRefs: z.array(z.string()),
  mappedTo: z.array(z.string()).default([]),
  status: z.enum(['mapped', 'unmapped', 'ignored']).default('unmapped'),
});
export type StepCandidate = z.infer<typeof StepCandidateSchema>;

export const ProcedureSectionSchema = z.strictObject({
  id: z.string(),
  heading: z.string(),
  level: z.number().int(),
  line: z.number().int(),
  path: z.array(z.string()),
  paragraphs: z.array(z.strictObject({ text: z.string(), line: z.number().int() })).default([]),
  listItems: z.array(z.strictObject({ text: z.string(), line: z.number().int(), ordered: z.boolean() })).default([]),
});
export type ProcedureSection = z.infer<typeof ProcedureSectionSchema>;

export const ProcedureAnalysisSchema = z.strictObject({
  file: z.string(),
  title: z.string().optional(),
  synthetic: z.boolean().default(false),
  sections: z.array(ProcedureSectionSchema),
  steps: z.array(StepCandidateSchema),
  roleMentions: z.array(z.strictObject({ roleId: z.string(), term: z.string(), lines: z.array(z.number().int()) })),
  /** Verbatim orders („…!”) found in bold text, with the candidate that contains them. */
  orders: z.array(z.strictObject({ text: z.string(), line: z.number().int(), candidateId: z.string().nullable() })).default([]),
  /** Participant lists (e.g. "zapovjednik (Z),"). */
  participants: z
    .array(z.strictObject({ text: z.string(), abbreviation: z.string().optional(), line: z.number().int(), sectionId: z.string(), roleIds: z.array(z.string()) }))
    .default([]),
  /** Equipment lists with quantities (e.g. "3 „B” tlačne cijevi,"). */
  equipmentList: z
    .array(z.strictObject({ text: z.string(), quantity: z.number().int(), line: z.number().int(), sectionId: z.string(), equipmentTypeIds: z.array(z.string()) }))
    .default([]),
  /** Legend table entries: image reference + displayed name. */
  legend: z.array(z.strictObject({ file: z.string(), name: z.string(), line: z.number().int(), cells: z.array(z.string()) })).default([]),
  equipmentMentions: z.array(z.strictObject({ symbolId: z.string(), term: z.string(), lines: z.array(z.number().int()) })),
  diagramRefs: z.array(
    z.strictObject({
      target: z.string(),
      line: z.number().int(),
      resolvedFile: z.string().nullable(),
      /** Original diagram when the reference points to a render copy. */
      canonicalFile: z.string().nullable().default(null),
    }),
  ),
});
export type ProcedureAnalysis = z.infer<typeof ProcedureAnalysisSchema>;

export const MappingEntrySchema = z.strictObject({
  candidateId: z.string(),
  exerciseId: z.string().optional(),
  stepIds: z.array(z.string()),
  status: z.enum(['mapped', 'unmapped', 'ignored']),
  reason: z.string().optional(),
});
export type MappingEntry = z.infer<typeof MappingEntrySchema>;

export const CompiledExerciseInfoSchema = z.strictObject({
  exerciseId: z.string(),
  authoringFile: z.string(),
  outputFile: z.string().nullable(),
  ok: z.boolean(),
  errorCount: z.number().int(),
  warningCount: z.number().int(),
  stepCount: z.number().int(),
  tracedStepCount: z.number().int(),
  demoReachesCompletion: z.boolean(),
});
export type CompiledExerciseInfo = z.infer<typeof CompiledExerciseInfoSchema>;

export const DatasetReportSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  synthetic: z.boolean(),
  sourceRoot: z.string(),
  inventory: z.array(InventoryItemSchema),
  symbols: z.array(SymbolProposalSchema),
  diagrams: z.array(DiagramAnalysisSchema),
  procedures: z.array(ProcedureAnalysisSchema),
  mapping: z.array(MappingEntrySchema),
  compiled: z.array(CompiledExerciseInfoSchema),
  diagnostics: z.array(DiagnosticSchema),
});
export type DatasetReport = z.infer<typeof DatasetReportSchema>;

export const ImportReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasets: z.array(DatasetReportSchema),
});
export type ImportReport = z.infer<typeof ImportReportSchema>;
