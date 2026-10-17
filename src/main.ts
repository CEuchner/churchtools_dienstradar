// import type { Person } from './utils/ct-types';
import { churchtoolsClient } from '@churchtools/churchtools-client';
import { renderHeader, renderNav, initNavToggle } from './components/Header';
import { initRouter } from './router/router';
import './styles/main.css';

// only import reset.css in development mode to keep the production bundle small and to simulate CT environment
if (import.meta.env.MODE === 'development') {
    import('./utils/reset.css');
}

declare const window: Window &
    typeof globalThis & {
        settings: {
            base_url?: string;
        };
    };

const baseUrl = window.settings?.base_url ?? import.meta.env.VITE_BASE_URL;
churchtoolsClient.setBaseUrl(baseUrl);

const username = import.meta.env.VITE_USERNAME;
const password = import.meta.env.VITE_PASSWORD;
if (import.meta.env.MODE === 'development' && username && password) {
    await churchtoolsClient.post('/login', { username, password });
}

const KEY = import.meta.env.VITE_KEY;
export { KEY };

// const user = await churchtoolsClient.get<Person>(`/whoami`);

// 1. Layout-Struktur injizieren (IDs nur für JS, Klassen für CSS)
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="dr-root">
    <div class="layout">
      <div class="header"></div>
      <div class="body">
        <nav class="nav" id="site-nav"></nav>
        <main class="content"></main>
      </div>
    </div>
  </div>
`;

/**
 * Setzt die exakt verfügbare Höhe für die Extension:
 * Fensterhöhe minus dem Platz über dem Root (z. B. CT-Topbar).
 * ResizeObserver, weil CTs Layout sich auch ändern kann, OHNE dass
 * das Fenster resized (verzögertes Rendern, ein-/ausgeklappte Sidebar).
 */
function updateRootHeight() {
  const root = document.querySelector<HTMLElement>('.dr-root');
  if (!root) return;
  const top = root.getBoundingClientRect().top;
  root.style.setProperty('--dr-height', `${window.innerHeight - top}px`);
  root.style.setProperty('--dr-top', `${top}px`);   // ← NEU
}

// Erste Messung: erst nach dem nächsten Frame – dann ist unser Layout
// sicher im DOM und die erste CT-Basis-Struktur steht
requestAnimationFrame(updateRootHeight);

// Dauerhafte Überwachung: jede Größenänderung des Seiten-Layouts
// (auch von CT verursacht) löst eine Neu-Messung aus
const observer = new ResizeObserver(updateRootHeight);
observer.observe(document.body);

updateRootHeight();
window.addEventListener('resize', updateRootHeight);

document.querySelector('.header')!.innerHTML = renderHeader();
document.querySelector('.nav')!.innerHTML = renderNav();

initRouter();
initNavToggle();