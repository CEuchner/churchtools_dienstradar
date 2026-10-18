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

    return fetchAllPages<Event>(
        '/events',
        `from=${fromDate}&to=${inclusiveToDate}&include=eventServices`,
        { limit: EVENTS_PAGE_LIMIT }
    );
}