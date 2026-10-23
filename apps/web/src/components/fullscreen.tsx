import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full screen for a part of the page: the Fullscreen API where the browser offers it for any
 * element, otherwise (e.g. Safari on iPhone) a fixed overlay over the whole window.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const sync = () => setNative(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlay(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('has-fullscreen');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-fullscreen');
    };
  }, [overlay]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (native) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (overlay) {
      setOverlay(false);
    } else if (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [native, overlay]);

  return { ref, active: native || overlay, overlay, toggle };
}

export function FullscreenButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="btn btn--small canvas-fs-btn"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Izađi iz prikaza preko cijelog zaslona (Esc)' : 'Prikaz preko cijelog zaslona'}
      data-testid="fullscreen-toggle"
    >
      {active ? '✕ Izađi' : '⛶ Cijeli zaslon'}
    </button>
  );
}

/** Class names of a workspace body that can be shown full screen. */
export function fullscreenClass(fs: { active: boolean; overlay: boolean }): string {
  return [fs.active ? 'is-fullscreen' : '', fs.overlay ? 'is-fullscreen-overlay' : ''].filter(Boolean).join(' ');
}
