// Liefert die Basis-URL deines Moduls, z. B. "/ccm/dienstradar"
function getModuleBase(): string {
  return window.location.pathname
    .replace(/index\.html$/, '') // /ccm/dienstradar/index.html → /ccm/dienstradar/
    .replace(/\/+$/, '');        // /ccm/dienstradar/        → /ccm/dienstradar
}

export const BASE = getModuleBase();

// Kleiner Helfer: baut aus einer Route einen kompletten, sicheren Link
export function routeHref(route: string): string {
  return `${BASE}/#${route}`;
}