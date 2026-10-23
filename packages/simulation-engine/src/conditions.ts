import { connectedComponent, connectionsAtPort } from '@fds/connection-engine';
import type { Condition, PortSelector, SimulationState, Zone } from '@fds/domain';
import { angleDelta, distance, distanceToPlacement, rectContains, type Vec2 } from '@fds/geometry';
import type { ExerciseContext } from './context';
import { connectionList, placementOfObject } from './world';

function selectorMatches(state: SimulationState, sel: PortSelector, objectId: string, portId: string): boolean {
  if (!sel.objectId && !sel.typeId) return false;
  if (sel.objectId && sel.objectId !== objectId) return false;
  if (sel.typeId && state.objects[objectId]?.typeId !== sel.typeId) return false;
  return sel.portId === undefined || sel.portId === portId;
}

export function pointInZone(zone: Zone, p: Vec2): boolean {
  const shape = zone.shape;
  if (shape.type === 'rect') return rectContains(shape.rect, p);
  return distance(shape.center, p) <= shape.radius;
}

/** Evaluates a declarative condition against a state. Unknown references evaluate to false. */
export function evaluateCondition(ctx: ExerciseContext, state: SimulationState, condition: Condition): boolean {
  switch (condition.type) {
    case 'all':
      return condition.of.every((c) => evaluateCondition(ctx, state, c));
    case 'any':
      return condition.of.some((c) => evaluateCondition(ctx, state, c));
    case 'not':
      return !evaluateCondition(ctx, state, condition.of);
    case 'stepCompleted':
      return state.steps[condition.stepId]?.status === 'completed';
    case 'actionCompleted':
      return state.actions[condition.actionId]?.status === 'completed';
    case 'actionActive':
      return state.actions[condition.actionId]?.status === 'active';
    case 'connected': {
      const { a, b } = condition;
      return connectionList(state).some(
        (c) =>
          (selectorMatches(state, a, c.a.objectId, c.a.portId) && selectorMatches(state, b, c.b.objectId, c.b.portId)) ||
          (selectorMatches(state, a, c.b.objectId, c.b.portId) && selectorMatches(state, b, c.a.objectId, c.a.portId)),
      );
    }
    case 'linked':
      if (!state.objects[condition.a] || !state.objects[condition.b]) return false;
      return connectedComponent(connectionList(state), condition.a).has(condition.b);
    case 'portFree':
      return state.objects[condition.port.objectId] !== undefined && connectionsAtPort(connectionList(state), condition.port).length === 0;
    case 'inZone': {
      const obj = state.objects[condition.objectId];
      const zone = ctx.zones.get(condition.zoneId);
      return !!obj && !!zone && pointInZone(zone, obj.position);
    }
    case 'near': {
      const obj = state.objects[condition.objectId];
      const target = state.objects[condition.targetId];
      if (!obj || !target) return false;
      const placement = placementOfObject(ctx, target);
      const d = placement ? distanceToPlacement(placement, obj.position) : distance(obj.position, target.position);
      return d <= condition.maxDistance;
    }
    case 'carrying': {
      const p = state.objects[condition.personnelId];
      if (!p) return false;
      const items = p.carrying.filter(
        (id) => (condition.equipmentId === undefined || id === condition.equipmentId) && (condition.typeId === undefined || state.objects[id]?.typeId === condition.typeId),
      );
      return items.length >= (condition.count ?? 1);
    }
    case 'placed': {
      const e = state.objects[condition.equipmentId];
      return !!e && e.kind === 'equipment' && e.carriedBy === null && !e.storedIn;
    }
    case 'stored': {
      const inContainer = (id: string) => {
        const e = state.objects[id];
        return !!e?.storedIn && (condition.containerId === undefined || e.storedIn === condition.containerId);
      };
      if (condition.equipmentId) return inContainer(condition.equipmentId);
      if (!condition.typeId) return false;
      const stored = state.objectOrder.filter((id) => state.objects[id]?.typeId === condition.typeId && inContainer(id));
      return stored.length >= (condition.count ?? 1);
    }
    case 'laid': {
      if (condition.equipmentId) return state.objects[condition.equipmentId]?.layout != null;
      if (!condition.typeId) return false;
      const laid = state.objectOrder.filter((id) => state.objects[id]?.typeId === condition.typeId && state.objects[id]?.layout != null);
      return laid.length >= (condition.count ?? 1);
    }
    case 'hasRole':
      return state.objects[condition.personnelId]?.roleId === condition.roleId;
    case 'objectState':
      return state.objects[condition.objectId]?.visualState === condition.state;
    case 'rotation': {
      const obj = state.objects[condition.objectId];
      return !!obj && Math.abs(angleDelta(obj.rotation, condition.angle)) <= condition.tolerance;
    }
  }
}
