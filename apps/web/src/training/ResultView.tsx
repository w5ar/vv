import type { ExerciseResult } from '@fds/domain';
import type { ExerciseContext } from '@fds/simulation-engine';
import { Badge } from '../components/common';
import { COMMAND } from '../labels';
import { formatTime } from '../player/usePlayback';

export function ResultView({ ctx, result, previousCount }: { ctx: ExerciseContext; result: ExerciseResult; previousCount: number }) {
  const step = (id: string) => ctx.steps.get(id)?.title ?? id;
  const isTime = (criterionId: string) => ctx.exercise.assessment.criteria.find((c) => c.id === criterionId)?.type === 'timeLimitMs';
  return (
    <div className="result" data-testid="assessment-result">
      <header className="result__head">
        <h2>Rezultat {result.mode === 'assessment' ? 'provjere znanja' : 'vježbanja'}</h2>
        {result.passed === null ? (
          <Badge tone="info">Bez kriterija ocjenjivanja</Badge>
        ) : result.passed ? (
          <Badge tone="ok">Zadovoljeno</Badge>
        ) : (
          <Badge tone="error">Nije zadovoljeno</Badge>
        )}
      </header>
      <dl className="kv">
        <dt>Vježba završena</dt>
        <dd>{result.completed ? 'da' : 'ne'}</dd>
        <dt>Trajanje</dt>
        <dd>{formatTime(result.durationMs ?? 0)}</dd>
        <dt>Pokušaji / prihvaćeno</dt>
        <dd>
          {result.attempts} / {result.acceptedCommands}
        </dd>
        <dt>Dovršeni koraci</dt>
        <dd>
          {result.completedSteps.length} / {ctx.requiredStepIds.length}
        </dd>
        <dt>Prethodni rezultati</dt>
        <dd>{previousCount}</dd>
      </dl>
      {result.criteria.length > 0 ? (
        <>
          <h3>Kriteriji (definirani u vježbi)</h3>
          <table className="table">
            <tbody>
              {result.criteria.map((c) => (
                <tr key={c.id}>
                  <td>{c.passed ? '✔' : '✖'}</td>
                  <td>{c.label}</td>
                  <td className="muted">
                    {isTime(c.id) ? formatTime(c.actual) : c.actual}
                    {c.limit !== undefined ? ` / ${isTime(c.id) ? formatTime(c.limit) : c.limit}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {result.missingSteps.length > 0 ? (
        <>
          <h3>Nedovršeni koraci</h3>
          <ul className="list">
            {result.missingSteps.map((id) => (
              <li key={id}>{step(id)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {result.orderDeviations.length > 0 ? (
        <>
          <h3>Odstupanja od redoslijeda</h3>
          <ul className="list">
            {result.orderDeviations.map((o, i) => (
              <li key={i}>
                {step(o.stepId)} – prije: {o.missingStepIds.map(step).join(', ')}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {result.rejectedCommands.length > 0 ? (
        <>
          <h3>Neispravne radnje</h3>
          <ul className="list">
            {result.rejectedCommands.map((r) => (
              <li key={r.attempt}>
                <strong>{COMMAND[r.command.type]}:</strong> {r.issues.map((i) => i.message).join(' ')}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
