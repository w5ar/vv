import { z } from 'zod';

/**
 * Stable identifier used for every definition and instance.
 * Identifiers are technical (English/ASCII); user-facing names are separate fields.
 */
export const IdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Identifikator smije sadržavati slova, brojke te znakove . _ : -');
export type Id = z.infer<typeof IdSchema>;

export const FiniteNumber = z.number().refine(Number.isFinite, 'Broj mora biti konačan');

export const Vec2Schema = z.strictObject({ x: FiniteNumber, y: FiniteNumber });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const SizeSchema = z.strictObject({ width: z.number().positive(), height: z.number().positive() });
export type Size = z.infer<typeof SizeSchema>;

export const RectSchema = z.strictObject({
  x: FiniteNumber,
  y: FiniteNumber,
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Rect = z.infer<typeof RectSchema>;

/** Rotation in degrees, clockwise on screen. */
export const RotationSchema = FiniteNumber;

/**
 * Pointer into the original source material, so every generated or authored
 * element can be traced back to its documentation.
 */
export const SourceRefSchema = z.strictObject({
  /** Repository-relative path, e.g. `content/source/procedures/vjezba-1.md`. */
  file: z.string().min(1),
  /** Heading slug, SVG element id or step-candidate id inside the file. */
  anchor: z.string().optional(),
  /** 1-based line (Markdown) where the referenced content starts. */
  line: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  /** Verbatim excerpt of the original wording (Croatian). */
  excerpt: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Where a piece of data comes from.
 * - `source`: taken directly from the authoritative source materials.
 * - `derived`: inferred from source materials (by the importer or an author); must be reviewed.
 * - `synthetic`: invented test fixture data; never authoritative.
 * - `assumption`: a technical default chosen by developers, not a domain fact.
 */
export const ProvenanceSchema = z.enum(['source', 'derived', 'synthetic', 'assumption']);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ReviewStatusSchema = z.enum(['verified', 'requires-review', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewSchema = z.strictObject({
  status: ReviewStatusSchema,
  notes: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const DEFAULT_REVIEW: Review = { status: 'requires-review' };

/** Fields shared by every traceable definition. */
export const traceShape = {
  provenance: ProvenanceSchema.default('derived'),
  review: ReviewSchema.default(DEFAULT_REVIEW),
  sources: z.array(SourceRefSchema).default([]),
};

export interface Traceable {
  provenance: Provenance;
  review: Review;
  sources: SourceRef[];
}

export const SemanticValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const SemanticPropertiesSchema = z.record(z.string(), SemanticValueSchema);
export type SemanticProperties = z.infer<typeof SemanticPropertiesSchema>;

/** Reference to one port on one object instance. */
export const PortRefSchema = z.strictObject({ objectId: IdSchema, portId: IdSchema });
export type PortRef = z.infer<typeof PortRefSchema>;

export function portRefKey(ref: PortRef): string {
  return `${ref.objectId}#${ref.portId}`;
}
