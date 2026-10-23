import type {
  Catalog,
  ConnectionRule,
  EquipmentType,
  PortDefinition,
  PortType,
  RoleDefinition,
  SymbolCategory,
  SymbolDefinition,
} from './catalog';
import type { Id } from './common';

/** Read-only lookup structure over a catalog (plus optional exercise-specific roles). */
export interface CatalogIndex {
  readonly catalog: Catalog;
  readonly symbols: ReadonlyMap<Id, SymbolDefinition>;
  readonly categories: ReadonlyMap<Id, SymbolCategory>;
  readonly portTypes: ReadonlyMap<Id, PortType>;
  readonly equipmentTypes: ReadonlyMap<Id, EquipmentType>;
  readonly roles: ReadonlyMap<Id, RoleDefinition>;
  readonly connectionRules: readonly ConnectionRule[];
  getPort(symbolId: Id, portId: Id): PortDefinition | undefined;
}

function byId<T extends { id: Id }>(items: readonly T[]): Map<Id, T> {
  const map = new Map<Id, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}

export function indexCatalog(catalog: Catalog, extraRoles: readonly RoleDefinition[] = []): CatalogIndex {
  const symbols = byId(catalog.symbols);
  const portsBySymbol = new Map<Id, Map<Id, PortDefinition>>();
  for (const s of catalog.symbols) portsBySymbol.set(s.id, byId(s.ports));
  return {
    catalog,
    symbols,
    categories: byId(catalog.categories),
    portTypes: byId(catalog.portTypes),
    equipmentTypes: byId(catalog.equipmentTypes),
    roles: byId([...catalog.roles, ...extraRoles]),
    connectionRules: catalog.connectionRules,
    getPort: (symbolId, portId) => portsBySymbol.get(symbolId)?.get(portId),
  };
}
