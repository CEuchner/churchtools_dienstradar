import type { Service } from '../../utils/ct-types';
import { state } from './state';
import {
    isServiceGroupVisible as sharedGroupVisible,
    isServiceVisible as sharedServiceVisible,
} from '../../utils/service-visibility';

/**
 * Adapter auf die geteilte Sichtbarkeitslogik (utils/service-visibility.ts).
 * Injiziert den State dieser Seite – Logik und Caching liegen geteilt.
 *
 * Historie der Rechteprüfungen (in der geteilten Logik aktiv):
 *  - `edit servicegroup` (global) – seit dem Dashboard-Umbau aktiv
 *  - `+entry all` (gruppenintern) – aktiv (seit Karteileichen v1.0.3 war
 *    vorher `+view service` aktiv, siehe Kommentare dort)
 *  - `serviceGroup.viewAll` (öffentliche Dienstgruppe) – deaktiviert
 *  - Global `view servicegroup` – wird geladen, aber nicht ausgewertet
 */

/**
 * Muss bei neuen Dienstdaten aufgerufen werden (z. B. in init()).
 * Der Index-Cache der geteilten Logik ist eine WeakMap auf die
 * Service-Liste – der Aufruf bleibt für die bestehenden Aufrufstellen
 * als Kompatibilitäts-No-op erhalten.
 */
export function resetServiceGroupIndex(): void {
    // bewusst leer – siehe Kommentar oben
}

/** Sichtbarkeit einer Dienstgruppe für den Inaktivitäts-Kontext. */
export function isServiceGroupVisible(serviceGroupId: number): boolean {
    const perms = state.userPermissions;
    if (!perms) return true; // Rechte noch nicht geladen → nichts ausblenden
    return sharedGroupVisible(serviceGroupId, state.services, perms);
}

/** Sichtbarkeit eines einzelnen Dienstes für den Inaktivitäts-Kontext. */
export function isServiceVisible(service: Service): boolean {
    const perms = state.userPermissions;
    if (!perms) return true;
    return sharedServiceVisible(service, state.services, perms);
}