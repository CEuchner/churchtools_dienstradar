import type { Person } from '../../utils/ct-types';
import { loadGroupMembers } from '../../api/groups';
import { loadEventsWithServices } from '../../api/events';
import type { InactivePersonData } from './state';

/** Platzhaltertext, wenn zu einer Person keine E-Mail hinterlegt ist. */
export const NO_EMAIL_PLACEHOLDER = 'Keine E-Mail hinterlegt';

/**
 * Findet Gruppenmitglieder, die im Zeitraum KEINEN der ausgewählten Dienste
 * wahrgenommen haben.
 *
 * Vorgehen:
 *  1. Gruppenmitglieder laden
 *  2. Termine im Zeitraum inkl. Diensteinteilungen laden
 *  3. Zuordnung Person → Menge der geleisteten Dienste aufbauen
 *  4. Mitglieder herausfiltern, die in dieser Zuordnung fehlen
 *
 * Zuordnung über `domainIdentifier`, weil die Termin-Daten die Person nicht
 * über die lokale ID referenzieren.
 */
export async function searchInactiveMembers(
    groupId: string,
    selectedServiceIds: number[],
    fromDate: string,
    toDate: string
): Promise<InactivePersonData[]> {
    try {
        const members = await loadGroupMembers(groupId);

        if (members.length === 0) {
            throw new Error('Keine Mitglieder in dieser Gruppe gefunden');
        }

        const events = await loadEventsWithServices(fromDate, toDate);

        const personServiceMap = new Map<string, Set<number>>();

        events.forEach(event => {
            event.eventServices?.forEach(eventService => {
                const personIdentifier = eventService.person?.domainIdentifier;
                const serviceId = eventService.serviceId;

                if (personIdentifier && serviceId && selectedServiceIds.includes(serviceId)) {
                    if (!personServiceMap.has(personIdentifier)) {
                        personServiceMap.set(personIdentifier, new Set());
                    }
                    personServiceMap.get(personIdentifier)!.add(serviceId);
                }
            });
        });

        const inactiveMembers = members.filter(member => {
            const personIdentifier = member.person?.domainIdentifier;
            if (!personIdentifier) return false;

            const servicesForPerson = personServiceMap.get(personIdentifier);
            return !servicesForPerson || servicesForPerson.size === 0;
        });

        return inactiveMembers.map(member => {
            const personFields = member.personFields as any;
            const email = personFields?.email || NO_EMAIL_PLACEHOLDER;

            return {
                person: {
                    id: member.personId,
                    firstName: member.person.domainAttributes.firstName,
                    lastName: member.person.domainAttributes.lastName,
                    guid: member.person.domainAttributes.guid,
                    email,
                } as Person,
                selected: false,
            };
        });
    } catch (error) {
        throw new Error(
            error instanceof Error ? error.message : 'Fehler bei der Suche'
        );
    }
}