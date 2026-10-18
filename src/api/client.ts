import { churchtoolsClient } from '@churchtools/churchtools-client';

/** Standard-Seitengröße für paginierte Endpunkte. */
export const DEFAULT_LIMIT = 200;

/** Sicherheitsnetz gegen Endlos-Paginierung bei fehlerhaften Metadaten. */
export const MAX_PAGES = 100;

interface FetchAllPagesOptions {
    /** Endpunkt unterstützt keine Paginierung (z. B. /services). */
    supportsPagination?: boolean;
    /** Seitengröße, falls der Endpunkt ein eigenes Maximum hat (z. B. /events = 100). */
    limit?: number;
}

/**
 * Lädt alle Seiten eines ChurchTools-Endpunkts und führt sie zu einem Array zusammen.
 *
 * Drei Abbruchbedingungen, damit die Schleife garantiert endet:
 *  1. Metadaten vorhanden → bis `lastPage` durchlaufen.
 *  2. Keine Metadaten → über die Seitensignatur (Länge + erste/letzte ID)
 *     erkennen, dass dieselbe Seite erneut geliefert wurde.
 *  3. Keine Metadaten → abbrechen, sobald eine Seite nicht mehr voll ist.
 */
export async function fetchAllPages<T>(
    path: string,
    query: string = '',
    options: FetchAllPagesOptions = {}
): Promise<T[]> {
    const results: T[] = [];
    const supportsPagination = options.supportsPagination ?? true;
    const limit = options.limit ?? DEFAULT_LIMIT;
    let page = 1;
    let lastSignature = '';

    while (true) {
        if (!supportsPagination) {
            const url = query ? `${path}?${query}` : path;
            const response = await churchtoolsClient.get<any>(url);
            const data = Array.isArray(response) ? response : response?.data ?? [];
            return data;
        }

        if (page > MAX_PAGES) {
            throw new Error(`Pagination abort for ${path}: exceeded ${MAX_PAGES} pages`);
        }

        const joiner = query ? '&' : '';
        const url = `${path}?limit=${limit}&page=${page}${joiner}${query}`;
        const response = await churchtoolsClient.get<any>(url);

        const data = Array.isArray(response) ? response : response?.data ?? [];
        results.push(...data);

        const meta = !Array.isArray(response) ? response?.meta?.pagination : undefined;
        if (meta && page >= meta.lastPage) {
            break;
        }

        if (!meta && data.length === 0) {
            break;
        }

        if (!meta) {
            const firstId = (data[0] as any)?.id ?? '';
            const lastId = (data[data.length - 1] as any)?.id ?? '';
            const signature = `${data.length}:${firstId}:${lastId}`;
            if (signature === lastSignature) {
                break;
            }
            lastSignature = signature;
        }

        if (!meta && data.length < limit) {
            break;
        }

        page += 1;
    }

    return results;
}