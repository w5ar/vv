import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestExercise } from '@fds/domain/testing';
import { edits, useEditor } from './editor-store';

describe('editor edits', () => {
  const base = makeTestExercise();

  it('moves, rotates and labels objects immutably', () => {
    const moved = edits.move(base, 'p1', { x: 10, y: 20 });
    expect(moved.initialScene.personnel[0]?.position).toEqual({ x: 10, y: 20 });
    expect(base.initialScene.personnel[0]?.position).toEqual({ x: 100, y: 300 });
    expect(edits.rotate(base, 'splitter', -90).initialScene.equipment.find((e) => e.id === 'splitter')?.rotation).toBe(270);
    expect(edits.setLabel(base, 'p1', '  ').initialScene.personnel[0]?.label).toBeUndefined();
  });

  it('adds objects with unique ids and removes them together with their connections', () => {
    const added = edits.addEquipment(edits.addEquipment(base, 'et.hose', { x: 0, y: 0 }), 'et.hose', { x: 5, y: 5 });
    const ids = added.initialScene.equipment.map((e) => e.id);
    expect(ids).toContain('hose-1');
    expect(ids).toContain('hose-2');
    const connected = edits.connect(added, { objectId: 'hose-1', portId: 'end-a' }, { objectId: 'source', portId: 'out-1' });
    expect(connected.initialScene.connections).toHaveLength(1);
    expect(edits.connect(connected, { objectId: 'source', portId: 'out-1' }, { objectId: 'hose-1', portId: 'end-a' })).toBe(connected);
    expect(edits.remove(connected, 'hose-1').initialScene.connections).toHaveLength(0);
  });

  it('renames stages but ignores empty names', () => {
    expect(edits.renameStage(base, 'stage.1', 'Nova faza').stages[0]?.name).toBe('Nova faza');
    expect(edits.renameStage(base, 'stage.1', '   ')).toBe(base);
  });
});

describe('editor undo/redo', () => {
  beforeEach(() => useEditor.getState().load(makeTestExercise()));

  it('undoes and redoes edits in order', () => {
    const { apply } = useEditor.getState();
    apply('move', (e) => edits.move(e, 'p1', { x: 1, y: 1 }));
    apply('move', (e) => edits.move(e, 'p1', { x: 2, y: 2 }));
    const pos = () => useEditor.getState().draft?.initialScene.personnel[0]?.position;
    expect(pos()).toEqual({ x: 2, y: 2 });
    useEditor.getState().undo();
    expect(pos()).toEqual({ x: 1, y: 1 });
    useEditor.getState().undo();
    expect(pos()).toEqual({ x: 100, y: 300 });
    useEditor.getState().redo();
    expect(pos()).toEqual({ x: 1, y: 1 });
    // A new edit clears the redo stack.
    useEditor.getState().apply('move', (e) => edits.move(e, 'p1', { x: 9, y: 9 }));
    expect(useEditor.getState().future).toHaveLength(0);
    useEditor.getState().discard();
    expect(pos()).toEqual({ x: 100, y: 300 });
    expect(useEditor.getState().dirty).toBe(false);
  });
});
