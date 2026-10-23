import { memo } from 'react';
import { Handle, Position, type EdgeProps, type NodeProps } from '@xyflow/react';
import type { ConnectionFlowEdge, NoteFlowNode, SymbolFlowNode, ZoneFlowNode } from './scene-model';
import { SymbolView } from './SymbolView';

export const SymbolNode = memo(function SymbolNode({ data, selected }: NodeProps<SymbolFlowNode>) {
  const classes = [
    'fds-node',
    `fds-node--${data.kind}`,
    selected ? 'is-selected' : '',
    data.carried ? 'is-carried' : '',
    data.highlight ? `is-${data.highlight}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const caption = data.kind === 'personnel' ? (data.label ?? data.name) : data.label;
  return (
    <div
      className={classes}
      style={{ width: data.width, height: data.height }}
      data-testid={`object-${data.objectId}`}
      title={[data.label ?? data.name, data.roleLabel ? `Uloga: ${data.roleLabel}` : '', data.carried ? 'Nosi se' : ''].filter(Boolean).join('\n')}
    >
      <div className="fds-node__body" style={{ transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined }}>
        <SymbolView symbolId={data.symbolId} width={data.width} height={data.height} visualState={data.visualState} />
      </div>
      {data.ports.map((p) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Left}
          isConnectable={data.connectable}
          className={['fds-port', p.connected ? 'is-connected' : '', p.highlight ? `is-${p.highlight}` : ''].filter(Boolean).join(' ')}
          style={{ left: p.x, top: p.y }}
          data-testid={`port-${data.objectId}-${p.id}`}
          title={`${p.label} – ${p.typeName}${p.connected ? ' (spojeno)' : ''}`}
        >
          {data.showPortLabels ? <span className="fds-port__label">{p.label}</span> : null}
        </Handle>
      ))}
      {caption || data.roleLabel ? (
        <div className="fds-node__caption">
          {caption ? <span>{caption}</span> : null}
          {data.roleLabel && data.kind === 'personnel' ? <span className="fds-role-badge">{data.roleLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
});

export const ZoneNode = memo(function ZoneNode({ data }: NodeProps<ZoneFlowNode>) {
  return (
    <div
      className={`fds-zone fds-zone--${data.shape} ${data.highlighted ? 'is-highlighted' : ''}`}
      style={{ width: data.width, height: data.height }}
    >
      <span className="fds-zone__label">{data.name}</span>
    </div>
  );
});

export const NoteNode = memo(function NoteNode({ data }: NodeProps<NoteFlowNode>) {
  return (
    <div className="fds-note" style={{ fontSize: data.fontSize }}>
      {data.text}
    </div>
  );
});

/** Straight line between the two domain-computed port positions. */
export function ConnectionEdge({ id, data, selected }: EdgeProps<ConnectionFlowEdge>) {
  if (!data) return null;
  const { a, b, progress, opacity, pending } = data;
  const end = progress >= 1 ? b : { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
  const d = `M ${a.x} ${a.y} L ${end.x} ${end.y}`;
  return (
    <g style={{ opacity }} data-testid={`edge-${id}`}>
      <path d={d} className={`fds-edge ${selected ? 'is-selected' : ''} ${pending ? 'is-pending' : ''}`} fill="none" />
      <path d={d} className="react-flow__edge-interaction" fill="none" strokeOpacity={0} strokeWidth={10} />
    </g>
  );
}

export const nodeTypes = { symbol: SymbolNode, zone: ZoneNode, note: NoteNode };
export const edgeTypes = { connection: ConnectionEdge };
