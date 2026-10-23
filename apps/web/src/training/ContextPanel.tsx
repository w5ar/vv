import { connectionsAtPort, objectPlacement } from '@fds/connection-engine';
import type { Command, Id, ObjectState, SimulationState, SymbolDefinition } from '@fds/domain';
import { distance, distanceToPlacement, normalizeAngle } from '@fds/geometry';
import { connectionList, objectName, type ExerciseContext } from '@fds/simulation-engine';

export interface ContextPanelProps {
  readonly ctx: ExerciseContext;
  readonly state: SimulationState;
  readonly selectedId: Id | null;
  readonly selectedConnectionId: Id | null;
  readonly placingId: Id | null;
  /** Hose waiting for the click that sets its far end. */
  readonly layingId: Id | null;
  readonly onCommand: (commands: Command[]) => void;
  readonly onStartPlacing: (equipmentId: Id | null) => void;
  readonly onStartLaying: (equipmentId: Id | null) => void;
}

export function isHose(ctx: ExerciseContext, obj: ObjectState | undefined): boolean {
  return !!obj?.typeId && ctx.catalog.equipmentTypes.get(obj.typeId)?.form === 'hose';
}

function LayButton({ id, layingId, onStartLaying }: { id: Id; layingId: Id | null; onStartLaying: (id: Id | null) => void }) {
  return (
    <button className={`btn btn--small ${layingId === id ? 'is-active' : ''}`} onClick={() => onStartLaying(layingId === id ? null : id)} data-testid={`lay-${id}`}>
      {layingId === id ? 'Kliknite kraj voda…' : 'Položi…'}
    </button>
  );
}

export function rotationStep(symbol: SymbolDefinition | undefined): number | null {
  if (!symbol) return null;
  if (symbol.rotation.mode === 'none') return null;
  if (symbol.rotation.mode === 'step') return symbol.rotation.stepDegrees;
  return 15;
}

function RotateButtons({ ctx, obj, onCommand }: { ctx: ExerciseContext; obj: ObjectState; onCommand: (c: Command[]) => void }) {
  const step = rotationStep(ctx.catalog.symbols.get(obj.symbolId));
  if (step === null) return <p className="muted">Rotacija nije dopuštena za ovaj simbol.</p>;
  const rotate = (delta: number) => onCommand([{ type: 'RotateObject', objectId: obj.id, rotation: normalizeAngle(obj.rotation + delta) }]);
  return (
    <div className="btn-row">
      <button className="btn btn--small" onClick={() => rotate(-step)} data-testid="rotate-left" title="Shift+R">
        ⟲ −{step}°
      </button>
      <span className="muted">{Math.round(obj.rotation)}°</span>
      <button className="btn btn--small" onClick={() => rotate(step)} data-testid="rotate-right" title="R">
        ⟳ +{step}°
      </button>
    </div>
  );
}

