import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SymbolLoadState, SymbolRegistry } from '@fds/svg-registry';

const RegistryContext = createContext<SymbolRegistry | null>(null);

export function SymbolRegistryProvider({ registry, children }: { registry: SymbolRegistry; children: ReactNode }) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useSymbolRegistry(): SymbolRegistry | null {
  return useContext(RegistryContext);
}

/** Loads (or reads from cache) one symbol. Returns undefined while loading. */
export function useSymbol(symbolId: string): SymbolLoadState | undefined {
  const registry = useSymbolRegistry();
  const [state, setState] = useState<SymbolLoadState | undefined>(() => registry?.peek(symbolId));
  useEffect(() => {
    if (!registry) return;
    const cached = registry.peek(symbolId);
    if (cached) {
      setState(cached);
      return;
    }
    let alive = true;
    registry.load(symbolId).then(
      (s) => alive && setState(s),
      () => alive && setState(undefined),
    );
    return () => {
      alive = false;
    };
  }, [registry, symbolId]);
  return state;
}
