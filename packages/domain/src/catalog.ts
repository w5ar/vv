import { z } from 'zod';
import {
  FiniteNumber,
  IdSchema,
  SemanticPropertiesSchema,
  SizeSchema,
  Vec2Schema,
  traceShape,
} from './common';

/**
 * The catalog groups reusable definitions: symbol categories, SVG symbol
 * definitions, port types and their declared compatibility rules, equipment
 * types and personnel roles. Exercises reference a catalog by id and only
 * contain instances.
 */

export const SymbolCategorySchema = z.strictObject({
  id: IdSchema,
  /** Croatian display name. */
  name: z.string().min(1),
  description: z.string().optional(),
});
export type SymbolCategory = z.infer<typeof SymbolCategorySchema>;

export const PortFlowSchema = z.enum(['in', 'out', 'bidirectional']);
export type PortFlow = z.infer<typeof PortFlowSchema>;

export const PortDefinitionSchema = z.strictObject({
  /** Unique within its symbol. */
  id: IdSchema,
  /** References {@link PortType.id}. */
  type: IdSchema,
  /** Symbol-local coordinates (relative to the symbol's top-left corner, logical units). */
  position: Vec2Schema,
  /** Optional outward direction in degrees (0 = right, 90 = down) in symbol-local space. */
  direction: FiniteNumber.optional(),
  maxConnections: z.number().int().min(1).default(1),
  /** Optional, purely descriptive flow role; it does not drive any hydraulics. */
  flow: PortFlowSchema.default('bidirectional'),
  label: z.string().optional(),
});
export type PortDefinition = z.infer<typeof PortDefinitionSchema>;

export const AnchorDefinitionSchema = z.strictObject({
  id: IdSchema,
  position: Vec2Schema,
  label: z.string().optional(),
});
export type AnchorDefinition = z.infer<typeof AnchorDefinitionSchema>;

export const SvgAssetRefSchema = z.strictObject({
  /** Repository-relative path to the original SVG file. */
  path: z.string().min(1),
  /** When a file holds several symbols, the id of the element that forms this symbol. */
  elementId: z.string().optional(),
  /** Explicit viewBox `[minX, minY, width, height]`; required when `elementId` is used. */
  viewBox: z.tuple([FiniteNumber, FiniteNumber, z.number().positive(), z.number().positive()]).optional(),
});
export type SvgAssetRef = z.infer<typeof SvgAssetRefSchema>;

export const RotationPolicySchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('none') }),
  z.strictObject({ mode: z.literal('free') }),
  z.strictObject({ mode: z.literal('step'), stepDegrees: z.number().positive().max(360) }),
]);
export type RotationPolicy = z.infer<typeof RotationPolicySchema>;

export const VisualStateSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** SVG element ids (original ids) to show in this state. */
  show: z.array(z.string()).default([]),
  /** SVG element ids (original ids) to hide in this state. */
  hide: z.array(z.string()).default([]),
  opacity: z.number().min(0).max(1).optional(),
});
export type VisualState = z.infer<typeof VisualStateSchema>;

export const SymbolDefinitionSchema = z.strictObject({
  id: IdSchema,
  /** Original Croatian name. */
  name: z.string().min(1),
  category: IdSchema,
  description: z.string().optional(),
  asset: SvgAssetRefSchema,
  /** Logical size in scene units. The SVG is scaled to this box. */
  size: SizeSchema,
  /** Local point placed at the instance position and used as rotation centre. Defaults to the centre. */
  pivot: Vec2Schema.optional(),
  anchors: z.array(AnchorDefinitionSchema).default([]),
  ports: z.array(PortDefinitionSchema).default([]),
  rotation: RotationPolicySchema.default({ mode: 'free' }),
  semantics: SemanticPropertiesSchema.default({}),
  visualStates: z.array(VisualStateSchema).default([]),
  defaultState: IdSchema.optional(),
  /**
   * Personnel symbols: a separate marker symbol drawn at `distance` from the centre in the
   * facing direction (e.g. the "smjer" tick next to the circle).
   */
  directionMarker: z.strictObject({ symbolId: IdSchema, distance: z.number().positive() }).optional(),
  /** Drawing element used only to annotate diagrams (direction tick, coupling tick, dimension arrow); never a scene object. */
  annotation: z.boolean().default(false),
  ...traceShape,
});
export type SymbolDefinition = z.infer<typeof SymbolDefinitionSchema>;
export type SymbolDefinitionInput = z.input<typeof SymbolDefinitionSchema>;

