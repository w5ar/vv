import type {
  AssetType,
  CommandType,
  Confidence,
  IssueSeverity,
  Provenance,
  ReviewStatus,
  SimEvent,
  SimulationState,
  StepStatus,
} from '@fds/domain';
import { objectName, type ExerciseContext } from '@fds/simulation-engine';

/** Croatian user-facing labels. Identifiers and codes stay in English. */

export const STEP_STATUS: Record<StepStatus, string> = {
  locked: 'Čeka prethodne korake',
  available: 'Dostupno',
  completed: 'Dovršeno',
};

export const SEVERITY: Record<IssueSeverity, string> = {
  error: 'Greška',
  warning: 'Upozorenje',
  info: 'Informacija',
};

export const PROVENANCE: Record<Provenance, string> = {
  source: 'Izvorni materijal',
  derived: 'Izvedeno (za provjeru)',
  synthetic: 'Sintetički',
  assumption: 'Tehnička pretpostavka',
};

export const REVIEW: Record<ReviewStatus, string> = {
  verified: 'Provjereno',
  'requires-review': 'Čeka stručnu provjeru',
  rejected: 'Odbijeno',
};

export const COMMAND: Record<CommandType, string> = {
  MovePersonnel: 'Pomicanje osobe',
  MoveEquipment: 'Pomicanje opreme',
  RotateObject: 'Rotacija',
  PickUpEquipment: 'Uzimanje opreme',
  PlaceEquipment: 'Odlaganje opreme',
  ConnectPorts: 'Spajanje',
  DisconnectPorts: 'Odspajanje',
  AssignRole: 'Dodjela uloge',
  BeginAction: 'Početak radnje',
  CompleteAction: 'Završetak radnje',
  SetObjectState: 'Promjena stanja',
};

export const ASSET_TYPE: Record<AssetType, string> = {
  'symbol-svg': 'SVG simbol',
  'diagram-svg': 'SVG crtež',
  'procedure-md': 'Markdown postupak',
  'raster-image': 'Rasterska slika',
  pdf: 'PDF',
  other: 'Ostalo',
};

export const CONFIDENCE: Record<Confidence, string> = {
  metadata: 'Metapodaci',
  heuristic: 'Heuristika – provjeriti',
  unresolved: 'Neprepoznato',
};

export const MAPPING_STATUS = { mapped: 'Povezano', unmapped: 'Nepovezano', ignored: 'Zanemareno' } as const;

/** One-line Croatian description of a simulation event. */
export function describeEvent(ctx: ExerciseContext, e: SimEvent, state?: SimulationState): string | null {
  const name = (id: string) => objectName(ctx, state?.objects[id], id);
  const step = (id: string) => ctx.steps.get(id)?.title ?? id;
  switch (e.type) {
    case 'PersonnelMoved':
      return `${name(e.personnelId)} se premješta.`;
    case 'EquipmentMoved':
      return `${name(e.equipmentId)} je premješten.`;
    case 'ObjectRotated':
      return `${name(e.objectId)} je zakrenut na ${Math.round(e.to)}°.`;
    case 'EquipmentPickedUp':
      return `${name(e.personnelId)} uzima: ${name(e.equipmentId)}.`;
    case 'EquipmentPlaced':
      return `${name(e.personnelId)} odlaže: ${name(e.equipmentId)}.`;
    case 'PortsConnected':
      return `Spojeno: ${name(e.connection.a.objectId)} (${e.connection.a.portId}) – ${name(e.connection.b.objectId)} (${e.connection.b.portId}).`;
    case 'PortsDisconnected':
      return `Odspojeno: ${name(e.connection.a.objectId)} – ${name(e.connection.b.objectId)}.`;
    case 'RoleAssigned':
      return `${name(e.personnelId)}: uloga ${e.roleId ? (ctx.catalog.roles.get(e.roleId)?.name ?? e.roleId) : 'uklonjena'}.`;
    case 'ActionBegan':
      return `Započeta radnja: ${ctx.actions.get(e.actionId)?.name ?? e.actionId}.`;
    case 'ActionCompleted':
      return `Izvršena radnja: ${ctx.actions.get(e.actionId)?.name ?? e.actionId}.`;
    case 'ObjectStateChanged':
      return `${name(e.objectId)}: stanje „${e.to}”.`;
    case 'StepAvailable':
      return null;
    case 'StepCompleted':
      return `✔ Korak dovršen: ${step(e.stepId)}${e.outOfOrder ? ' (izvan redoslijeda)' : ''}.`;
    case 'StageCompleted':
      return `✔ Faza dovršena: ${ctx.stages.get(e.stageId)?.name ?? e.stageId}.`;
    case 'ExerciseCompleted':
      return '🏁 Vježba je završena.';
    case 'OrderDeviation':
      return `⚠ Odstupanje od redoslijeda: ${step(e.stepId)}.`;
    case 'RuleWarning':
      return `⚠ ${e.message}`;
  }
}
