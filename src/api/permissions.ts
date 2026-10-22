import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Group } from '../utils/ct-types';
import { fetchAllPages } from './client';

export interface UserPermissions {
    userGroupIds: number[];
    globalServiceGroupIds: number[];
    /** Dienstgruppen, die der Nutzer global bearbeiten darf (`edit servicegroup`). */
    globalEditServiceGroupIds: number[];
    /** Gruppen, in denen der Nutzer `+entry all` besitzt. */
    groupServiceGroupIds: Set<number>;
    /** Gruppen, in denen der Nutzer `+entry free` besitzt (Selbsteintragung). */
    groupSelfEntryGroupIds: Set<number>;
}

/**
 * Ermittelt die für die Dienst-Sichtbarkeit relevanten Rechte des Nutzers.
 * Sichtbarkeit wird auf Ebene der Dienstgruppe (ServiceGroup) ausgewertet.
 */
export async function loadUserPermissions(): Promise<UserPermissions> {
    try {
        // Gruppen, in denen der Nutzer Mitglied ist
        const userGroups = await fetchAllPages<Group>('/groups', 'only_my_groups=true');
        const userGroupIds = userGroups.map(g => g.id);

        // Globale Rechte
        const globalPermsResponse = await churchtoolsClient.get<any>('/permissions/global');
        const globalPerms = globalPermsResponse.data || globalPermsResponse;
        const viewServiceGroupPerms = globalPerms?.churchservice?.['view servicegroup'] || [];
        const globalServiceGroupIds = Array.isArray(viewServiceGroupPerms) ? viewServiceGroupPerms : [];
        const editServiceGroupPerms = globalPerms?.churchservice?.['edit servicegroup'] || [];
        const globalEditServiceGroupIds = Array.isArray(editServiceGroupPerms)
            ? editServiceGroupPerms
            : [];

        // Gruppeninterne Rechte
        const internalPermsResponse = await churchtoolsClient.get<any>('/permissions/internal/groups');
        const internalPerms = internalPermsResponse.data || internalPermsResponse;
        const groupServiceGroupIds = new Set<number>();
        const groupSelfEntryGroupIds = new Set<number>();

        for (const groupId of userGroupIds) {
            const perms = internalPerms?.[groupId]?.churchservice || {};

            // ── Rechteprüfungen – Historie, bewusst als Kommentar erhalten ──
            // Ursprünglich (Karteileichen v1.0.3): nur `+view service`
            // if (perms['+view service'] === true) {
            //     groupServiceGroupIds.add(groupId);
            // }
            //
            // Weitere denkbare Varianten:
            // if (perms['+edit service'] === true) { ... }

            if (perms['+entry all'] === true) {
                groupServiceGroupIds.add(groupId);
            }

            // Selbsteintragung (offene Dienste belegen dürfen)
            if (perms['+entry free'] === true) {
                groupSelfEntryGroupIds.add(groupId);
            }
        }

        return {
            userGroupIds,
            globalServiceGroupIds,
            globalEditServiceGroupIds,
            groupServiceGroupIds,
            groupSelfEntryGroupIds,
        };
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Fehler beim Laden der Berechtigungen');
    }
}