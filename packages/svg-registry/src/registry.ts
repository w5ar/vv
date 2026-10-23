import type { Catalog, SymbolDefinition } from '@fds/domain';
import { prepareSymbolSvg, type PreparedSymbol } from './prepare';

export type AssetLoader = (path: string) => Promise<string>;

export type SymbolLoadState =
  | { status: 'ready'; definition: SymbolDefinition; prepared: PreparedSymbol }
  | { status: 'error'; definition: SymbolDefinition; error: string };

/**
 * Registry of reusable SVG symbols. Definitions come from the catalog; SVG
 * markup is fetched through an injected loader (bundled files, HTTP, fs),
 * sanitized once and cached. Raw SVG files are never modified.
 */
export class SymbolRegistry {
  private readonly definitions: Map<string, SymbolDefinition>;
  private readonly cache = new Map<string, Promise<SymbolLoadState>>();
  private readonly settled = new Map<string, SymbolLoadState>();

  constructor(
    readonly catalog: Catalog,
    private readonly loader: AssetLoader,
  ) {
    this.definitions = new Map(catalog.symbols.map((s) => [s.id, s]));
  }

  definition(id: string): SymbolDefinition | undefined {
    return this.definitions.get(id);
  }

  /** Synchronous access to an already loaded symbol. */
  peek(id: string): SymbolLoadState | undefined {
    return this.settled.get(id);
  }

  load(id: string): Promise<SymbolLoadState> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const definition = this.definitions.get(id);
    const promise: Promise<SymbolLoadState> = definition
      ? this.loader(definition.asset.path).then(
          (text) => {
            const r = prepareSymbolSvg(definition, text);
            return r.ok
              ? { status: 'ready' as const, definition, prepared: r.symbol }
              : { status: 'error' as const, definition, error: r.error };
          },
          (e: unknown) => ({
            status: 'error' as const,
            definition,
            error: `Datoteka ${definition.asset.path} nije učitana: ${e instanceof Error ? e.message : String(e)}`,
          }),
        )
      : Promise.reject(new Error(`Simbol „${id}” nije u katalogu.`));
    const tracked = promise.then((s) => {
      this.settled.set(id, s);
      return s;
    });
    this.cache.set(id, tracked);
    return tracked;
  }

  async loadAll(): Promise<SymbolLoadState[]> {
    return Promise.all([...this.definitions.keys()].map((id) => this.load(id)));
  }
}
