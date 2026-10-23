import { describe, expect, it } from 'vitest';
import { ExerciseSchema, type Command, type Exercise } from '@fds/domain';
import { makeTestCatalog, makeTestExercise, testExerciseInput } from '@fds/domain/testing';
import {
  SimulationSession,
  appliedCountAt,
  checkExercise,
  compileTimeline,
  createExerciseContext,
  createInitialState,
  evaluateAttempt,
  executeCommand,
  frameAt,
  nextBoundary,
  previousBoundary,
  replay,
  stateAfterEntries,
  stateAt,
  type ExerciseContext,
} from './index';

const catalog = makeTestCatalog();

function ctxFor(mutate?: (e: Exercise) => Exercise): ExerciseContext {
  const ex = makeTestExercise();
  return createExerciseContext(mutate ? mutate(ex) : ex, catalog);
}

function scriptOf(ctx: ExerciseContext, stepIds?: string[]): Command[] {
  const ids = stepIds ?? ctx.exercise.steps.map((s) => s.id);
  return ids.flatMap((id) => ctx.steps.get(id)?.script.map((s) => s.command) ?? []);
}

function run(ctx: ExerciseContext, commands: Command[]) {
  const session = new SimulationSession(ctx);
  const results = commands.map((c) => session.execute(c));
  return { session, results };
}

describe('initial state', () => {
  it('unlocks steps without dependencies only', () => {
    const ctx = ctxFor();
    const s = createInitialState(ctx);
    expect(s.steps.s1?.status).toBe('available');
    expect(s.steps.s2?.status).toBe('available');
    expect(s.steps.s3?.status).toBe('locked');
    expect(s.steps.s5?.status).toBe('locked');
    expect(s.completed).toBe(false);
    expect(s.objects.nozzle?.visualState).toBe('closed');
  });
});

