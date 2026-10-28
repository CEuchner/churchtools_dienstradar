import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Event } from '../utils/ct-types';

/**
 * Alle Events, an denen eine Person beteiligt ist – ab `from`
 * (Vergangenheit) bis in die Zukunft.
 *
 * Verifiziert gegen die Live-API:
 *  - liefert isAccepted (zugesagte und nicht zugesagte Einteilungen)
 *  - paginiert NICHT → ein einzelner GET, kein fetchAllPages
 *  - Einteilungen liegen unter `eventServices` (camelCase) →
 *    keine Normalisierung nötig, anders als bei /events mit
 *    include=event_services
 */
export async function loadOwnEvents(personId: number, fromDate: string): Promise<Event[]> {
    const response = await churchtoolsClient.get<any>(
        `/persons/${personId}/events?from=${fromDate}`
    );

    const events = (response?.data ?? response ?? []) as Event[];

    // Sicherheitsnetz (billig): falls der Server je doch seitelt
    return Array.from(new Map(events.map(event => [event.id, event])).values());
}