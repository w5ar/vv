import { z } from 'zod';
import { CommandSchema, CommandTypeSchema } from './commands';
import { ConditionSchema } from './conditions';
import { RoleDefinitionSchema } from './catalog';
import { IdSchema, SourceRefSchema, Vec2Schema, traceShape } from './common';
import { SceneSchema } from './scene';
import { DiagnosticSchema } from './issues';

/**
 * Exercise definition. One definition drives all three operating modes:
 * demonstration (uses step scripts), interactive training and assessment
 * (both use step completion conditions, dependencies and rules).
 */

/** Non-spatial procedural action (e.g. a spoken order or report), executed with BeginAction/CompleteAction. */
export const ProceduralActionSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Roles allowed to perform the action. Empty = any personnel. */
  actorRoleIds: z.array(IdSchema).default([]),
  /** Minimum number of actors. */
  minActors: z.number().int().min(0).default(1),
  requires: ConditionSchema.optional(),
  /** Demonstration duration between BeginAction and CompleteAction. */
  durationMs: z.number().nonnegative().optional(),
  /**
   * Words spoken aloud when the action is performed (an order or a report), verbatim from the
   * source. Voiced by the order voice in demonstrations with sound.
   */
  speech: z.string().min(1).optional(),
  ...traceShape,
});
export type ProceduralAction = z.infer<typeof ProceduralActionSchema>;

export const ScriptedCommandSchema = z.strictObject({
  command: CommandSchema,
  /** Visual duration in the demonstration; defaults come from `animation`. */
  durationMs: z.number().nonnegative().optional(),
  /** Pause before this command starts. */
  delayMs: z.number().nonnegative().default(0),
  /** Start together with the previous scripted command of the same step. */
  withPrevious: z.boolean().default(false),
  /** Optional narration shown while the command plays (Croatian). */
  caption: z.string().optional(),
});
export type ScriptedCommand = z.infer<typeof ScriptedCommandSchema>;

export const StepSchema = z.strictObject({
  id: IdSchema,
  /** Short Croatian title. */
  title: z.string().min(1),
  /** Original wording from the source procedure (verbatim). */
  text: z.string().optional(),
  stageId: IdSchema.optional(),
  actorRoleIds: z.array(IdSchema).default([]),
  /** Partial order: steps that must be completed before this one. */
  dependsOn: z.array(IdSchema).default([]),
  optional: z.boolean().default(false),
  /** State predicate that marks the step as done (used in training and assessment). */
  completedWhen: ConditionSchema,
  /** Optional training hint (Croatian). */
  hint: z.string().optional(),
  /** Demonstration script: the commands that perform this step. */
  script: z.array(ScriptedCommandSchema).default([]),
  ...traceShape,
});
export type Step = z.infer<typeof StepSchema>;
export type StepInput = z.input<typeof StepSchema>;

export const StageSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Diagram (file + layer/group anchor) that depicts this stage. */
  diagram: SourceRefSchema.optional(),
  /** Whether the diagram shows the situation at the start or at the end of the stage. */
  diagramMoment: z.enum(['start', 'end']).default('end'),
  /**
   * `exact`: diagram coordinates are the exercise world frame (positions are compared).
   * `schematic`: the diagram is not to scale; only which symbols are shown (counts) is compared.
   */
  diagramScale: z.enum(['exact', 'schematic']).default('exact'),
  ...traceShape,
});
export type Stage = z.infer<typeof StageSchema>;

export const ObjectSelectorSchema = z.strictObject({
  objectIds: z.array(IdSchema).optional(),
  symbolIds: z.array(IdSchema).optional(),
  categories: z.array(IdSchema).optional(),
  kinds: z.array(z.enum(['personnel', 'equipment'])).optional(),
});
export type ObjectSelector = z.infer<typeof ObjectSelectorSchema>;