describe('command validation and state transitions', () => {
  const ctx = ctxFor();
  const s0 = createInitialState(ctx);

  it('rejects commands on unknown or wrong-kind objects without changing state', () => {
    const r = executeCommand(ctx, s0, { type: 'MovePersonnel', personnelId: 'ghost', to: { x: 0, y: 0 } });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]?.code).toBe('command.unknown-object');
    expect(r.state).toBe(s0);
    const r2 = executeCommand(ctx, s0, { type: 'MovePersonnel', personnelId: 'hose1', to: { x: 0, y: 0 } });
    expect(r2.issues[0]?.code).toBe('command.wrong-kind');
  });

  it('enforces pick-up preconditions: portability, distance, capacity', () => {
    expect(executeCommand(ctx, s0, { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'source' }).issues.map((i) => i.code)).toContain(
      'pickup.not-portable',
    );
    expect(executeCommand(ctx, s0, { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'hose1' }).issues.map((i) => i.code)).toEqual([
      'pickup.too-far',
    ]);
    const ok = executeCommand(ctx, s0, { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'splitter' });
    expect(ok.accepted).toBe(true);
    expect(ok.state.objects.splitter?.carriedBy).toBe('p1');
    expect(ok.state.objects.p1?.carrying).toEqual(['splitter']);
    expect(ok.events[0]).toMatchObject({ type: 'EquipmentPickedUp', personnelId: 'p1', equipmentId: 'splitter' });
  });

  it('moves carried equipment with its carrier and blocks moving it directly', () => {
    const s1 = executeCommand(ctx, s0, { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'splitter' }).state;
    const s2 = executeCommand(ctx, s1, { type: 'MovePersonnel', personnelId: 'p1', to: { x: 400, y: 160 } }).state;
    expect(s2.objects.splitter?.position).toEqual({ x: 422, y: 142 });
    const r = executeCommand(ctx, s2, { type: 'MoveEquipment', equipmentId: 'splitter', to: { x: 0, y: 0 } });
    expect(r.issues[0]?.code).toBe('command.equipment-carried');
    const far = executeCommand(ctx, s2, { type: 'PlaceEquipment', personnelId: 'p1', equipmentId: 'splitter', at: { x: 900, y: 900 } });
    expect(far.issues[0]?.code).toBe('place.too-far');
  });

  it('requires portable equipment to be carried unless the exercise allows direct moves', () => {
    const r = executeCommand(ctx, s0, { type: 'MoveEquipment', equipmentId: 'hose1', to: { x: 0, y: 0 } });
    expect(r.issues[0]?.code).toBe('move.portable-must-be-carried');
    expect(executeCommand(ctx, s0, { type: 'MoveEquipment', equipmentId: 'source', to: { x: 120, y: 90 } }).accepted).toBe(true);
    const lenient = ctxFor((e) => ({ ...e, settings: { ...e.settings, equipmentMovePolicy: 'any' } }));
    expect(executeCommand(lenient, createInitialState(lenient), { type: 'MoveEquipment', equipmentId: 'hose1', to: { x: 0, y: 0 } }).accepted).toBe(true);
  });

  it('applies rotation policies from the symbol definition', () => {
    expect(executeCommand(ctx, s0, { type: 'RotateObject', objectId: 'source', rotation: 90 }).issues[0]?.code).toBe('rotation.not-allowed');
    expect(executeCommand(ctx, s0, { type: 'RotateObject', objectId: 'splitter', rotation: 45 }).issues[0]?.code).toBe('rotation.invalid-step');
    const ok = executeCommand(ctx, s0, { type: 'RotateObject', objectId: 'splitter', rotation: -90 });
    expect(ok.accepted).toBe(true);
    expect(ok.state.objects.splitter?.rotation).toBe(270);
  });

  it('rejects incompatible connections and explicit duplicate ids', () => {
    const bad = executeCommand(ctx, s0, {
      type: 'ConnectPorts',
      a: { objectId: 'hose1', portId: 'end-b' },
      b: { objectId: 'splitter', portId: 'out-a' },
    });
    expect(bad.issues.map((i) => i.code)).toEqual(['connection.incompatible']);
    const s1 = executeCommand(ctx, s0, {
      type: 'ConnectPorts',
      a: { objectId: 'source', portId: 'out-1' },
      b: { objectId: 'hose1', portId: 'end-a' },
      connectionId: 'c1',
    }).state;
    const dup = executeCommand(ctx, s1, {
      type: 'ConnectPorts',
      a: { objectId: 'source', portId: 'out-2' },
      b: { objectId: 'hose1', portId: 'end-b' },
      connectionId: 'c1',
    });
    expect(dup.issues[0]?.code).toBe('connection.id-taken');
    const disc = executeCommand(ctx, s1, { type: 'DisconnectPorts', connectionId: 'c1' });
    expect(disc.accepted).toBe(true);
    expect(disc.state.connectionOrder).toEqual([]);
    expect(disc.events[0]?.type).toBe('PortsDisconnected');
  });

  it('enforces exercise command-precondition rules', () => {
    const r = executeCommand(ctx, s0, {
      type: 'ConnectPorts',
      a: { objectId: 'splitter', portId: 'out-a' },
      b: { objectId: 'nozzle', portId: 'in' },
    });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: 'rule.precondition', ruleId: 'rule.nozzle-after-hose' });
  });

  it('enforces prohibited overlap but allows other overlap', () => {
    const onSource = executeCommand(ctx, s0, { type: 'MovePersonnel', personnelId: 'p1', to: { x: 100, y: 100 } });
    expect(onSource.issues[0]).toMatchObject({ code: 'rule.overlap', ruleId: 'rule.no-overlap-source' });
    // Personnel overlapping other personnel is not prohibited.
    const onPerson = executeCommand(ctx, s0, { type: 'MovePersonnel', personnelId: 'p1', to: { x: 165, y: 300 } });
    expect(onPerson.accepted).toBe(true);
  });

  it('validates procedural actions: roles and preconditions', () => {
    const wrongRole = executeCommand(ctx, s0, { type: 'BeginAction', actionId: 'act.report', actorIds: ['p1'] });
    expect(wrongRole.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['action.wrong-role', 'action.precondition']));
    const notActive = executeCommand(ctx, s0, { type: 'CompleteAction', actionId: 'act.report' });
    expect(notActive.issues[0]?.code).toBe('action.not-active');
  });

  it('validates visual states', () => {
    expect(executeCommand(ctx, s0, { type: 'SetObjectState', objectId: 'nozzle', state: 'open' }).accepted).toBe(true);
    expect(executeCommand(ctx, s0, { type: 'SetObjectState', objectId: 'nozzle', state: 'broken' }).issues[0]?.code).toBe('state.unknown');
  });
});

