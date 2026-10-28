import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Event, Service } from '../../utils/ct-types';
import { loadEventsWithServices } from '../../api/events';
import { loadOwnEvents as fetchOwnEvents } from '../../api/person-events';
import { loadServices } from '../../api/services';
import { toLocalDateString, monthsAgo, monthsAhead, startOfDay } from './format';

/**
 * Zeitfenster der zwei Datenquellen (bewusst getrennt seit der
 * /persons/{id}/events-Umstellung):
 *
 *  - Eigene Events: 13 Monate zurück (Statistik) + gesamte Zukunft
 *    (Hero, Anstehende Dienste) – NUR Events, an denen die Person
 *    beteiligt ist → kleine Payload, kein teures Embed
 *  - Events mit Einteilungen: nur 3 Monate voraus (Offene Dienste,
 *    größter Quick-Button = 90 Tage) – der teure Embed-Pfad, aber
 *    auf ein Sechstel des früheren Fensters begrenzt
 */
const OWN_LOOKBACK_MONTHS = 13;
const OPEN_WINDOW_MONTHS = 3;

// ── Angemeldete Person ───────────────────────────────────────────────

let personIdentifierCache: string | null = null;

/**
 * Identifikator der angemeldeten Person – der Match-Schlüssel zwischen
 * `eventService.person.domainIdentifier` und dem aktuellen Nutzer.
 *
 * Bestätigt gegen die Live-API: /whoami liefert KEIN domainIdentifier-Feld,
 * aber die numerische ID – und person.domainIdentifier in den Einteilungen
 * ist genau diese ID als String (z. B. "31"). Deshalb der ID-Fallback.
 */
export async function getPersonIdentifier(): Promise<string> {
    if (personIdentifierCache !== null) return personIdentifierCache;

    const response = await churchtoolsClient.get<any>('/whoami');
    const me = response?.data ?? response;

    const identifier = me?.domainIdentifier ?? String(me?.id ?? '');
    personIdentifierCache = identifier;
    return identifier;
}

/** Numerische ID der angemeldeten Person (für /persons/{id}/…). */
export async function getPersonId(): Promise<number> {
    const identifier = await getPersonIdentifier();
    const id = parseInt(identifier, 10);
    if (Number.isNaN(id)) {
        throw new Error('Personen-ID konnte nicht ermittelt werden');
    }
    return id;
}

// ── Eigene Events (Statistik, Hero, Anstehende Dienste) ──────────────

let ownEventsCache: Event[] | null = null;

/**
 * Alle Events, an denen die angemeldete Person beteiligt ist –
 * 12 Monate zurück bis in die unbegrenzte Zukunft.
 *
 * Läuft über /persons/{id}/events (paginiert nicht, camelCase,
 * nur eigene Events) – dadurch unabhängig vom teuren /events-Embed.
 */
export async function loadOwnEvents(personId: number): Promise<Event[]> {
    if (ownEventsCache) return ownEventsCache;

    const from = toLocalDateString(monthsAgo(OWN_LOOKBACK_MONTHS));
    ownEventsCache = await fetchOwnEvents(personId, from);   // ← Alias
    return ownEventsCache;
}

// ── Events mit Einteilungen (Offene Dienste) ─────────────────────────

let openEventsCache: Event[] | null = null;

/**
 * Alle Events der nächsten 3 Monate inkl. Einteilungen – die Datenbasis
 * der Offene-Dienste-Karte. Läuft über /events mit include=event_services
 * (der teure Embed-Pfad, im Fenster aber klein gehalten).
 */
export async function loadOpenEvents(): Promise<Event[]> {
    if (openEventsCache) return openEventsCache;

    const from = toLocalDateString(startOfDay(new Date()));
    const to = toLocalDateString(monthsAhead(OPEN_WINDOW_MONTHS));
    openEventsCache = await loadEventsWithServices(from, to);
    return openEventsCache;
}

/** Beide Caches leeren – für reloadAll() und zum Testen. */
export function resetDashboardEvents(): void {
    ownEventsCache = null;
    openEventsCache = null;
}

/**
 * Markiert eine Einteilung im ownEvents-Cache als (nicht) zugesagt –
 * vom Annehmen-/Undo-Flow genutzt. Betrifft nur den ownEvents-Cache:
 * Anfragen-Einträge haben eine Person, sind also nie „unbesetzt" und
 * tangieren die offenen Dienste nicht.
 */
export function setEventServiceAccepted(requestId: number, accepted: boolean): void {
    if (!ownEventsCache) return;

    for (const event of ownEventsCache) {
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
 * denselben Request teilen statt doppelt zu feuern.
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