export const CommandMatcherSchema = z.strictObject({
  commandTypes: z.array(CommandTypeSchema).min(1),
  /** Matches when the command references any of these objects. */
  objectIds: z.array(IdSchema).optional(),
  /** Matches when the command references any of these ports (`objectId#portId`). */
  portKeys: z.array(z.string()).optional(),
  actionIds: z.array(IdSchema).optional(),
});
export type CommandMatcher = z.infer<typeof CommandMatcherSchema>;

export const SeveritySchema = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const CommandPreconditionRuleSchema = z.strictObject({
  type: z.literal('commandPrecondition'),
  id: IdSchema,
  description: z.string().optional(),
  when: CommandMatcherSchema,
  /** Evaluated against the state *before* the command executes. */
  requires: ConditionSchema,
  /** `error` rejects the command, `warning` accepts it and records a warning. */
  severity: z.enum(['error', 'warning']).default('error'),
  message: z.string().min(1),
  ...traceShape,
});
export type CommandPreconditionRule = z.infer<typeof CommandPreconditionRuleSchema>;

/** Prohibited overlap between two groups of objects. All other overlap is allowed (schematic symbols may overlap). */
export const NoOverlapRuleSchema = z.strictObject({
  type: z.literal('noOverlap'),
  id: IdSchema,
  description: z.string().optional(),
  groupA: ObjectSelectorSchema,
  groupB: ObjectSelectorSchema,
  severity: z.enum(['error', 'warning']).default('error'),
  message: z.string().min(1),
  ...traceShape,
});
export type NoOverlapRule = z.infer<typeof NoOverlapRuleSchema>;

export const ValidationRuleSchema = z.discriminatedUnion('type', [CommandPreconditionRuleSchema, NoOverlapRuleSchema]);
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;

/**
 * Simulation mechanics parameters. These are technical defaults
 * (provenance `assumption`), not firefighting doctrine.
 */
export const ExerciseSettingsSchema = z.strictObject({
  /** Max distance between personnel and equipment for PickUpEquipment. */
  pickUpDistance: z.number().positive().default(70),
  /** Max distance between carrier and target point for PlaceEquipment. */
  placeDistance: z.number().positive().default(90),
  /** Snap radius used by the editor and interactive mode. */
  snapDistance: z.number().nonnegative().default(24),
  /** When set, ConnectPorts requires both ports to be within this distance. */
  connectionMaxDistance: z.number().positive().nullable().default(null),
  /** When set, limits how many items one person can carry. */
  maxCarriedPerPerson: z.number().int().positive().nullable().default(null),
  /** Handling of actions that complete a step before its dependencies: warn, reject or ignore. */
  orderPolicy: z.enum(['warn', 'reject', 'ignore']).default('warn'),
  /**
   * `non-portable-only`: portable equipment changes place only by being carried
   * (PickUp/Place); MoveEquipment is limited to non-portable objects such as vehicles.
   */
  equipmentMovePolicy: z.enum(['any', 'non-portable-only']).default('non-portable-only'),
  /** Visual offset of carried equipment relative to the carrier. */
  carryOffset: Vec2Schema.default({ x: 22, y: -18 }),
});
export type ExerciseSettings = z.infer<typeof ExerciseSettingsSchema>;

export const AnimationDefaultsSchema = z.strictObject({
  /** Logical units per second for moves. */
  moveSpeed: z.number().positive().default(140),
  minMoveMs: z.number().nonnegative().default(400),
  rotateMs: z.number().nonnegative().default(500),
  pickUpMs: z.number().nonnegative().default(600),
  placeMs: z.number().nonnegative().default(600),
  connectMs: z.number().nonnegative().default(800),
  disconnectMs: z.number().nonnegative().default(500),
  assignRoleMs: z.number().nonnegative().default(300),
  handOverMs: z.number().nonnegative().default(600),
  /** Logical units per second for laying and rolling up hoses. */
  hoseSpeed: z.number().positive().default(220),
  setStateMs: z.number().nonnegative().default(400),
  beginActionMs: z.number().nonnegative().default(200),
  actionMs: z.number().nonnegative().default(1500),
  /** Pause inserted between dependent steps. */
  stepGapMs: z.number().nonnegative().default(300),
});
export type AnimationDefaults = z.infer<typeof AnimationDefaultsSchema>;

