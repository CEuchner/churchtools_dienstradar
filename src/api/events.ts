import type { Event } from '../utils/ct-types';
import { fetchAllPages } from './client';

/** ChurchTools erlaubt für /events maximal 100 Einträge pro Seite. */
const EVENTS_PAGE_LIMIT = 100;

/**
 * Lädt alle Termine im Zeitraum inklusive ihrer Diensteinteilungen.
 *
 * Achtung: Der `to`-Parameter der API ist exklusiv. Damit Termine AM Enddatum
 * mit erfasst werden, wird ein Tag aufgeschlagen.
 */
export async function loadEventsWithServices(
    fromDate: string,
    toDate: string
): Promise<Event[]> {
    const endDate = new Date(toDate);
    endDate.setDate(endDate.getDate() + 1);
    const inclusiveToDate = endDate.toISOString().split('T')[0];

    const events = await fetchAllPages<Event>(
        '/events',
        `from=${fromDate}&to=${inclusiveToDate}&direction=forward&canceled=false&include=event_services`,
        { limit: EVENTS_PAGE_LIMIT }
    );

    return events.map(event => {
        const raw = event as Event & { event_services?: Event['eventServices'] };
        return {
            ...event,
            eventServices: raw.eventServices ?? raw.event_services,
        };
    });
}