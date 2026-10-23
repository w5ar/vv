import {
  AnchorDefinitionSchema,
  ConnectionRuleSchema,
  EquipmentTypeSchema,
  FiniteNumber,
  IdSchema,
  PortDefinitionSchema,
  PortTypeSchema,
  RoleDefinitionSchema,
  RotationPolicySchema,
  SemanticPropertiesSchema,
  SizeSchema,
  SymbolCategorySchema,
  Vec2Schema,
  VisualStateSchema,
  traceShape,
} from '@fds/domain';
import { z } from 'zod';

/**
 * Schemas of the human-maintained review files. Keys starting with `$`
 * (e.g. `$comment`) are treated as comments and stripped before validation.
 */

export function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!k.startsWith('$')) out[k] = stripComments(v);
    return out;
  }
  return value;
}

export const ReviewSymbolSchema = z.strictObject({
  id: IdSchema,
  /** Dataset-relative SVG path. */
  file: z.string().min(1),
  elementId: z.string().optional(),
  viewBox: z.tuple([FiniteNumber, FiniteNumber, z.number().positive(), z.number().positive()]).optional(),
  name: z.string().min(1),
  category: IdSchema,
  description: z.string().optional(),
  size: SizeSchema.optional(),
  pivot: Vec2Schema.optional(),
  anchors: z.array(AnchorDefinitionSchema).default([]),
  ports: z.array(PortDefinitionSchema).default([]),
  rotation: RotationPolicySchema.default({ mode: 'free' }),
  semantics: SemanticPropertiesSchema.default({}),
  visualStates: z.array(VisualStateSchema).default([]),
  defaultState: IdSchema.optional(),
  ...traceShape,
});
export type ReviewSymbol = z.infer<typeof ReviewSymbolSchema>;

export const CatalogReviewSchema = z.strictObject({
  catalogId: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  synthetic: z.boolean().default(false),
  categories: z.array(SymbolCategorySchema).default([]),
  portTypes: z.array(PortTypeSchema).default([]),
  connectionRules: z.array(ConnectionRuleSchema).default([]),
  symbols: z.array(ReviewSymbolSchema).default([]),
  equipmentTypes: z.array(EquipmentTypeSchema).default([]),
  roles: z.array(RoleDefinitionSchema).default([]),
  /** Explicit terminology lexicon used to recognise mentions in Markdown. */
  terms: z
    .strictObject({
      roles: z.record(z.string(), z.array(z.string())).default({}),
      symbols: z.record(z.string(), z.array(z.string())).default({}),
    })
    .default({ roles: {}, symbols: {} }),
});
export type CatalogReview = z.infer<typeof CatalogReviewSchema>;

export const MappingReviewSchema = z.strictObject({
  ignored: z.array(z.strictObject({ candidateId: z.string(), reason: z.string().min(1) })).default([]),
});
export type MappingReview = z.infer<typeof MappingReviewSchema>;

export const UNCLASSIFIED_CATEGORY = 'nerazvrstano';
