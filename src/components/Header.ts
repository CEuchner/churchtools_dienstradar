import { routeHref } from '../utils/base';
import { icon } from './icons';
import { canAccessPage } from '../api/access-control';

/** Titelzeile: Burger (mobil) + Logo + App-Name */
export function renderHeader() {
  return `
    <div class="container">
      <button class="nav-toggle" aria-label="Menü öffnen oder schließen"
              aria-expanded="false">
        ${icon('menu')}
      </button>
      <h1>
        ${icon('radar')}
        DienstRadar
      </h1>
    </div>
  `;
}

/** Burger-Toggle: öffnet/schließt das Menü auf kleinen Screens */
/** Burger-Toggle: öffnet/schließt das Menü auf kleinen Screens */
export function initNavToggle() {
  const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const nav = document.querySelector<HTMLElement>('.nav');
  if (!toggle || !nav) return;

  const isOpen = () => nav.classList.contains('open');

  const setOpen = (open: boolean) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    setOpen(!isOpen());
  });

  // Klick irgendwo anders → Drawer schließen
  document.addEventListener('click', (event) => {
    if (!isOpen()) return;

    const target = event.target as Node;

    // Klick auf den Burger selbst? → nicht hier behandeln (Toggle macht das)
    if (toggle.contains(target)) return;

    // Klick IM Menü? → offen lassen
    if (nav.contains(target)) return;

    // Alles andere: schließen
    setOpen(false);
  });

  // Bei Navigation (Klick auf einen Link → hashchange) ebenfalls schließen
  window.addEventListener('hashchange', () => setOpen(false));
}

/** Hauptnavigation – oben in der Sidebar */
const MAIN_LINKS = [
  { route: '/', label: 'Dashboard', icon: 'home' },
  // { route: '/profile', label: 'Profil', icon: 'user' },
  { route: '/inactivity', label: 'Inaktivität', icon: 'magnificant_glass' },
  { route: '/statistics', label: 'Statistiken', icon: 'chart' }
];

/** Sekundäre Links – ganz unten, abgetrennt durch Trennlinie */
const FOOTER_LINKS = [
  { route: '/settings', label: 'Einstellungen', icon: 'settings' }
];

/** Baut die <a>-Elemente einer Link-Gruppe */
function renderLinkGroup(links: typeof MAIN_LINKS): string {
  return links
    .filter(l => canAccessPage(l.route))
    .map(l => `
      <a href="${routeHref(l.route)}" data-route="${l.route}" class="link">
        ${icon(l.icon)}
        <span>${l.label}</span>
      </a>
    `).join('');
}

/** Nav-Links – der Container <nav class="nav"> steht schon im Markup */
export function renderNav() {
  return `
    ${renderLinkGroup(MAIN_LINKS)}
    <div class="nav-divider" role="separator"></div>
    ${renderLinkGroup(FOOTER_LINKS)} 
  `;
}

/** Markiert den zur aktuellen Route gehörenden Menüpunkt */
export function updateActiveLink(currentHash: string) {
  document.querySelectorAll('.nav .link').forEach(link => {
    const routeAttr = link.getAttribute('data-route') || '';
    link.classList.toggle('active', routeAttr === currentHash);
  });
}