import { create } from 'zustand';
import { connectionIdFor } from '@fds/connection-engine';
import type { Exercise, Id, PortRef, Scene } from '@fds/domain';
import { normalizeAngle, type Vec2 } from '@fds/geometry';

/**
 * Authoring state for the exercise editor: an immutable draft plus undo/redo
 * stacks of previous drafts. Edits change the initial scene and stage
 * metadata only; they never touch simulation state.
 */

const HISTORY_LIMIT = 100;

interface EditorState {
  base: Exercise | null;
  draft: Exercise | null;
  past: Exercise[];
  future: Exercise[];
  dirty: boolean;
  load: (base: Exercise, draft?: Exercise | null) => void;
  apply: (label: string, fn: (e: Exercise) => Exercise) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  discard: () => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  base: null,
  draft: null,
  past: [],
  future: [],
  dirty: false,
  load: (base, draft) => set({ base, draft: draft ?? base, past: [], future: [], dirty: false }),
  apply: (_label, fn) => {
    const { draft, past } = get();
    if (!draft) return;
    const next = fn(draft);
    if (next === draft) return;
    set({ draft: next, past: [...past, draft].slice(-HISTORY_LIMIT), future: [], dirty: true });
  },
  undo: () => {
    const { draft, past, future } = get();
    const prev = past[past.length - 1];
    if (!draft || !prev) return;
    set({ draft: prev, past: past.slice(0, -1), future: [draft, ...future], dirty: true });
  },
  redo: () => {
    const { draft, past, future } = get();
    const next = future[0];
    if (!draft || !next) return;
    set({ draft: next, past: [...past, draft], future: future.slice(1), dirty: true });
  },
  markSaved: () => set({ dirty: false }),
  discard: () => {
    const { base } = get();
    if (base) set({ draft: base, past: [], future: [], dirty: false });
  },
}));

function withScene(e: Exercise, fn: (s: Scene) => Scene): Exercise {
  return { ...e, initialScene: fn(e.initialScene) };
}

/** Pure scene edit operations (used by the editor and unit tests). */
export const edits = {
  move(e: Exercise, id: Id, position: Vec2): Exercise {
    return withScene(e, (s) => ({
      ...s,
      personnel: s.personnel.map((p) => (p.id === id ? { ...p, position } : p)),
      equipment: s.equipment.map((q) => (q.id === id ? { ...q, position } : q)),
    }));
  },
  rotate(e: Exercise, id: Id, rotation: number): Exercise {
    const r = normalizeAngle(rotation);
    return withScene(e, (s) => ({
      ...s,
      personnel: s.personnel.map((p) => (p.id === id ? { ...p, rotation: r } : p)),
      equipment: s.equipment.map((q) => (q.id === id ? { ...q, rotation: r } : q)),
    }));
  },
  setLabel(e: Exercise, id: Id, label: string): Exercise {
    const value = label.trim() || undefined;
    return withScene(e, (s) => ({
      ...s,
      personnel: s.personnel.map((p) => (p.id === id ? { ...p, label: value } : p)),
      equipment: s.equipment.map((q) => (q.id === id ? { ...q, label: value } : q)),
    }));
  },
  setRole(e: Exercise, id: Id, roleId: Id | null): Exercise {
    return withScene(e, (s) => ({ ...s, personnel: s.personnel.map((p) => (p.id === id ? { ...p, roleId } : p)) }));
  },
  uniqueId(e: Exercise, base: string): Id {
    const taken = new Set([...e.initialScene.personnel.map((p) => p.id), ...e.initialScene.equipment.map((q) => q.id)]);
    const stem = base.replace(/^[a-z]+\./, '').replace(/[^A-Za-z0-9._-]/g, '-');
    for (let n = 1; ; n++) {
      const id = `${stem}-${n}`;
      if (!taken.has(id)) return id;
    }
  },
  addPersonnel(e: Exercise, symbolId: Id, roleId: Id | null, position: Vec2): Exercise {
    const id = edits.uniqueId(e, roleId ?? 'osoba');
    return withScene(e, (s) => ({
      ...s,
      personnel: [...s.personnel, { id, symbolId, roleId, position, rotation: 0, provenance: 'derived', review: { status: 'requires-review' }, sources: [] }],
    }));
  },
  addEquipment(e: Exercise, typeId: Id, position: Vec2): Exercise {
    const id = edits.uniqueId(e, typeId);
    return withScene(e, (s) => ({
      ...s,
      equipment: [
        ...s.equipment,
        { id, typeId, position, rotation: 0, carriedBy: null, provenance: 'derived', review: { status: 'requires-review' }, sources: [] },
      ],
    }));
  },
  remove(e: Exercise, id: Id): Exercise {
    return withScene(e, (s) => ({
      ...s,
      personnel: s.personnel.filter((p) => p.id !== id),
      equipment: s.equipment.filter((q) => q.id !== id).map((q) => (q.carriedBy === id ? { ...q, carriedBy: null } : q)),
      connections: s.connections.filter((c) => c.a.objectId !== id && c.b.objectId !== id),
    }));
  },
  connect(e: Exercise, a: PortRef, b: PortRef): Exercise {
    const id = connectionIdFor(a, b);
    if (e.initialScene.connections.some((c) => c.id === id)) return e;
    return withScene(e, (s) => ({ ...s, connections: [...s.connections, { id, a, b }] }));
  },
  disconnect(e: Exercise, connectionId: Id): Exercise {
    return withScene(e, (s) => ({ ...s, connections: s.connections.filter((c) => c.id !== connectionId) }));
  },
  renameStage(e: Exercise, stageId: Id, name: string): Exercise {
    if (!name.trim()) return e;
    return { ...e, stages: e.stages.map((s) => (s.id === stageId ? { ...s, name } : s)) };
  },
  describeStage(e: Exercise, stageId: Id, description: string): Exercise {
    return { ...e, stages: e.stages.map((s) => (s.id === stageId ? { ...s, description: description || undefined } : s)) };
  },
};