export const CompletionSchema = z.strictObject({
  /** `all` = every non-optional step; or an explicit list of step ids. */
  requiredSteps: z.union([z.literal('all'), z.array(IdSchema)]).default('all'),
  /** Optional condition that must hold in the final state. */
  finalCondition: ConditionSchema.optional(),
});
export type Completion = z.infer<typeof CompletionSchema>;

export const AssessmentCriterionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('allRequiredStepsCompleted'), id: IdSchema, label: z.string() }),
  z.strictObject({
    type: z.literal('maxRejectedCommands'),
    id: IdSchema,
    label: z.string(),
    limit: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('maxOrderDeviations'),
    id: IdSchema,
    label: z.string(),
    limit: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal('timeLimitMs'), id: IdSchema, label: z.string(), limit: z.number().positive() }),
]);
export type AssessmentCriterion = z.infer<typeof AssessmentCriterionSchema>;

/** Exercise-specific evaluation rules. No criteria = report only, no pass/fail. */
export const AssessmentConfigSchema = z.strictObject({
  criteria: z.array(AssessmentCriterionSchema).default([]),
  showStepListDuringAssessment: z.boolean().default(false),
  ...traceShape,
});
export type AssessmentConfig = z.infer<typeof AssessmentConfigSchema>;

export const ExerciseMetadataSchema = z.strictObject({
  tags: z.array(z.string()).default([]),
  level: z.string().optional(),
  estimatedDurationMin: z.number().positive().optional(),
  authors: z.array(z.string()).default([]),
  version: z.string().optional(),
});
export type ExerciseMetadata = z.infer<typeof ExerciseMetadataSchema>;

export const ExerciseBuildInfoSchema = z.strictObject({
  compiledFrom: z.string(),
  sourceHashes: z.record(z.string(), z.string()).default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
});
export type ExerciseBuildInfo = z.infer<typeof ExerciseBuildInfoSchema>;

export const ExerciseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  title: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  /** True for test fixtures that are not based on authoritative source materials. */
  synthetic: z.boolean().default(false),
  language: z.literal('hr').default('hr'),
  catalogId: IdSchema,
  metadata: ExerciseMetadataSchema.default({ tags: [], authors: [] }),
  ...traceShape,
  settings: ExerciseSettingsSchema.default(ExerciseSettingsSchema.parse({})),
  animation: AnimationDefaultsSchema.default(AnimationDefaultsSchema.parse({})),
  /** Exercise-specific roles, in addition to catalog roles. */
  roles: z.array(RoleDefinitionSchema).default([]),
  actions: z.array(ProceduralActionSchema).default([]),
  initialScene: SceneSchema,
  stages: z.array(StageSchema).default([]),
  steps: z.array(StepSchema).default([]),
  rules: z.array(ValidationRuleSchema).default([]),
  completion: CompletionSchema.default({ requiredSteps: 'all' }),
  assessment: AssessmentConfigSchema.default(AssessmentConfigSchema.parse({})),
  build: ExerciseBuildInfoSchema.optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseInput = z.input<typeof ExerciseSchema>;

export interface ExerciseSummary {
  id: string;
  title: string;
  summary?: string | undefined;
  synthetic: boolean;
  catalogId: string;
  reviewStatus: Exercise['review']['status'];
  provenance: Exercise['provenance'];
  stageCount: number;
  stepCount: number;
  tags: string[];
}

export function summarizeExercise(exercise: Exercise): ExerciseSummary {
  return {
    id: exercise.id,
    title: exercise.title,
    summary: exercise.summary,
    synthetic: exercise.synthetic,
    catalogId: exercise.catalogId,
    reviewStatus: exercise.review.status,
    provenance: exercise.provenance,
    stageCount: exercise.stages.length,
    stepCount: exercise.steps.length,
    tags: exercise.metadata.tags,
  };
}