function PersonnelContext({ ctx, state, obj, placingId, layingId, onCommand, onStartPlacing, onStartLaying }: ContextPanelProps & { obj: ObjectState }) {
  const roles = [...ctx.catalog.roles.values()];
  const settings = ctx.exercise.settings;
  const receivers = state.objectOrder
    .map((id) => state.objects[id])
    .filter((o): o is ObjectState => !!o && o.kind === 'personnel' && o.id !== obj.id && distance(o.position, obj.position) <= settings.pickUpDistance);
  const portable = state.objectOrder
    .map((id) => state.objects[id])
    .filter((o): o is ObjectState => !!o && o.kind === 'equipment' && !o.carriedBy && !!o.typeId && ctx.catalog.equipmentTypes.get(o.typeId)?.portable === true)
    .map((o) => {
      const placement = objectPlacement(ctx.catalog, o);
      return { o, d: placement ? distanceToPlacement(placement, obj.position) : distance(o.position, obj.position) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const actions = ctx.exercise.actions.filter(
    (a) => state.actions[a.id]?.status !== 'completed' && (a.actorRoleIds.length === 0 || (obj.roleId !== null && a.actorRoleIds.includes(obj.roleId))),
  );
  const otherActions = ctx.exercise.actions.filter((a) => !actions.includes(a) && state.actions[a.id]?.status !== 'completed');
  return (
    <div className="context" data-testid="context-personnel">
      <h3>{objectName(ctx, obj)}</h3>
      <label className="field">
        Uloga
        <select
          value={obj.roleId ?? ''}
          onChange={(e) => onCommand([{ type: 'AssignRole', personnelId: obj.id, roleId: e.target.value || null }])}
          data-testid="role-select"
        >
          <option value="">— bez uloge —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <h4>Smjer</h4>
      <RotateButtons ctx={ctx} obj={obj} onCommand={onCommand} />
      <h4>Nosi</h4>
      {obj.carrying.length === 0 ? (
        <p className="muted">Ništa.</p>
      ) : (
        <ul className="list">
          {obj.carrying.map((id) => (
            <li key={id}>
              {objectName(ctx, state.objects[id], id)}{' '}
              <button className={`btn btn--small ${placingId === id ? 'is-active' : ''}`} onClick={() => onStartPlacing(placingId === id ? null : id)} data-testid={`place-${id}`}>
                {placingId === id ? 'Kliknite na scenu…' : 'Odloži…'}
              </button>
              {isHose(ctx, state.objects[id]) ? <LayButton id={id} layingId={layingId} onStartLaying={onStartLaying} /> : null}
              {receivers.length > 0 ? (
                <select
                  className="select--small"
                  value=""
                  onChange={(e) => e.target.value && onCommand([{ type: 'HandOverEquipment', fromId: obj.id, toId: e.target.value, equipmentId: id }])}
                  data-testid={`handover-${id}`}
                  title="Predaj osobi u blizini"
                >
                  <option value="">Predaj…</option>
                  {receivers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {objectName(ctx, r)}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <h4>Oprema u blizini</h4>
      {portable.length === 0 ? (
        <p className="muted">Nema slobodne prijenosne opreme.</p>
      ) : (
        <ul className="list">
          {portable.map(({ o, d }) => {
            const far = d > settings.pickUpDistance;
            return (
              <li key={o.id}>
                {objectName(ctx, o)} <span className="muted">({Math.round(d)})</span>{' '}
                <button
                  className="btn btn--small"
                  disabled={far}
                  title={far ? `Predaleko (najviše ${settings.pickUpDistance})` : undefined}
                  onClick={() => onCommand([{ type: 'PickUpEquipment', personnelId: obj.id, equipmentId: o.id }])}
                  data-testid={`pickup-${o.id}`}
                >
                  Uzmi
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h4>Radnje</h4>
      {actions.length === 0 && otherActions.length === 0 ? <p className="muted">Nema radnji.</p> : null}
      <ul className="list">
        {actions.map((a) => (
          <li key={a.id}>
            {a.name}{' '}
            <button
              className="btn btn--small btn--primary"
              onClick={() =>
                onCommand(
                  state.actions[a.id]?.status === 'active'
                    ? [{ type: 'CompleteAction', actionId: a.id }]
                    : [
                        { type: 'BeginAction', actionId: a.id, actorIds: [obj.id] },
                        { type: 'CompleteAction', actionId: a.id },
                      ],
                )
              }
              data-testid={`action-${a.id}`}
            >
              Izvrši
            </button>
          </li>
        ))}
        {otherActions.map((a) => (
          <li key={a.id} className="muted">
            {a.name}{' '}
            <button
              className="btn btn--small"
              title="Ova osoba nema ulogu potrebnu za radnju"
              onClick={() =>
                onCommand([
                  { type: 'BeginAction', actionId: a.id, actorIds: [obj.id] },
                  { type: 'CompleteAction', actionId: a.id },
                ])
              }
              data-testid={`action-${a.id}`}
            >
              Izvrši
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EquipmentContext({ ctx, state, obj, layingId, onCommand, onStartLaying }: ContextPanelProps & { obj: ObjectState }) {
  const symbol = ctx.catalog.symbols.get(obj.symbolId);
  const type = obj.typeId ? ctx.catalog.equipmentTypes.get(obj.typeId) : undefined;
  const conns = connectionList(state);
  const hoseConnected = conns.some((c) => c.a.objectId === obj.id || c.b.objectId === obj.id);
  return (
    <div className="context" data-testid="context-equipment">
      <h3>{objectName(ctx, obj)}</h3>
      <p className="muted">
        {type?.name}
        {type?.portable ? ' · prijenosno' : ''}
        {obj.carriedBy ? ` · nosi: ${objectName(ctx, state.objects[obj.carriedBy], obj.carriedBy)}` : ''}
        {obj.layout ? ` · položena (${Math.round(distance(obj.layout.a, obj.layout.b))})` : ''}
      </p>
      {type?.form === 'hose' ? (
        <>
          <h4>Cijev</h4>
          <div className="btn-row">
            {obj.layout ? (
              <button
                className="btn btn--small"
                disabled={hoseConnected}
                title={hoseConnected ? 'Najprije odspojite cijev' : undefined}
                onClick={() => onCommand([{ type: 'RollUpHose', equipmentId: obj.id }])}
                data-testid={`rollup-${obj.id}`}
              >
                Namotaj
              </button>
            ) : (
              <LayButton id={obj.id} layingId={layingId} onStartLaying={onStartLaying} />
            )}
          </div>
        </>
      ) : null}
      {symbol && symbol.visualStates.length > 0 ? (
        <>
          <h4>Stanje</h4>
          <div className="btn-row">
            {symbol.visualStates.map((v) => (
              <button
                key={v.id}
                className={`btn btn--small ${obj.visualState === v.id ? 'is-active' : ''}`}
                onClick={() => onCommand([{ type: 'SetObjectState', objectId: obj.id, state: v.id }])}
                data-testid={`state-${obj.id}-${v.id}`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!obj.carriedBy && !obj.layout ? (
        <>
          <h4>Smjer</h4>
          <RotateButtons ctx={ctx} obj={obj} onCommand={onCommand} />
        </>
      ) : null}
      {symbol && symbol.ports.length > 0 ? (
        <>
          <h4>Priključci</h4>
          <ul className="list">
            {symbol.ports.map((p) => {
              const at = connectionsAtPort(conns, { objectId: obj.id, portId: p.id });
              return (
                <li key={p.id}>
                  <strong>{p.label ?? p.id}</strong> <span className="muted">({ctx.catalog.portTypes.get(p.type)?.name ?? p.type})</span>
                  {at.length === 0 ? <span className="muted"> – slobodan</span> : null}
                  {at.map((c) => {
                    const other = c.a.objectId === obj.id && c.a.portId === p.id ? c.b : c.a;
                    return (
                      <div key={c.id} className="list__sub">
                        → {objectName(ctx, state.objects[other.objectId], other.objectId)} ({other.portId}){' '}
                        <button className="btn btn--small" onClick={() => onCommand([{ type: 'DisconnectPorts', connectionId: c.id }])} data-testid={`disconnect-${c.id}`}>
                          Odspoji
                        </button>
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function ContextPanel(props: ContextPanelProps) {
  const { ctx, state, selectedId, selectedConnectionId, onCommand } = props;
  if (selectedConnectionId) {
    const c = state.connections[selectedConnectionId];
    if (c) {
      return (
        <div className="context" data-testid="context-connection">
          <h3>Spoj</h3>
          <p>
            {objectName(ctx, state.objects[c.a.objectId], c.a.objectId)} ({c.a.portId}) ↔ {objectName(ctx, state.objects[c.b.objectId], c.b.objectId)} ({c.b.portId})
          </p>
          <button className="btn" onClick={() => onCommand([{ type: 'DisconnectPorts', connectionId: c.id }])} data-testid="disconnect-selected">
            Odspoji
          </button>
        </div>
      );
    }
  }
  const obj = selectedId ? state.objects[selectedId] : undefined;
  if (!obj) {
    return (
      <div className="context context--help">
        <p>Odaberite osobu ili opremu na sceni.</p>
        <ul className="help">
          <li>Povucite osobu za premještanje; opremu koju osoba nosi povucite na mjesto odlaganja.</li>
          <li>Spajanje: povucite od priključka do priključka ili kliknite jedan pa drugi priključak.</li>
          <li>Tipka R / Shift+R rotira odabrani objekt.</li>
          <li>Cijev: „Položi…” pa klik na mjesto kraja voda; početak je priključak na koji je spojen prvi kraj cijevi ili osoba koja je nosi.</li>
        </ul>
      </div>
    );
  }
  return obj.kind === 'personnel' ? <PersonnelContext {...props} obj={obj} /> : <EquipmentContext {...props} obj={obj} />;
}
