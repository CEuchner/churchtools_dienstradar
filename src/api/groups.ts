import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Group, GroupMember } from '../utils/ct-types';
import { fetchAllPages } from './client';

/** Alle Gruppen der Instanz. */
export async function loadGroups(): Promise<Group[]> {
    return fetchAllPages<Group>('/groups');
}

/**
 * Mitglieder einer Gruppe inkl. der für die Anzeige benötigten Personenfelder.
 */
export async function loadGroupMembers(groupId: string): Promise<GroupMember[]> {
    return fetchAllPages<GroupMember>(
        `/groups/${groupId}/members`,
        'personFields[]=email&personFields[]=firstName&personFields[]=lastName'
    );
}

export interface AddPersonsResult {
    successCount: number;
    errorCount: number;
    permissionErrors: number;
    alreadyMembers: number;
    otherErrors: string[];
}

/**
 * Fügt mehrere Personen einer Zielgruppe hinzu und zählt die Ergebnisse.
 *
 * `only_add: true` verhindert, dass bestehende Mitgliedschaften verändert werden.
 * Bereits vorhandene Mitgliedschaften liefern laut ChurchTools einen 403 mit
 * sprechender Meldung – die wird separat gezählt statt als Fehler gemeldet.
 */
export async function addPersonsToGroup(
    targetGroupId: string,
    personIds: number[]
): Promise<AddPersonsResult> {
    let successCount = 0;
    let errorCount = 0;
    let permissionErrors = 0;
    let alreadyMembers = 0;
    const otherErrors: string[] = [];

    for (const personId of personIds) {
        try {
            await churchtoolsClient.put(`/groups/${targetGroupId}/members/${personId}`, {
                only_add: true,
            });
            successCount++;
        } catch (err: any) {
            errorCount++;

            if (err?.response?.status === 403) {
                if (err?.response?.data?.message === 'Person is already a member of the group') {
                    alreadyMembers++;
                } else {
                    permissionErrors++;
                }
            } else {
                const errorMsg = err?.response?.data?.message || err?.message || 'Unbekannter Fehler';
                if (!otherErrors.includes(errorMsg)) {
                    otherErrors.push(errorMsg);
                }
            }
            console.error(`Failed to add person ${personId}:`, err);
        }
    }

    return { successCount, errorCount, permissionErrors, alreadyMembers, otherErrors };
}