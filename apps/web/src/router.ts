import { useEffect, useState } from 'react';

/** Minimal hash router (no dependency): routes are Croatian, identifiers stay technical. */
export type Route =
  | { name: 'library' }
  | { name: 'catalog'; catalogId?: string | undefined }
  | { name: 'editor'; exerciseId: string }
  | { name: 'player'; exerciseId: string }
  | { name: 'training'; exerciseId: string; mode: 'training' | 'assessment' }
  | { name: 'import' }
  | { name: 'not-found'; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head = '', ...rest] = path.split('/').map((p) => decodeURIComponent(p));
  const id = rest[0];
  switch (head) {
    case '':
      return { name: 'library' };
    case 'katalog':
      return { name: 'catalog', catalogId: id };
    case 'uredivac':
      return id ? { name: 'editor', exerciseId: id } : { name: 'not-found', path };
    case 'demonstracija':
      return id ? { name: 'player', exerciseId: id } : { name: 'not-found', path };
    case 'vjezbanje':
      return id ? { name: 'training', exerciseId: id, mode: 'training' } : { name: 'not-found', path };
    case 'provjera':
      return id ? { name: 'training', exerciseId: id, mode: 'assessment' } : { name: 'not-found', path };
    case 'uvoz':
      return { name: 'import' };
    default:
      return { name: 'not-found', path };
  }
}

export function href(route: Route): string {
  const enc = encodeURIComponent;
  switch (route.name) {
    case 'library':
      return '#/';
    case 'catalog':
      return route.catalogId ? `#/katalog/${enc(route.catalogId)}` : '#/katalog';
    case 'editor':
      return `#/uredivac/${enc(route.exerciseId)}`;
    case 'player':
      return `#/demonstracija/${enc(route.exerciseId)}`;
    case 'training':
      return `#/${route.mode === 'assessment' ? 'provjera' : 'vjezbanje'}/${enc(route.exerciseId)}`;
    case 'import':
      return '#/uvoz';
    case 'not-found':
      return `#/${route.path}`;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
