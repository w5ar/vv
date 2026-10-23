import { z } from 'zod';
import { FiniteNumber, IdSchema, PortRefSchema, RectSchema, RotationSchema, Vec2Schema, traceShape } from './common';

/**
 * Instances placed in an exercise scene. Instances reference reusable
 * definitions from the catalog (symbols, equipment types, roles).
 *
 * `position` is the world position of the symbol pivot (by default the
 * symbol centre); `rotation` is in degrees, clockwise on screen.
 */

export const PersonnelInstanceSchema = z.strictObject({
  id: IdSchema,
  label: z.string().optional(),
  symbolId: IdSchema,
  roleId: IdSchema.nullable().default(null),
  position: Vec2Schema,
  rotation: RotationSchema.default(0),
  ...traceShape,
});
export type PersonnelInstance = z.infer<typeof PersonnelInstanceSchema>;
export type PersonnelInstanceInput = z.input<typeof PersonnelInstanceSchema>;

export const EquipmentInstanceSchema = z.strictObject({
  id: IdSchema,
  label: z.string().optional(),
  typeId: IdSchema,
  position: Vec2Schema,
  rotation: RotationSchema.default(0),
  /** Visual/semantic state id defined on the symbol. */
  state: IdSchema.optional(),
  /** Personnel id currently carrying the equipment. */
  carriedBy: IdSchema.nullable().default(null),
  ...traceShape,
});
export type EquipmentInstance = z.infer<typeof EquipmentInstanceSchema>;
export type EquipmentInstanceInput = z.input<typeof EquipmentInstanceSchema>;

/** Logical connection between two ports. Stored in domain state, independent of any renderer edge. */
export const ConnectionSchema = z.strictObject({
  id: IdSchema,
  a: PortRefSchema,
  b: PortRefSchema,
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ZoneShapeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rect'), rect: RectSchema }),
  z.strictObject({ type: z.literal('circle'), center: Vec2Schema, radius: z.number().positive() }),
]);
export type ZoneShape = z.infer<typeof ZoneShapeSchema>;

/** Named area of the scene, used by conditions such as `inZone`. */
export const ZoneSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  shape: ZoneShapeSchema,
  ...traceShape,
});
export type Zone = z.infer<typeof ZoneSchema>;

export const AnnotationSchema = z.strictObject({
  id: IdSchema,
  text: z.string(),
  position: Vec2Schema,
  fontSize: FiniteNumber.optional(),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const SceneSchema = z.strictObject({
  personnel: z.array(PersonnelInstanceSchema).default([]),
  equipment: z.array(EquipmentInstanceSchema).default([]),
  connections: z.array(ConnectionSchema).default([]),
  zones: z.array(ZoneSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  /** Suggested initial viewport in world coordinates. */
  viewport: RectSchema.optional(),
});
export type Scene = z.infer<typeof SceneSchema>;
export type SceneInput = z.input<typeof SceneSchema>;
