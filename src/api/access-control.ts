import { churchtoolsClient } from '@churchtools/churchtools-client';
import {
    getModule,
    getOrCreateModule,
    getCustomDataCategories,
    createCustomDataCategory,
} from '../utils/kv-store';

const EXTENSION_KEY = import.meta.env.VITE_KEY;

/**
 * Route → KV-Kategorie, deren "sehen"-Recht die Seite freigibt.
 * Die Kategorien sind leere Shells, deren einziger Zweck ist, in der
 * CT-Rechteverwaltung unter "Kategorien sehen (view custom category)"
 * berechtigbar zu sein. Das Seitenrecht vergibt ChurchTools – hier
 * wird nur gelesen.
 *
 * Anlage neuer Kategorien nur mit `administer custom modules`
 * (dieselbe Personengruppe, die Module installieren darf) – sonst
 * könnten sich Nutzer über die rechtegefilterte Kategorie-Liste
 * Duplikate anlegen und so das Rechte-Modell aushebeln.
 */
const PAGE_CATEGORIES: Record<string, { shorty: string; name: string }> = {
    '/inactivity': { shorty: 'inactivity', name: 'Inaktivität' },
    '/statistics': { shorty: 'statistics', name: 'Statistiken' },
    '/settings':   { shorty: 'settings',   name: 'Einstellungen' },
};

interface AccessState {
    hasModuleView: boolean;
    /** Kategorie-IDs, die der Nutzer in der Rechteverwaltung sehen darf. */
    viewCustomCategoryIds: number[];
    /** Kategorie-Shorty → Kategorie-ID (Zuordnung Route → Recht). */
    categoryIds: Map<string, number>;
}

let access: AccessState | null = null;

/**
 * Hat der aktuelle Nutzer das Recht, Custom Modules zu verwalten?
 * Pfad laut API: data → churchcore → 'administer custom modules' (boolean).
 */
function canAdministerCustomModules(globalPerms: any): boolean {
    return globalPerms?.churchcore?.['administer custom modules'] === true;
}

/**
 * Muss EINMAL beim Start laufen (main.ts, vor initRouter()), damit
 * Router und Menü mit geladenen Rechten arbeiten.
 */
export async function initAccessControl(): Promise<void> {
    let hasModuleView = false;
    let viewCustomCategoryIds: number[] = [];
    const categoryIds = new Map<string, number>();
    let globalPerms: any = {};

    // ── 1. Rechte laden – der Kern ──────────────────────────────────────
    try {
        const response = await churchtoolsClient.get<any>('/permissions/global');
        globalPerms = (response?.data ?? response) ?? {};

        const perms = globalPerms?.dienstradar ?? {};
        hasModuleView = perms.view === true;
        viewCustomCategoryIds = Array.isArray(perms['view custom category'])
            ? perms['view custom category']
            : [];
    } catch (error) {
        console.error('[access-control] Rechte konnten nicht geladen werden:', error);
    }

    // ── 2. Kategorien lesen – und NUR mit Admin-Recht ergänzen ──────────
    try {
        const isAdmin = canAdministerCustomModules(globalPerms);

        const module = isAdmin
            ? await getOrCreateModule(EXTENSION_KEY, 'DienstRadar', 'Dienstplanung und Statistiken')
            : await getModule(EXTENSION_KEY);

        const categories = await getCustomDataCategories(module.id);

        for (const { shorty, name } of Object.values(PAGE_CATEGORIES)) {
            const existing = categories.find(c => c.shorty === shorty);
            if (existing) {
                categoryIds.set(shorty, existing.id);
                continue;
            }

            if (!isAdmin) {
                // Kein Admin → bewusst NICHT anlegen (siehe Header-Kommentar).
                // "Fehlt" heißt hier meist nur: für diesen Nutzer nicht sichtbar.
                console.warn(
                    `[access-control] Kategorie "${name}" nicht sichtbar. Seite bleibt gesperrt.`
                );
                continue;
            }

            // Admin: fehlende Kategorien beim Start nachlegen (Installationsfall)
            try {
                const created = await createCustomDataCategory(
                    {
                        customModuleId: module.id,
                        name,
                        shorty,
                        description: `Zugriffsrechte für die Seite ${name}`,
                        data: JSON.stringify({}),
                    },
                    module.id
                );
                categoryIds.set(shorty, created.id);
            } catch (error) {
                console.warn(
                    `[access-control] Kategorie "${name}" konnte nicht angelegt werden:`, error
                );
            }
        }
    } catch (error) {
        console.warn('[access-control] Kategorien konnten nicht geprüft werden:', error);
    }

    access = { hasModuleView, viewCustomCategoryIds, categoryIds };
}

/**
 * Darf der aktuelle Nutzer die Route sehen?
 *
 * - Dashboard (`/`): nur das Modul-Recht `view` nötig.
 * - Kategorisierte Seiten: `view` UND die Kategorie in `view custom category`.
 * - Kein/fehlgeschlagener Ladelauf → fail-closed: kategorisierte Seiten zu,
 *   Dashboard offen (wer das Modul öffnet, hat `view` ohnehin).
 */
export function canAccessPage(route: string): boolean {
    if (!access) {
        return route === '/' || route === '';
    }
    if (!access.hasModuleView) return false;
    if (route === '/' || route === '') return true;

    const category = PAGE_CATEGORIES[route];
    if (!category) return true; // Route ohne Kategorie = offen (z. B. /profile)

    const categoryId = access.categoryIds.get(category.shorty);
    if (categoryId === undefined) return false;

    return access.viewCustomCategoryIds.includes(categoryId);
}