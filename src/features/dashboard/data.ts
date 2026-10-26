import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Event, Service } from '../../utils/ct-types';
import { loadEventsWithServices } from '../../api/events';
import { loadServices } from '../../api/services';
import { toLocalDateString, monthsAgo, monthsAhead } from './format';

/** Betrachtungszeitraum fürs Dashboard: 1 Jahr zurück, 3 Monate voraus. */
const LOOKBACK_MONTHS = 12;
const LOOKAHEAD_MONTHS = 3;

// ── Angemeldete Person ───────────────────────────────────────────────

let personIdentifierCache: string | null = null;

/**
 * Identifikator der angemeldeten Person – der Match-Schlüssel zwischen
 * `eventService.person.domainIdentifier` und dem aktuellen Nutzer.
 *
 * Bestätigt gegen die Live-API: /whoami liefert KEIN domainIdentifier-Feld,
 * aber die numerische ID – und person.domainIdentifier in den Einteilungen
 * ist genau diese ID als String (z. B. "31"). Deshalb der ID-Fallback.
 * Einmal geladen, danach gecacht.
 */
export async function getPersonIdentifier(): Promise<string> {
    if (personIdentifierCache !== null) return personIdentifierCache;

    const response = await churchtoolsClient.get<any>('/whoami');
    const me = response?.data ?? response;

    const identifier = me?.domainIdentifier ?? String(me?.id ?? '');
    personIdentifierCache = identifier;
    return identifier;
}

/** Numerische ID der angemeldeten Person (für /persons/{id}/servicerequests). */
export async function getPersonId(): Promise<number> {
    const identifier = await getPersonIdentifier();
    const id = parseInt(identifier, 10);
    if (Number.isNaN(id)) {
        throw new Error('Personen-ID konnte nicht ermittelt werden');
    }
    return id;
}

// ── Event-Abruf (einmal laden, alle Spalten leiten daraus ab) ────────

let eventsCache: Event[] | null = null;

/**
 * Alle Events im Dashboard-Zeitraum inkl. Diensteinteilungen.
 * Bewusst EIN Abruf fürs ganze Dashboard – Hero, Spalte 1 und die
 * kommenden Blöcke (offene Dienste, Statistik) nutzen denselben Cache.
 */
export async function loadDashboardEvents(): Promise<Event[]> {
    if (eventsCache) return eventsCache;

    const from = toLocalDateString(monthsAgo(LOOKBACK_MONTHS));
    const to = toLocalDateString(monthsAhead(LOOKAHEAD_MONTHS));
    const events = await loadEventsWithServices(from, to);

    // Paginierungs-Sicherheit: Seitengrenzen können sich zwischen zwei
    // Seitenabrufen verschieben (neues Event davor entsteht) – dasselbe
    // Event landet dann auf zwei Seiten. Dedupliziert nach ID.
    eventsCache = Array.from(
        new Map(events.map(event => [event.id, event])).values()
    );
    return eventsCache;
}

/** Cache leeren – für das Polling und zum Testen. */
export function resetDashboardEvents(): void {
    eventsCache = null;
}

/**
 * Markiert eine Einteilung im Event-Cache als (nicht) zugesagt –
 * vom Annehmen-/Undo-Flow genutzt. (In der Monolith-Fassung hießen
 * die Gegenstücke markRequestAccepted/markRequestUndone.)
 */
export function setEventServiceAccepted(requestId: number, accepted: boolean): void {
    if (!eventsCache) return;

    for (const event of eventsCache) {
        for (const service of event.eventServices ?? []) {
            if (service.id === requestId) {
                service.isAccepted = accepted;
                return;
            }
        }
    }
}

// ── Dienst-Stammdaten ────────────────────────────────────────────────

/**
 * Alle Services (mit serviceGroupId und groupIds) – benötigt für die
 * Sichtbarkeitsprüfung offener Dienste und für die Namensauflösung.
 * Gecacht wird der laufende Abruf (Promise), damit parallele Aufrufer
 * (z. B. getServiceMetaMap + getServices in init()) denselben Request
 * teilen statt doppelt zu feuern.
 */
let servicesCachePromise: Promise<Service[]> | null = null;

export function getServices(): Promise<Service[]> {
    if (!servicesCachePromise) {
        servicesCachePromise = loadServices();
    }
    return servicesCachePromise;
}

/**
 * serviceId → { name, sortKey }, einmalig geladen.
 *
 * Wichtig: EventService.name ist NICHT der Dienstname, sondern der Name
 * der zugewiesenen Person (z. B. "Otto Normalverbraucher"). Der echte
 * Dienstname kommt aus /services, aufgelöst über serviceId.
 */
export interface ServiceMeta {
    name: string;
    sortKey: number;
}

let serviceMetaCache: Map<number, ServiceMeta> | null = null;

export async function getServiceMetaMap(): Promise<Map<number, ServiceMeta>> {
    if (serviceMetaCache) return serviceMetaCache;
    const services = await getServices();
    serviceMetaCache = new Map(
        services.map(s => [s.id, { name: s.name ?? 'Unbenannter Dienst', sortKey: s.sortKey ?? 0 }])
    );
    return serviceMetaCache;
}