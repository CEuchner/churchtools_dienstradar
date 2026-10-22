import { churchtoolsClient } from '@churchtools/churchtools-client';

export interface PollResult {
    /** Es gibt Änderungen seit dem letzten Poll → nachladen lohnt sich. */
    hasChanges: boolean;
    /** Neuer „since"-Zeitpunkt für den nächsten Poll (aus meta.lastPollDate). */
    lastPollDate: string;
}

/**
 * Fragt nach Änderungen seit dem letzten Poll.
 *
 * Dokumentiert laut Swagger: „This endpoint returns the identifiers of
 * changed entities since the last call." Die Antwort ist im Leerlauf
 * winzig ({data: [], count: 0}) – deshalb ist dieses Poll-Muster deutlich
 * günstiger als ein Blind-Reload der Daten-Endpunkte.
 *
 * Format laut Live-Befund: domain_types[] mit kommagetrennten Werten,
 * since als ISO-Zeitstempel.
 */
export async function pollForNews(domainTypes: string[], since: string): Promise<PollResult> {
    const types = `domain_types[]=${encodeURIComponent(domainTypes.join(','))}`;
    const response = await churchtoolsClient.get<any>(
        `/pollfornews?${types}&since=${encodeURIComponent(since)}`
    );

    const data = response?.data ?? response ?? [];
    const meta = response?.meta ?? {};

    return {
        hasChanges: (Array.isArray(data) ? data.length : (meta.count ?? 0)) > 0,
        lastPollDate: meta.lastPollDate ?? new Date().toISOString(),
    };
}