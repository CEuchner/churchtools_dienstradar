import type { Service } from './ct-types';
import type { UserPermissions } from '../api/permissions';

/**
 * Geteilte Sichtbarkeitslogik für Dienste/Dienstgruppen.
 *
 * Die Auswertung läuft bewusst auf Ebene der DIENTSGRUPPE:
 * Wer eine Dienstgruppe sehen darf, sieht alle ihre Dienste.
 * Die Prüfungen sind additiv (ODER).
 *
 * Der Gruppen-Index wird per WeakMap auf die Service-Liste gecacht –
 * bleibt die Array-Referenz stabil (State/Cache), wird er nur einmal
 * gebaut. Bei neuen Daten einfach eine neue Array-Referenz übergeben.
 */

interface ServiceGroupMeta {
    groupIds: Set<number>;
    hasUnrestricted: boolean;
}

const indexCache = new WeakMap<Service[], Map<number, ServiceGroupMeta>>();

function getIndex(services: Service[]): Map<number, ServiceGroupMeta> {
    const cached = indexCache.get(services);
    if (cached) return cached;

    const index = new Map<number, ServiceGroupMeta>();

    services.forEach(service => {
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

    indexCache.set(services, index);
    return index;
}

/**
 * Allgemeine Sichtbarkeit einer Dienstgruppe (u. a. Inaktivitäts-Seite):
 * `edit servicegroup` (global) ODER `+entry all` in einer zugeordneten Gruppe.
 * Dienste ganz ohne Gruppenzuordnung gelten als offen sichtbar.
 */
export function isServiceGroupVisible(
    serviceGroupId: number,
    services: Service[],
    perms: UserPermissions
): boolean {
    // Globales Recht `edit servicegroup`: bearbeiten erlaubt sehen und nutzen
    if (perms.globalEditServiceGroupIds.includes(serviceGroupId)) return true;

    const viewGroups = perms.groupServiceGroupIds;
    if (!viewGroups || viewGroups.size === 0) return false;

    const meta = getIndex(services).get(serviceGroupId);
    if (!meta) return false;

    if (meta.hasUnrestricted) return true;

    for (const groupId of meta.groupIds) {
        if (viewGroups.has(groupId)) return true;
    }

    return false;
}

/**
 * Sichtbarkeit von OFFENEN (unbesetzten) Diensten.
 *
 * Bewusst OHNE globale Rechte: Nur die gruppeninternen Rechte
 * (`+entry all` ODER `+entry free`) geben die Lücken-Liste frei.
 * Das globale `edit servicegroup` reicht hier NICHT – es berechtigt
 * zur allgemeinen Sichtbarkeit (Inaktivität), nicht zum Belegen
 * offener Dienste.
 */
export function isServiceGroupOpenEntryVisible(
    serviceGroupId: number,
    services: Service[],
    perms: UserPermissions
): boolean {
    const meta = getIndex(services).get(serviceGroupId);
    if (!meta) return false;

    // Dienste ganz ohne Gruppenzuordnung: Es gibt keine Gruppe, der man
    // ein gruppeninternes Recht geben könnte – sie gelten als offen sichtbar.
    if (meta.hasUnrestricted) return true;

    for (const groupId of meta.groupIds) {
        if (perms.groupServiceGroupIds.has(groupId)) return true;   // +entry all
        if (perms.groupSelfEntryGroupIds.has(groupId)) return true; // +entry free
    }

    return false;
}

/** Sichtbarkeit eines einzelnen Dienstes. Delegiert an die Dienstgruppe. */
export function isServiceVisible(
    service: Service,
    services: Service[],
    perms: UserPermissions
): boolean {
    if (service.serviceGroupId) {
        return isServiceGroupVisible(service.serviceGroupId, services, perms);
    }

    // Dienste ohne Dienstgruppe sind ein ungültiger Datenzustand
    return false;
}