export const PortTypeSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  ...traceShape,
});
export type PortType = z.infer<typeof PortTypeSchema>;

/**
 * Declared compatibility between two port types (unordered pair).
 * Compatibility is never derived from visual appearance: a pair is
 * compatible only when an `allow` rule exists and no `deny` rule matches.
 */
export const ConnectionRuleSchema = z.strictObject({
  id: IdSchema,
  portTypes: z.tuple([IdSchema, IdSchema]),
  effect: z.enum(['allow', 'deny']).default('allow'),
  message: z.string().optional(),
  ...traceShape,
});
export type ConnectionRule = z.infer<typeof ConnectionRuleSchema>;

export const EquipmentTypeSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  symbolId: IdSchema,
  description: z.string().optional(),
  /** Whether personnel can pick it up and carry it. */
  portable: z.boolean().default(false),
  /**
   * `hose`: a flexible item shown with `symbolId` when rolled (coil) and as a line between its two
   * end ports when laid (LayHose / RollUpHose). `rigid`: a normal symbol.
   */
  form: z.enum(['rigid', 'hose']).default('rigid'),
  /**
   * How a carried item is held. `beside`: drawn compact beside the carrier. `held`: a bulky item
   * (e.g. a suction hose) that is lifted where it lies — it keeps its place, size and rotation
   * when picked up and moves with the carrier.
   */
  carry: z.enum(['beside', 'held']).default('beside'),
  /** Vehicles: equipment can be stored in its compartments and taken from them (StoreEquipment / PickUpEquipment). */
  container: z.boolean().default(false),
  /** Hose only: port ids at end A (laid from) and end B (laid to). */
  hoseEnds: z.tuple([IdSchema, IdSchema]).optional(),
  /** Hose only: symbol stretched along the laid hose. */
  laidSymbolId: IdSchema.optional(),
  /** How diagrams depict this type (used to recognise and compare stage diagrams). */
  depiction: z
    .strictObject({
      /** Stroke width of a laid line of this type in diagrams. */
      laidLineStrokeWidth: z.number().positive().optional(),
      /** Symbol drawn instead of `symbolId` while the item is connected (e.g. a nozzle tip on a laid line). */
      attachedSymbolId: IdSchema.optional(),
      /** Symbol drawn across each end of a laid line (coupling tick), oriented along the line. */
      couplingSymbolId: IdSchema.optional(),
      /**
       * Worn equipment (e.g. a breathing apparatus): while carried it is drawn as `symbolId`
       * behind the carrier, opposite the facing direction, at `distance` from the carrier's centre.
       */
      worn: z.strictObject({ symbolId: IdSchema, distance: z.number().positive() }).optional(),
      /**
       * Stroke width of the line diagrams draw for items of this type connected into one line
       * (e.g. an assembled suction line). Such items may be shown either as symbols or as the line.
       */
      assembledLineStrokeWidth: z.number().positive().optional(),
    })
    .optional(),
  properties: SemanticPropertiesSchema.default({}),
  ...traceShape,
});
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;

export const RoleDefinitionSchema = z.strictObject({
  id: IdSchema,
  /** Original Croatian role name. */
  name: z.string().min(1),
  abbreviation: z.string().optional(),
  description: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  /** Default personnel symbol for this role. */
  symbolId: IdSchema.optional(),
  ...traceShape,
});
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;

export const CatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  synthetic: z.boolean().default(false),
  categories: z.array(SymbolCategorySchema).default([]),
  portTypes: z.array(PortTypeSchema).default([]),
  connectionRules: z.array(ConnectionRuleSchema).default([]),
  symbols: z.array(SymbolDefinitionSchema).default([]),
  equipmentTypes: z.array(EquipmentTypeSchema).default([]),
  roles: z.array(RoleDefinitionSchema).default([]),
});
export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogInput = z.input<typeof CatalogSchema>;
