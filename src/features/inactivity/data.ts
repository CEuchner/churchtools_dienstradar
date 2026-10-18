import { loadUserPermissions } from '../../api/permissions';
import { loadGroups } from '../../api/groups';
import { loadServices, loadServiceGroups } from '../../api/services';
import { state } from './state';

/**
 * Lädt alle Stammdaten parallel.
 *
 * Bewusst `Promise.all` statt sequenziell: Die vier Abfragen hängen nicht
 * voneinander ab, das verkürzt den Seitenaufbau deutlich.
 */
export async function loadInactivityData(): Promise<void> {
    try {
        const [userPermissions, groups, serviceGroups, services] = await Promise.all([
            loadUserPermissions(),
            loadGroups(),
            loadServiceGroups(),
            loadServices(),
        ]);

        state.userPermissions = userPermissions;
        state.groups = groups;
        state.serviceGroups = serviceGroups;
        state.services = services;
    } catch (error) {
        throw new Error(
            error instanceof Error ? error.message : 'Fehler beim Laden der Daten'
        );
    }
}