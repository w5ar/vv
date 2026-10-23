import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnConnectStart,
} from '@xyflow/react';
import type { Id, PortRef, Rect } from '@fds/domain';
import { add, sub, type Vec2 } from '@fds/geometry';
import { edgeTypes, nodeTypes } from './nodes';
import { buildFlow, symbolCenter, type FlowNode, type SceneView } from './scene-model';

export interface SelectionChange {
  readonly objectId: Id | null;
  readonly connectionId: Id | null;
}

export interface SceneCanvasProps {
  readonly view: SceneView;
  readonly onSelectionChange?: (sel: SelectionChange) => void;
  /** Called when a drag ends, with the new domain position (pivot) of the object. */
  readonly onMoveObject?: (objectId: Id, position: Vec2) => void;
  readonly onConnectPorts?: (a: PortRef, b: PortRef) => void;
  /** Connection gesture started (port) or ended (null). */
  readonly onConnectGesture?: (port: PortRef | null) => void;
  readonly onPaneClick?: (world: Vec2) => void;
  /** Radius (world units) within which a dragged connection snaps to a port. */
  readonly connectionRadius?: number;
  readonly fitBounds?: Rect | undefined;
  /** Changing this value re-fits the viewport. */
  readonly fitKey?: string | number;
  readonly showMiniMap?: boolean;
  readonly children?: ReactNode;
}

const NODE_ORIGIN: [number, number] = [0.5, 0.5];

function CanvasInner(props: SceneCanvasProps) {
  const { view, onSelectionChange, onMoveObject, onConnectPorts, onConnectGesture, onPaneClick } = props;
  const flow = useReactFlow();
  const [drag, setDrag] = useState<{ id: Id; center: Vec2 } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const effectiveView = useMemo<SceneView>(() => {
    if (!drag) return view;
    const obj = view.state.objects[drag.id];
    if (!obj) return view;
    const base = view.overrides?.[drag.id]?.position ? { ...obj, position: view.overrides[drag.id]!.position! } : obj;
    const delta = sub(drag.center, symbolCenter(view.catalog, base));
    const overrides = { ...(view.overrides ?? {}), [drag.id]: { ...view.overrides?.[drag.id], position: add(base.position, delta) } };
    // Carried items follow the dragged carrier visually.
    for (const itemId of obj.carrying) {
      const item = view.state.objects[itemId];
      if (item) overrides[itemId] = { ...overrides[itemId], position: add(item.position, delta) };
    }
    return { ...view, overrides };
  }, [view, drag]);

  const { nodes, edges } = useMemo(() => buildFlow(effectiveView), [effectiveView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && ch.dragging) setDrag({ id: ch.id, center: ch.position });
        if (ch.type === 'select' && onSelectionChange) {
          if (ch.selected) onSelectionChange({ objectId: ch.id, connectionId: null });
        }
      }
    },
    [onSelectionChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const ch of changes) {
        if (ch.type === 'select' && ch.selected && onSelectionChange && !ch.id.startsWith('pending:')) {
          onSelectionChange({ objectId: null, connectionId: ch.id });
        }
      }
    },
    [onSelectionChange],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: FlowNode) => {
      const current = dragRef.current;
      setDrag(null);
      const obj = view.state.objects[node.id];
      if (!obj || !onMoveObject) return;
      const center = current?.id === node.id ? current.center : node.position;
      const delta = sub(center, symbolCenter(view.catalog, obj));
      if (Math.hypot(delta.x, delta.y) < 0.5) return;
      onMoveObject(node.id, add(obj.position, delta));
    },
    [view, onMoveObject],
  );

  const handleConnect: OnConnect = useCallback(
    (c) => {
      if (!onConnectPorts || !c.sourceHandle || !c.targetHandle) return;
      onConnectPorts({ objectId: c.source, portId: c.sourceHandle }, { objectId: c.target, portId: c.targetHandle });
    },
    [onConnectPorts],
  );

  const handleConnectStart: OnConnectStart = useCallback(
    (_e, params) => {
      if (onConnectGesture && params.nodeId && params.handleId) onConnectGesture({ objectId: params.nodeId, portId: params.handleId });
    },
    [onConnectGesture],
  );

  const handlePaneClick = useCallback(
    (e: MouseEvent) => {
      onSelectionChange?.({ objectId: null, connectionId: null });
      onPaneClick?.(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [flow, onPaneClick, onSelectionChange],
  );

  const fit = useCallback(() => {
    if (props.fitBounds) void flow.fitBounds(props.fitBounds, { padding: 0.08, duration: 0 });
    else void flow.fitView({ padding: 0.1, duration: 0 });
  }, [flow, props.fitBounds]);

  // Fit once the container has been measured, and again whenever fitKey changes (the container may
  // still be resizing then, e.g. when entering full screen, so fit again once it has settled).
  const measured = useStore((s) => s.width > 0 && s.height > 0);
  useEffect(() => {
    if (!measured) return;
    const timers = [0, 200, 500].map((ms) => setTimeout(fit, ms));
    return () => timers.forEach(clearTimeout);
  }, [fit, measured, props.fitKey]);

  return (
    <ReactFlow<FlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={NODE_ORIGIN}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={handleConnect}
      onConnectStart={handleConnectStart}
      onConnectEnd={() => onConnectGesture?.(null)}
      onClickConnectStart={handleConnectStart}
      onClickConnectEnd={() => onConnectGesture?.(null)}
      onPaneClick={handlePaneClick}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={props.connectionRadius ?? 20}
      connectOnClick
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      elevateNodesOnSelect={false}
      minZoom={0.2}
      maxZoom={4}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
      {props.showMiniMap ? <MiniMap pannable zoomable position="bottom-right" /> : null}
      {props.children}
    </ReactFlow>
  );
}

/** Pan/zoom schematic canvas rendering a {@link SceneView}. */
export function SceneCanvas(props: SceneCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
