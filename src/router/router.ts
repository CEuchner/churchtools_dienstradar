import { updateActiveLink } from '../components/Header';
import { routeHref } from '../utils/base';

interface Route {
  path: RegExp;
  page: () => Promise<{ default: () => string }>;
}

const routes: Route[] = [
  { path: /^\/?$/, page: () => import('../pages/Dashboard.ts') },
  { path: /^\/profile$/, page: () => import('../pages/Profile.ts') },
  { path: /^\/inactivity$/, page: () => import('../pages/Inactivity.ts') },
  { path: /^\/statistics$/, page: () => import('../pages/Statistics.ts') },
  { path: /^\/settings$/, page: () => import('../pages/Settings.ts') }
];

export async function renderRoute() {
  // 🔥 HIERHER VERSCHOBE: Erst suchen, wenn die Funktion wirklich läuft
  const contentContainer = document.querySelector<HTMLElement>('.content');
  
  if (!contentContainer) {
    console.error('❌ #content-anchor existiert nicht im DOM! Ist main.ts schon fertig?');
    return;
  }

  const hash = decodeURIComponent(window.location.hash.slice(1)) || '/';
  const route = routes.find(r => r.path.test(hash));

  // Header aktualisieren
  updateActiveLink(hash); // ✅ stattdessen

  if (!route) {
    contentContainer.innerHTML = `
      <div class="dr-card">
        <h2>Seite nicht gefunden</h2>
        <p>Route "${hash}" ist nicht definiert.</p>
        <a href="#/" class="dr-link" style="display:inline-block;margin-top:0.5rem">← Dashboard</a>
      </div>
    `;
    return;
  }

  try {
    const PageModule = await route.page();
    if (typeof PageModule.default !== 'function') {
      throw new Error('Seite hat keinen "export default function"');
    }
    contentContainer.innerHTML = PageModule.default();
  } catch (err) {
    console.error('💥 Fehler beim Laden der Seite:', err);
    contentContainer.innerHTML = `
      <div class="dr-card" style="color:#dc2626;border:1px solid #fecaca">
        <h2>Fehler beim Laden</h2>
        <pre style="background:#f8fafc;padding:0.5rem;border-radius:4px;margin-top:0.5rem">${String(err)}</pre>
      </div>
    `;
  }
}

export function initRouter() {
  // Ohne Hash → "/" in die URL schreiben, OHNE die Seite neu zu laden
  if (!window.location.hash) {
    history.replaceState(null, '', routeHref('/'));
  }

  window.addEventListener('hashchange', renderRoute);
  renderRoute(); // Initialer Aufruf
}