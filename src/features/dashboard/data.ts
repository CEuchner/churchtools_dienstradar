import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Event, EventService, Service } from '../../utils/ct-types';
import { loadEventsWithServices } from '../../api/events';
import { loadServices } from '../../api/services';
import { isServiceGroupOpenEntryVisible } from '../../utils/service-visibility';
import type { UserPermissions } from '../../api/permissions';

/** Betrachtungszeitraum fürs Dashboard: 1 Jahr zurück, 3 Monate voraus. */
const LOOKBACK_MONTHS = 12;
const LOOKAHEAD_MONTHS = 3;

// ── Datum-Helfer ─────────────────────────────────────────────────────

/** Date → 'YYYY-MM-DD' (lokal, nicht UTC – damit Tagesgrenzen stimmen). */
function toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function monthsAgo(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
}

function monthsAhead(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d;
}

function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Event-Startzeit als Date. `startDate` ist ein Zulu-String (UTC). */
export function eventStartDate(event: Event): Date {
    return new Date(event.startDate ?? '');
}

/** Deutsche Kurzform für Listen/Hero, z. B. „Fr, 23.10. · 01:00". */
export function formatEventDateTime(event: Event): string {
    const date = eventStartDate(event);
    if (Number.isNaN(date.getTime())) return '';

    const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' });
    const day = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${weekday}, ${day} · ${time}`;
}

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
    if (personIdentifierCache) return personIdentifierCache;

    const response = await churchtoolsClient.get<any>('/whoami');
    const me = response?.data ?? response;
    personIdentifierCache = me?.domainIdentifier ?? String(me?.id ?? '');
    return personIdentifierCache;
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
    eventsCache = await loadEventsWithServices(from, to);
    return eventsCache;
}

/** Cache leeren – für das Polling aus Phase 6 und zum Testen. */
export function resetDashboardEvents(): void {
    eventsCache = null;
}

// ── Ableitungen ──────────────────────────────────────────────────────

export interface OwnEventEntry {
    event: Event;
    /** Eigene Einteilungen in diesem Event (mindestens eine). */
    services: EventService[];
}

/**
 * Anstehende Events mit eigenen ZUGESAGTEN Einteilungen (isAccepted),
 * chronologisch sortiert. Offene Anfragen (isAccepted === false) zählen
 * hier bewusst NICHT – Anfragen kommen über den dedizierten Endpunkt
 * (api/servicerequests.ts).
 * Grundlage für Spalte 1 UND den Hero: der erste Eintrag ist das nächste
 * Event (das Event zählt, nicht der einzelne Dienst – so gewünscht).
 */
export function getUpcomingOwnEvents(
    events: Event[],
    personIdentifier: string
): OwnEventEntry[] {
    const todayStart = startOfDay(new Date()).getTime();

    return events
        .filter(event => !event.isCanceled)
        .map(event => ({
            event,
            services: (event.eventServices ?? []).filter(
                service => service.person?.domainIdentifier === personIdentifier
                    && service.isAccepted === true
            ),
        }))
        .filter(entry => entry.services.length > 0)
        .filter(entry => eventStartDate(entry.event).getTime() >= todayStart)
        .sort((a, b) => eventStartDate(a.event).getTime() - eventStartDate(b.event).getTime());
}

/**
 * Offene Anfragen an die angemeldete Person (Einteilung vorhanden, aber
 * isAccepted === false), anstehend, chronologisch.
 *
 * Vorläufige Basis für die Anfragen-Karte: Aus dieser Payload lässt sich
 * „offen" von „abgelehnt" nicht unterscheiden – beide stehen auf false.
 * Phase 5 wechselt auf den dedizierten Endpunkt
 * GET /persons/{personId}/servicerequests, der den Status sauber liefert.
 */


/** Countdown-Text für den Hero: „heute", „morgen", „in X Tagen". */
export function formatCountdown(target: Date, now: Date = new Date()): string {
    const diffDays = Math.round(
        (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000
    );

    if (diffDays <= 0) return 'heute';
    if (diffDays === 1) return 'morgen';
    return `in ${diffDays} Tagen`;
}

// ── Dienstnamen ──────────────────────────────────────────────────────

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

// ── Event-Link ───────────────────────────────────────────────────────

/** Basis-URL der ChurchTools-Instanz – nicht die der Extension. */
function ctBaseUrl(): string {
    // Installiert: der Host setzt window.settings.base_url.
    // Dev: VITE_BASE_URL aus der .env. Fallback: aktueller Origin.
    const settings = (window as any)?.settings;
    return settings?.base_url ?? import.meta.env.VITE_BASE_URL ?? window.location.origin;
}

/**
 * Link zum Event in ChurchTools (für target="_blank"):
 * https://<instanz>/?q=churchservice&id=<eventId>#ListView/
 */
export function buildEventUrl(eventId: number | undefined): string {
    if (!eventId) return '';
    return `${ctBaseUrl()}/?q=churchservice&id=${eventId}#ListView/`;
}

