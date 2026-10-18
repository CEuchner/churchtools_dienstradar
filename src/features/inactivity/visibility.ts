import type { Service } from '../../utils/ct-types';
import { state } from './state';

interface ServiceGroupMeta {
    groupIds: Set<number>;
    hasUnrestricted: boolean;
}

/** Zwischenspeicher für die Auswertung Dienstgruppe → Gruppen. */
let serviceGroupIndex: Map<number, ServiceGroupMeta> | null = null;

/** Muss bei neuen Dienstdaten aufgerufen werden (z. B. in init()). */
export function resetServiceGroupIndex(): void {
    serviceGroupIndex = null;
}

/**
 * Aggregiert pro Dienstgruppe alle Gruppen, denen ihre Dienste zugeordnet sind,
 * plus ein Flag für Dienste ganz ohne Gruppenzuordnung.
 * Vermeidet, dass für jede Prüfung über alle Dienste gelaufen wird.
 */
function buildServiceGroupIndex(): Map<number, ServiceGroupMeta> {
    if (serviceGroupIndex) return serviceGroupIndex;

    const index = new Map<number, ServiceGroupMeta>();

    state.services.forEach(service => {
        const serviceGroupId = service.serviceGroupId as number | undefined;
        if (serviceGroupId === undefined || serviceGroupId === null) return;

        let entry = index.get(serviceGroupId);
        if (!entry) {
            entry = { groupIds: new Set<number>(), hasUnrestricted: false };
            index.set(serviceGroupId, entry);
        }

        const groupIds = service.groupIds || [];
        if (groupIds.length === 0) {
            entry.hasUnrestricted = true;
        } else {
            groupIds.forEach(groupId => entry!.groupIds.add(groupId));
        }
    });

    serviceGroupIndex = index;
    return index;
}

/**
 * Sichtbarkeit einer Dienstgruppe.
 *
 * Aktiv ist ausschließlich Prüfung 3: Der Nutzer muss in mindestens einer
 * Gruppe `+entry all` besitzen, die einem Dienst dieser Dienstgruppe
 * zugeordnet ist. Die Sichtbarkeit wird bewusst auf Ebene der Dienstgruppe
 * ausgewertet – wer sie sehen darf, sieht alle ihre Dienste.
 */
export function isServiceGroupVisible(serviceGroupId: number): boolean {
    const perms = state.userPermissions;
    if (!perms) return true; // Rechte noch nicht geladen → nichts ausblenden

    // ── Auskommentierte Rechteprüfungen – bewusst erhalten ────────────────
    //
    // 1. Öffentliche Dienstgruppe
    // const serviceGroup = state.serviceGroups.find(sg => sg.id === serviceGroupId);
    // if (serviceGroup?.viewAll) return true;
    //
    // 2. Globales Recht `view servicegroup`
    // if (perms.globalServiceGroupIds.includes(serviceGroupId)) return true;

    // 2a. Globales Recht `edit servicegroup`:
    //     Wer eine Dienstgruppe bearbeiten darf, darf sie sehen und nutzen.
    if (perms.globalEditServiceGroupIds.includes(serviceGroupId)) return true;

    // 3. Gruppeninternes Recht: mindestens eine eigene Gruppe mit `+entry all`
    const viewGroups = perms.groupServiceGroupIds;
    if (!viewGroups || viewGroups.size === 0) return false;

    const meta = buildServiceGroupIndex().get(serviceGroupId);
    if (!meta) return false;

    if (meta.hasUnrestricted) return true;

    for (const groupId of meta.groupIds) {
        if (viewGroups.has(groupId)) return true;
    }

    return false;
}

/**
 * Sichtbarkeit eines einzelnen Dienstes. Delegiert an die Dienstgruppe.
 * Dienste ohne Dienstgruppe sind ein ungültiger Datenzustand und werden
 * ausgeblendet.
 */
export function isServiceVisible(service: Service): boolean {
    const perms = state.userPermissions;
    if (!perms) return true;

    if (service.serviceGroupId) {
        return isServiceGroupVisible(service.serviceGroupId);
    }

    return false;
}