import { connectedComponent, connectionsAtPort } from '@fds/connection-engine';
import type { Condition, PortSelector, SimulationState, Zone } from '@fds/domain';
import { angleDelta, distance, distanceToPlacement, rectContains, type Vec2 } from '@fds/geometry';
import type { ExerciseContext } from './context';
import { connectionList, placementOfObject } from './world';

function selectorMatches(sel: PortSelector, objectId: string, portId: string): boolean {
  return sel.objectId === objectId && (sel.portId === undefined || sel.portId === portId);
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
          (selectorMatches(a, c.a.objectId, c.a.portId) && selectorMatches(b, c.b.objectId, c.b.portId)) ||
          (selectorMatches(a, c.b.objectId, c.b.portId) && selectorMatches(b, c.a.objectId, c.a.portId)),
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
      return condition.equipmentId === undefined ? p.carrying.length > 0 : p.carrying.includes(condition.equipmentId);
    }
    case 'placed': {
      const e = state.objects[condition.equipmentId];
      return !!e && e.kind === 'equipment' && e.carriedBy === null;
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