describe('procedure progression', () => {
  it('completes the exercise when the full script is executed', () => {
    const ctx = ctxFor();
    const { session, results } = run(ctx, scriptOf(ctx));
    expect(results.every((r) => r.accepted)).toBe(true);
    expect(session.state.completed).toBe(true);
    const events = results.flatMap((r) => r.events.map((e) => e.type));
    expect(events.filter((t) => t === 'StepCompleted')).toHaveLength(5);
    expect(events.filter((t) => t === 'StageCompleted')).toHaveLength(2);
    expect(events.at(-1)).toBe('ExerciseCompleted');
  });

  it('accepts a different valid order of independent steps', () => {
    const ctx = ctxFor();
    const { session } = run(ctx, scriptOf(ctx, ['s2', 's1', 's3', 's4', 's5']));
    expect(session.state.completed).toBe(true);
    expect(Object.values(session.state.steps).every((s) => !s.outOfOrder)).toBe(true);
  });

  it('records order deviations and completes the step once dependencies are done (policy: warn)', () => {
    const ctx = ctxFor();
    const s0 = createInitialState(ctx);
    const early = executeCommand(ctx, s0, {
      type: 'ConnectPorts',
      a: { objectId: 'hose1', portId: 'end-b' },
      b: { objectId: 'splitter', portId: 'in' },
    });
    expect(early.accepted).toBe(true);
    expect(early.issues[0]).toMatchObject({ code: 'order.dependencies-missing', severity: 'warning', stepId: 's3' });
    expect(early.events.find((e) => e.type === 'OrderDeviation')).toMatchObject({ stepId: 's3', missingStepIds: ['s1', 's2'] });
    expect(early.state.steps.s3?.status).toBe('locked');

    let state = early.state;
    for (const c of scriptOf(ctx, ['s1', 's2'])) state = executeCommand(ctx, state, c).state;
    expect(state.steps.s3).toMatchObject({ status: 'completed', outOfOrder: true });
  });

  it('rejects out-of-order actions when the exercise policy says so', () => {
    const ctx = ctxFor((e) => ({ ...e, settings: { ...e.settings, orderPolicy: 'reject' } }));
    const r = executeCommand(ctx, createInitialState(ctx), {
      type: 'ConnectPorts',
      a: { objectId: 'hose1', portId: 'end-b' },
      b: { objectId: 'splitter', portId: 'in' },
    });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]?.code).toBe('order.dependencies-missing');
  });

  it('latches completed steps even if the condition later stops holding', () => {
    const ctx = ctxFor();
    const { session } = run(ctx, scriptOf(ctx, ['s2']));
    expect(session.state.steps.s2?.status).toBe('completed');
    session.execute({ type: 'DisconnectPorts', connectionId: 'c1' });
    expect(session.state.steps.s2?.status).toBe('completed');
  });

  it('requires the final condition for exercise completion', () => {
    const ctx = ctxFor((e) => ({
      ...e,
      completion: { requiredSteps: 'all', finalCondition: { type: 'objectState', objectId: 'nozzle', state: 'open' } },
    }));
    const { session } = run(ctx, scriptOf(ctx));
    expect(session.state.completed).toBe(false);
    session.execute({ type: 'SetObjectState', objectId: 'nozzle', state: 'open' });
    expect(session.state.completed).toBe(true);
  });

  it('supports an explicit list of required steps', () => {
    const ctx = ctxFor((e) => ({ ...e, completion: { requiredSteps: ['s2'] } }));
    const { session } = run(ctx, scriptOf(ctx, ['s2']));
    expect(session.state.completed).toBe(true);
  });
});

