import { CatalogPage } from './pages/CatalogPage';
import { EditorPage } from './pages/EditorPage';
import { ImportReviewPage } from './pages/ImportReviewPage';
import { LibraryPage } from './pages/LibraryPage';
import { PlayerPage } from './pages/PlayerPage';
import { TrainingPage } from './pages/TrainingPage';
import { href, useRoute, type Route } from './router';

function NavLink({ to, active, children }: { to: Route; active: boolean; children: string }) {
  return (
    <a href={href(to)} className={`nav__link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      {children}
    </a>
  );
}

export function App() {
  const route = useRoute();
  let page;
  switch (route.name) {
    case 'library':
      page = <LibraryPage />;
      break;
    case 'catalog':
      page = <CatalogPage catalogId={route.catalogId} />;
      break;
    case 'editor':
      page = <EditorPage key={route.exerciseId} exerciseId={route.exerciseId} />;
      break;
    case 'player':
      page = <PlayerPage key={route.exerciseId} exerciseId={route.exerciseId} />;
      break;
    case 'training':
      page = <TrainingPage key={`${route.mode}:${route.exerciseId}`} exerciseId={route.exerciseId} mode={route.mode} />;
      break;
    case 'import':
      page = <ImportReviewPage />;
      break;
    case 'not-found':
      page = (
        <div className="page page--narrow">
          <h1>Stranica nije pronađena</h1>
          <p>
            Adresa „{route.path}” ne postoji. <a href="#/">Povratak na knjižnicu vježbi</a>
          </p>
        </div>
      );
      break;
  }
  return (
    <div className="app">
      <header className="app__header">
        <a href="#/" className="app__brand">
          <span className="app__logo" aria-hidden>
            ▲
          </span>
          Simulator vatrogasnih vježbi
        </a>
        <nav className="nav" aria-label="Glavna navigacija">
          <NavLink to={{ name: 'library' }} active={route.name === 'library'}>
            Knjižnica vježbi
          </NavLink>
          <NavLink to={{ name: 'catalog' }} active={route.name === 'catalog'}>
            Katalog simbola
          </NavLink>
          <NavLink to={{ name: 'import' }} active={route.name === 'import'}>
            Pregled uvoza
          </NavLink>
        </nav>
      </header>
      <main className="app__main">{page}</main>
    </div>
  );
}