// ── Hero-Datums-Helfer ───────────────────────────────────────────────

/** Nur die Tageszahl, z. B. „23". */
export function formatDayOfMonth(date: Date): string {
    return date.toLocaleDateString('de-DE', { day: '2-digit' });
}

/** Monat kurz, z. B. „Okt.". */
export function formatMonthShort(date: Date): string {
    return date.toLocaleDateString('de-DE', { month: 'short' });
}

/** Lange Form fürs Hero, z. B. „Freitag, 23. Oktober · 01:00 Uhr". */
export function formatEventDateLong(event: Event): string {
    const date = eventStartDate(event);
    if (Number.isNaN(date.getTime())) return '';

    const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
    const day = date.toLocaleDateString('de-DE', { day: 'numeric' });
    const month = date.toLocaleDateString('de-DE', { month: 'long' });
    const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${weekday}, ${day}. ${month} · ${time} Uhr`;
}

// ── Offene (unbesetzte) Dienste ──────────────────────────────────────

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

export interface OpenServiceEntry {
    event: Event;
    /** Unbesetzte, sichtbare Einteilungen dieses Events. */
    services: EventService[];
}

/**
 * Anstehende Events mit UNBESSETZEN Diensten, die der Nutzer sehen darf
 * (`edit servicegroup` global ODER `+entry all`/`+entry free` in einer
 * zugeordneten Gruppe). Chronologisch sortiert.
 *
 * „Unbesetzt" = Einteilung ohne Person (person und personId leer).
 */
export function getOpenServices(
    events: Event[],
    services: Service[],
    perms: UserPermissions
): OpenServiceEntry[] {
    const todayStart = startOfDay(new Date()).getTime();
    const serviceById = new Map(services.map(s => [s.id, s]));

    return events
        .filter(event => !event.isCanceled)
        .filter(event => eventStartDate(event).getTime() >= todayStart)
        .map(event => ({
            event,
            services: (event.eventServices ?? []).filter(es => {
                if (es.person !== null && es.person !== undefined) return false;
                if (es.personId !== null && es.personId !== undefined) return false;
                if (es.isValid === false) return false;

                const service = es.serviceId !== undefined ? serviceById.get(es.serviceId) : undefined;
                if (!service?.serviceGroupId) return false;

                return isServiceGroupOpenEntryVisible(service.serviceGroupId, services, perms);
            }),
        }))
        .filter(entry => entry.services.length > 0)
        .sort((a, b) => eventStartDate(a.event).getTime() - eventStartDate(b.event).getTime());
}

// ── Anfragen-Unterstützung ───────────────────────────────────────────

/** Numerische ID der angemeldeten Person (für /persons/{id}/servicerequests). */
export async function getPersonId(): Promise<number> {
    const identifier = await getPersonIdentifier();
    const id = parseInt(identifier, 10);
    if (Number.isNaN(id)) {
        throw new Error('Personen-ID konnte nicht ermittelt werden');
    }
    return id;
}

/**
 * Markiert eine Einteilung im Event-Cache als zugesagt (nach erfolgreichem
 * Annehmen). Dadurch erscheint der Dienst ohne Neuladen in „Anstehende
 * Dienste" und – falls er das nächste Event ist – im Hero.
 */
export function markRequestAccepted(requestId: number): void {
    if (!eventsCache) return;

    for (const event of eventsCache) {
        for (const service of event.eventServices ?? []) {
            if (service.id === requestId) {
                service.isAccepted = true;
                return;
            }
        }
    }
}

/**
 * Gegenstück zu markRequestAccepted: Markiert eine Einteilung im Cache
 * wieder als offen (isAccepted = false). Wird vom Undo-Flow genutzt,
 * falls kein kompletter Neuladevorgang gewünscht ist.
 */
export function markRequestUndone(requestId: number): void {
    if (!eventsCache) return;

    for (const event of eventsCache) {
        for (const service of event.eventServices ?? []) {
            if (service.id === requestId) {
                service.isAccepted = false;
                return;
            }
        }
    }
}