import { churchtoolsClient } from '@churchtools/churchtools-client';

/**
 * Kirchen-Name der Instanz. Wird einmalig beim Start geladen und
 * gecacht – sie ändert sich während einer Session nicht.
 */
let cachedChurchName: string | null = null;

export async function getChurchName(): Promise<string | null> {
    if (cachedChurchName !== null) return cachedChurchName;

    try {
        const response = await churchtoolsClient.get<any>('/info');
        const info = response?.data ?? response;
        cachedChurchName = info?.siteName ?? null;
    } catch {
        // Kein Belastungsfall: ohne Namen heißt der Tab einfach nur "DienstRadar"
        cachedChurchName = null;
    }

    return cachedChurchName;
}

export function getCachedChurchName(): string | null {
    return cachedChurchName;
}