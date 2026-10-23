import type { HistoryEntry, Id, SimulationState } from '@fds/domain';
import { isStageComplete, type ExerciseContext } from '@fds/simulation-engine';
import { describeEvent, STEP_STATUS } from '../labels';

function sourceLabel(file: string, line?: number): string {
  const name = file.split('/').pop() ?? file;
  return line ? `${name}:${line}` : name;
}

export interface StepListProps {
  readonly ctx: ExerciseContext;
  readonly state: SimulationState;
  readonly activeStepIds?: readonly Id[];
  readonly showHints?: boolean;
  readonly showSourceText?: boolean;
  readonly onStepClick?: (stepId: Id) => void;
}

/** Steps grouped by stage, with status from the procedure state machine. */
export function StepList({ ctx, state, activeStepIds = [], showHints = false, showSourceText = true, onStepClick }: StepListProps) {
  const groups: { stageId: Id | null; name: string; stepIds: Id[] }[] = ctx.exercise.stages.map((s) => ({
    stageId: s.id,
    name: s.name,
    stepIds: [...(ctx.stageSteps.get(s.id) ?? [])],
  }));
  const loose = ctx.exercise.steps.filter((s) => !s.stageId || !ctx.stages.has(s.stageId)).map((s) => s.id);
  if (loose.length > 0) groups.push({ stageId: null, name: 'Koraci bez faze', stepIds: loose });
  const active = new Set(activeStepIds);
  const firstAvailable = ctx.stepOrder.find((id) => state.steps[id]?.status === 'available');

  return (
    <div className="steps" data-testid="step-list">
      {groups.map((g) => {
        const done = g.stageId ? isStageComplete(ctx, state, g.stageId) : false;
        return (
          <div key={g.stageId ?? '_'} className={`steps__stage ${done ? 'is-done' : ''}`}>
            <h3>
              {done ? '✔ ' : ''}
              {g.name}
            </h3>
            <ol>
              {g.stepIds.map((id) => {
                const step = ctx.steps.get(id);
                const rt = state.steps[id];
                if (!step || !rt) return null;
                const isActive = active.has(id);
                const status = rt.status;
                const icon = status === 'completed' ? (rt.outOfOrder ? '⚠' : '✔') : isActive ? '▶' : status === 'available' ? '○' : '🔒';
                const src = step.sources[0];
                return (
                  <li
                    key={id}
                    className={`step step--${status} ${isActive ? 'is-active' : ''} ${onStepClick ? 'is-clickable' : ''}`}
                    data-testid={`step-${id}`}
                    data-status={status}
                    onClick={onStepClick ? () => onStepClick(id) : undefined}
                  >
                    <span className="step__icon" aria-hidden>
                      {icon}
                    </span>
                    <div className="step__main">
                      <div className="step__title">
                        {step.title}
                        {step.optional ? <span className="muted"> (neobavezno)</span> : null}
                      </div>
                      <div className="step__status">
                        {STEP_STATUS[status]}
                        {rt.outOfOrder ? ' · izvan redoslijeda' : ''}
                        {status === 'locked' && step.dependsOn.length > 0
                          ? ` · nakon: ${step.dependsOn.map((d) => ctx.steps.get(d)?.title ?? d).join(', ')}`
                          : ''}
                      </div>
                      {showSourceText && step.text ? (
                        <blockquote className="step__source" title={src ? `${src.file}${src.line ? `:${src.line}` : ''}` : undefined}>
                          {step.text}
                          {src ? <cite> — {sourceLabel(src.file, src.line)}</cite> : null}
                        </blockquote>
                      ) : null}
                      {showHints && step.hint && (status === 'available' || id === firstAvailable) ? <div className="step__hint">💡 {step.hint}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressBar({ ctx, state }: { ctx: ExerciseContext; state: SimulationState }) {
  const total = ctx.requiredStepIds.length;
  const done = ctx.requiredStepIds.filter((id) => state.steps[id]?.status === 'completed').length;
  return (
    <div className="progress" title={`${done} / ${total} koraka`}>
      <div className="progress__bar" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      <span className="progress__label" data-testid="progress-label">
        {done} / {total} koraka{state.completed ? ' · vježba završena' : ''}
      </span>
    </div>
  );
}

export function EventLog({ ctx, state, entries }: { ctx: ExerciseContext; state?: SimulationState; entries: readonly HistoryEntry[] }) {
  const lines = entries
    .slice()
    .reverse()
    .slice(0, 40)
    .flatMap((h) =>
      h.accepted
        ? h.events.map((e, i) => ({ key: `${h.attempt}-${i}`, text: describeEvent(ctx, e, state), tone: e.type === 'OrderDeviation' || e.type === 'RuleWarning' ? 'warn' : 'ok' }))
        : [{ key: `${h.attempt}-x`, text: `✖ ${h.issues[0]?.message ?? 'Radnja odbijena.'}`, tone: 'error' }],
    )
    .filter((l) => l.text);
  if (lines.length === 0) return <p className="muted">Još nema događaja.</p>;
  return (
    <ul className="event-log" data-testid="event-log">
      {lines.map((l) => (
        <li key={l.key} className={`event event--${l.tone}`}>
          {l.text}
        </li>
      ))}
    </ul>
  );
}
