import type { Service, ServiceGroup } from '../utils/ct-types';
import { fetchAllPages } from './client';

/** Alle Dienstgruppen (Kategorien) der Instanz. */
export async function loadServiceGroups(): Promise<ServiceGroup[]> {
    return fetchAllPages<ServiceGroup>('/servicegroups');
}

/**
 * Alle Dienste. Hinweis: Dieser Endpunkt unterstützt keine Paginierung –
 * deshalb `supportsPagination: false`, sonst würde die Schleife ins Leere laufen.
 */
export async function loadServices(): Promise<Service[]> {
    return fetchAllPages<Service>('/services', '', { supportsPagination: false });
}