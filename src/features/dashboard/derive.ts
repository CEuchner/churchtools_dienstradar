import type { Event, EventService, Service } from '../../utils/ct-types';
import { eventStartDate, startOfDay } from './format';
import { isServiceGroupOpenEntryVisible } from '../../utils/service-visibility';
import type { UserPermissions } from '../../api/permissions';

export interface OwnEventEntry {
    event: Event;
    /** Eigene Einteilungen in diesem Event (mindestens eine). */
    services: EventService[];
}

export interface OpenServiceEntry {
    event: Event;
    /** Unbesetzte, sichtbare Einteilungen dieses Events. */
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