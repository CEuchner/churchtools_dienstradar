import { churchtoolsClient } from '@churchtools/churchtools-client';

/**
 * Eine Dienstanfrage aus GET /persons/{personId}/servicerequests.
 *
 * Praktisch: serviceName und event sind eingebettet – für die Anzeige
 * brauchen wir keine zusätzlichen Aufrufe.
 */
export interface ServiceRequest {
    /** ID der Einteilung/Anfrage (entspricht eventService.id, z. B. 104). */
    id: number;
    serviceId: number;
    serviceName: string | null;
    isAccepted: boolean;
    isValid: boolean;
    /** Wer angefragt hat (z. B. „Christian Euchner"). */
    requesterPerson: { title: string } | null;
    event: { id: number; name: string; startDate: string } | null;
}

/** Alle Dienstanfragen einer Person – zugesagte UND offene. */
export async function loadServiceRequests(personId: number): Promise<ServiceRequest[]> {
    const response = await churchtoolsClient.get<any>(
        `/persons/${personId}/servicerequests`
    );
    return (response?.data ?? response) ?? [];
}

/**
 * Anfrage annehmen.
 *
 * ⚠️ VERIFY-PUNKT: Der Pfad-Parameter heißt laut API-Doku „serviceId" –
 * gemeint ist vermutlich die ID der Einteilung (request.id, z. B. 104).
 * Bleibt der Request 404, diese eine Zeile auf request.serviceId umstellen
 * (dann needs der Aufrufstelle request.serviceId mitgegeben werden –
 * siehe Kommentar in Dashboard.ts bei bindRequestActions).
 */
export async function acceptServiceRequest(eventId: number, requestId: number): Promise<void> {
    await churchtoolsClient.post(`/events/${eventId}/servicerequests/${requestId}/accept`);
}

/** Anfrage ablehnen – gleicher VERIFY-PUNKT wie bei accept. */
export async function declineServiceRequest(eventId: number, requestId: number): Promise<void> {
    await churchtoolsClient.post(`/events/${eventId}/servicerequests/${requestId}/decline`);
}

/**
 * Nimmt die angegebene Anfrage zurück (Zusagen ODER Absagen).
 *
 * Pfad laut Swagger: /events/{eventId}/servicerequests/{requestId}/undo
 * Der Body ist Pflicht und muss die personId der betroffenen Person
 * enthalten (Vorbefund aus der 400er-Fehlermeldung: fieldId "personId").
 * comment ist optional (string|null, maxLength 255) – null = kein Kommentar.
 */
export async function undoServiceRequest(
    eventId: number,
    requestId: number,
    personId: number
): Promise<void> {
    await churchtoolsClient.post(
        `/events/${eventId}/servicerequests/${requestId}/undo`,
        { personId, comment: null }
    );
}