import { updateActiveLink } from '../components/Header';
import { routeHref } from '../utils/base';

/**
 * Ein Seitenmodul liefert Markup und optional Lebenszyklus-Hooks:
 *
 * - `default()` → HTML-String, wird in `.content` eingesetzt
 * - `init()`    → läuft NACH dem Einsetzen ins DOM (DOM-Refs, Listener, Daten)
 * - `destroy()` → läuft VOR dem Austausch des Markups (Listener/Timer aufräumen)
 *
 * Seiten ohne `init`/`destroy` verhalten sich exakt wie bisher.
 */
interface PageModule {
  default: () => string;
  init?: () => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}

interface Route {
  path: RegExp;
  page: () => Promise<PageModule>;
}

const routes: Route[] = [
  { path: /^\/?$/, page: () => import('../pages/Dashboard.ts') },
  { path: /^\/profile$/, page: () => import('../pages/Profile.ts') },
  { path: /^\/inactivity$/, page: () => import('../pages/Inactivity.ts') },
  { path: /^\/statistics$/, page: () => import('../pages/Statistics.ts') },
  { path: /^\/settings$/, page: () => import('../pages/Settings.ts') }
];

/**
 * Zählt jeden Routenwechsel. Wird eine Route während eines laufenden
 * asynchronen Renderns erneut gewechselt, darf das ältere Ergebnis das
 * DOM nicht mehr anfassen (sonst überschreibt es die neuere Seite).
 */
let renderToken = 0;

/** Das aktuell eingehängte Seitenmodul – für destroy() beim Verlassen. */
let activeModule: PageModule | null = null;

/**
 * Ruft destroy() der aktiven Seite auf. Wichtig: Das passiert, SOLANGE das
 * Markup der alten Seite noch im DOM steht, damit Aufräumlogik noch auf ihre
 * eigenen Elemente zugreifen kann.
 */
async function teardownActiveModule(): Promise<void> {
  const module = activeModule;
  activeModule = null;
  if (!module?.destroy) return;

  try {
    await module.destroy();
  } catch (err) {
    console.error('💥 Fehler in destroy():', err);
  }
}

export async function renderRoute() {
  // 🔥 HIERHER VERSCHOBE: Erst suchen, wenn die Funktion wirklich läuft
  const contentContainer = document.querySelector<HTMLElement>('.content');

  if (!contentContainer) {
    console.error('❌ #content-anchor existiert nicht im DOM! Ist main.ts schon fertig?');
    return;
  }

  // Diesen Durchlauf markieren – spätere Wechsel machen ihn ungültig
  const token = ++renderToken;

  const hash = decodeURIComponent(window.location.hash.slice(1)) || '/';
  const route = routes.find(r => r.path.test(hash));

  // Header aktualisieren
  updateActiveLink(hash); // ✅ stattdessen

  // Alte Seite aufräumen, bevor ihr Markup ersetzt wird
  await teardownActiveModule();

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

    // Während des await kann bereits eine neuere Route angefordert worden sein
    if (token !== renderToken) return;

    contentContainer.innerHTML = PageModule.default();

    // Ab hier ist dieses Modul das aktive – destroy() beim nächsten Wechsel
    activeModule = PageModule;

    // Lebenszyklus: DOM-Refs, Listener und Daten erst jetzt anfassen
    await PageModule.init?.();
  } catch (err) {
    if (token !== renderToken) return;

    activeModule = null;
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