describe('determinism, replay and undo', () => {
  it('replays to an identical state, including rejected attempts', () => {
    const ctx = ctxFor();
    const commands: Command[] = [
      { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'hose1' }, // rejected: too far
      ...scriptOf(ctx, ['s1', 's2']),
      { type: 'RotateObject', objectId: 'splitter', rotation: 45 }, // rejected
      ...scriptOf(ctx, ['s3', 's4', 's5']),
    ];
    const timed = commands.map((command, i) => ({ command, time: i * 1000 }));
    const a = replay(ctx, timed);
    const b = replay(ctx, timed);
    expect(a.state).toEqual(b.state);
    expect(a.history.filter((h) => !h.accepted)).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
    expect(a.state.completed).toBe(true);
    expect(a.state.time).toBe((commands.length - 1) * 1000);
  });

  it('reconstructs intermediate states from snapshots and undoes by replay', () => {
    const ctx = ctxFor();
    const session = new SimulationSession(ctx, { snapshotInterval: 3 });
    const cmds = scriptOf(ctx);
    const states = [session.state];
    for (const c of cmds) {
      session.execute(c);
      states.push(session.state);
    }
    for (let k = 0; k <= cmds.length; k++) expect(session.stateAtSeq(k)).toEqual(states[k]);
    expect(session.undo()).toBe(true);
    expect(session.state).toEqual(states[cmds.length - 1]);
    session.reset();
    expect(session.state).toEqual(states[0]);
    expect(session.history).toHaveLength(0);
  });
});

describe('demonstration timeline', () => {
  const ctx = ctxFor();
  const tl = compileTimeline(ctx, { snapshotInterval: 2 });

  it('compiles without problems and reaches completion', () => {
    expect(tl.problems).toEqual([]);
    expect(tl.finalState.completed).toBe(true);
    expect(tl.durationMs).toBeGreaterThan(0);
    // Integer schedule: a UI slider with step 1 can reach every boundary exactly.
    expect(tl.entries.every((e) => Number.isInteger(e.startMs) && Number.isInteger(e.endMs))).toBe(true);
  });

  it('runs independent steps in parallel and respects dependencies', () => {
    expect(tl.stepWindows.s1?.startMs).toBe(0);
    expect(tl.stepWindows.s2?.startMs).toBe(0);
    const s3 = tl.stepWindows.s3!;
    expect(s3.startMs).toBeGreaterThanOrEqual(Math.max(tl.stepWindows.s1!.endMs, tl.stepWindows.s2!.endMs));
    expect(tl.stepWindows.s4!.startMs).toBeGreaterThanOrEqual(s3.endMs);
  });

  it('reconstructs the same state regardless of seek path', () => {
    const times = [0, 500, 1234, tl.durationMs / 2, tl.durationMs - 1, tl.durationMs];
    const forward = times.map((t) => stateAt(ctx, tl, t));
    const backward = [...times].reverse().map((t) => stateAt(ctx, tl, t)).reverse();
    expect(forward).toEqual(backward);
    for (let n = 0; n <= tl.entries.length; n++) {
      const direct = replay(
        ctx,
        tl.entries.slice(0, n).map((e) => ({ command: e.command, time: e.endMs })),
      ).state;
      expect(stateAfterEntries(ctx, tl, n)).toEqual(direct);
    }
  });

  it('interpolates moves visually without changing authoritative state', () => {
    const move = tl.entries.find((e) => e.command.type === 'MovePersonnel' && e.stepId === 's1')!;
    const mid = (move.startMs + move.endMs) / 2;
    const frame = frameAt(ctx, tl, mid);
    const authoritative = frame.state.objects.p1!.position;
    const shown = frame.overrides.p1?.position;
    expect(shown).toBeDefined();
    expect(shown).not.toEqual(authoritative);
    // The carried splitter follows the displayed carrier position.
    expect(frame.overrides.splitter?.position).toEqual({ x: shown!.x + 22, y: shown!.y - 18 });
    expect(frame.activeStepIds).toContain('s1');
    // The frame did not mutate the timeline's snapshots.
    expect(stateAt(ctx, tl, mid)).toEqual(frame.state);
  });

  it('shows connections being drawn before they exist in state', () => {
    const conn = tl.entries.find((e) => e.command.type === 'ConnectPorts')!;
    const frame = frameAt(ctx, tl, conn.startMs + 1);
    expect(frame.pendingConnections.length).toBeGreaterThan(0);
    expect(frame.state.connections.c1).toBeUndefined();
    expect(frameAt(ctx, tl, conn.endMs).state.connections.c1).toBeDefined();
  });

  it('steps between boundaries', () => {
    const first = nextBoundary(tl, 0);
    expect(first).toBe(tl.entries[0]!.endMs);
    expect(appliedCountAt(tl, first)).toBeGreaterThanOrEqual(1);
    expect(previousBoundary(tl, first)).toBe(0);
    expect(nextBoundary(tl, tl.durationMs)).toBe(tl.durationMs);
  });
});

