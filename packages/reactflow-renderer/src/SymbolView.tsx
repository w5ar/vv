import { useMemo } from 'react';
import { withVisualState } from '@fds/svg-registry';
import { useSymbol } from './registry-context';
import { SvgTree } from './SvgTree';

export interface SymbolViewProps {
  readonly symbolId: string;
  readonly width: number;
  readonly height: number;
  readonly visualState?: string | null | undefined;
  readonly className?: string;
}

/** Renders a catalog symbol at a given size; shows a labelled placeholder for missing/broken assets. */
export function SymbolView({ symbolId, width, height, visualState, className }: SymbolViewProps) {
  const loaded = useSymbol(symbolId);
  const tree = useMemo(() => {
    if (loaded?.status !== 'ready') return null;
    const state = loaded.definition.visualStates.find((s) => s.id === visualState);
    return withVisualState(loaded.prepared, state);
  }, [loaded, visualState]);

  if (!loaded) return <div className={`fds-symbol fds-symbol--loading ${className ?? ''}`} style={{ width, height }} />;
  if (loaded.status === 'error' || !tree) {
    return (
      <div className={`fds-symbol fds-symbol--error ${className ?? ''}`} style={{ width, height }} title={loaded.status === 'error' ? loaded.error : ''}>
        ?
      </div>
    );
  }
  return (
    <div className={`fds-symbol ${className ?? ''}`} style={{ width, height }}>
      <SvgTree root={tree} title={loaded.definition.name} />
    </div>
  );
}