describe('assessment', () => {
  it('reports results with exercise-specific criteria only', () => {
    const ctx = ctxFor();
    const session = new SimulationSession(ctx);
    session.execute({ type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'hose1' }, 0); // rejected
    scriptOf(ctx).forEach((c, i) => session.execute(c, (i + 1) * 1000));
    const result = evaluateAttempt(ctx, session.state, session.history, { mode: 'assessment' });
    expect(result.completed).toBe(true);
    expect(result.rejectedCommands).toHaveLength(1);
    expect(result.missingSteps).toEqual([]);
    expect(result.criteria.map((c) => [c.id, c.passed])).toEqual([
      ['crit.steps', true],
      ['crit.errors', true],
    ]);
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(scriptOf(ctx).length * 1000);
  });

  it('returns passed=null when the exercise defines no criteria', () => {
    const ctx = ctxFor((e) => ({ ...e, assessment: { ...e.assessment, criteria: [] } }));
    const session = new SimulationSession(ctx);
    const result = evaluateAttempt(ctx, session.state, session.history, { mode: 'training' });
    expect(result.passed).toBeNull();
    expect(result.missingSteps).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });
});

describe('exercise diagnostics', () => {
  it('finds no errors in the consistent test exercise', () => {
    const check = checkExercise(makeTestExercise(), catalog);
    expect(check.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(check.demoReachesCompletion).toBe(true);
  });

  it('detects dependency cycles, unknown references and unreachable completion', () => {
    const input = structuredClone(testExerciseInput);
    const steps = input.steps ?? [];
    steps[0]!.dependsOn = ['s5'];
    steps[1]!.completedWhen = { type: 'inZone', objectId: 'ghost', zoneId: 'zone.nowhere' };
    input.initialScene.personnel![0]!.roleId = 'role.unknown';
    const check = checkExercise(ExerciseSchema.parse(input), catalog);
    const codes = check.diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['step.dependency-cycle', 'ref.unknown-object', 'ref.unknown-zone', 'ref.unresolved-role']));
  });

  it('reports demonstration scripts that cannot reach completion', () => {
    const input = structuredClone(testExerciseInput);
    input.steps![4]!.script = [];
    const codes = checkExercise(ExerciseSchema.parse(input), catalog).diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['demo.missing-script', 'completion.unreachable']));
  });

  it('reports rejected demonstration commands', () => {
    const input = structuredClone(testExerciseInput);
    input.steps![3]!.script!.splice(0, 1); // remove pick-up of nozzle
    const codes = checkExercise(ExerciseSchema.parse(input), catalog).diagnostics.map((d) => d.code);
    expect(codes).toContain('demo.command-rejected');
  });
});
