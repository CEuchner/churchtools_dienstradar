import type { Event } from '../../utils/ct-types';
import {
    eventStartDate,
    startOfDay,
    toLocalDateString,
    formatEventDateTime,
} from './format';
import type { ServiceMeta } from './data';

/**
 * Eigene Dienst-Statistik fürs Dashboard (Spalte 3a).
 *
 * Reine Aggregation über den bestehenden Event-Cache – kein eigener
 * API-Aufruf. Gezählt werden eigene ZUGESAGTE Einteilungen in der
 * VERGANGENHEIT (bis einschließlich heute, rückwärts bis zum
 * Zeitraum-Start).
 *
 * Zusätzlich zu den Counts sammelt computeStats pro Bucket die
 * EINZELNEN Einteilungen (StatsEntry) – die Grundlage für das
 * Hover-Tooltip am Diagramm („welche Dienste wann").
 *
 * Das Zeichnen des Diagramms liegt in stats-chart.ts.
 */

export type StatsMode = 'individual' | 'perEvent' | 'perDay';
export type StatsChart = 'bars' | 'line';

export interface StatsWindow {
    id: string;
    label: string;
    /** Lookback in Tagen. */
    days: number;
    /** Bucket-Größe: Wochen bis Quartal, Monate ab Halbjahr. */
    bucket: 'week' | 'month';
}

/** Zeitraum-Quick-Buttons. */
export const STATS_WINDOWS: StatsWindow[] = [
    { id: '4w', label: '4 W',     days: 28,  bucket: 'week' },
    { id: '8w', label: '8 W',     days: 56,  bucket: 'week' },
    { id: '12w', label: '12 W',   days: 84,  bucket: 'week' },
    { id: 'hj', label: '6 M',     days: 182, bucket: 'month' },
    { id: 'y',  label: '12 M',    days: 365, bucket: 'month' },
];

/** Eine einzelne geleistete Einteilung – für das Hover-Tooltip. */
export interface StatsEntry {
    /** Formatiertes Datum/Uhrzeit, z. B. „Fr, 23.10. · 01:00". */
    dateLabel: string;
    eventName: string;
    serviceName: string;
}

export interface StatsPoint {
    key: string;
    label: string;
    count: number;
    /** Die einzelnen Einteilungen hinter dem Count (für das Tooltip). */
    entries: StatsEntry[];
}

// ── Bucket-Helfer ────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
    const d = startOfDay(date);
    const day = (d.getDay() + 6) % 7;   // 0 = Montag
    d.setDate(d.getDate() - day);
    return d;
}

function isoWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function bucketKeyFor(date: Date, bucket: 'week' | 'month'): string {
    if (bucket === 'week') {
        return toLocalDateString(startOfWeek(date));
    }
    return `${date.getFullYear()}-${date.getMonth()}`;
}

/** Alle Buckets des Zeitraums (auch leere) – stabil für die X-Achse. */
function buildBuckets(win: StatsWindow, now: Date): Array<{ key: string; label: string }> {
    const buckets: Array<{ key: string; label: string }> = [];

    if (win.bucket === 'week') {
        const cursor = startOfWeek(now);
        cursor.setDate(cursor.getDate() - win.days);
        const first = startOfWeek(cursor);

        while (first.getTime() <= now.getTime()) {
            buckets.push({
                key: toLocalDateString(first),
                label: `KW ${isoWeekNumber(first)}`,
            });
            first.setDate(first.getDate() + 7);
        }
    } else {
        const start = startOfDay(now);
        start.setDate(start.getDate() - win.days);
        const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        for (let m = new Date(startMonth); m.getTime() <= currentMonth.getTime(); m.setMonth(m.getMonth() + 1)) {
            buckets.push({
                key: `${m.getFullYear()}-${m.getMonth()}`,
                label: m.toLocaleDateString('de-DE', { month: 'short' }),
            });
        }
    }

    return buckets;
}

// ── Aggregation ──────────────────────────────────────────────────────

export function computeStats(
    events: Event[],
    personIdentifier: string,
    win: StatsWindow,
    mode: StatsMode,
    serviceNames: Map<number, ServiceMeta>
): StatsPoint[] {
    const today = startOfDay(new Date());

    const cutoff = startOfDay(today);
    cutoff.setDate(cutoff.getDate() - win.days);

    // Bis einschließlich HEUTE zählen – ein heute Vormittag geleisteter
    // Dienst liegt nach Mitternacht und würde sonst stillschweigend fehlen
    const endOfToday = startOfDay(today);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const buckets = buildBuckets(win, today);
    const bucketKeys = new Set(buckets.map(b => b.key));

    const entriesByBucket = new Map<string, StatsEntry[]>();
    const eventSets = new Map<string, Set<number>>();
    const daySets = new Map<string, Set<string>>();

    for (const event of events) {
        if (event.isCanceled) continue;

        const start = eventStartDate(event);
        if (Number.isNaN(start.getTime())) continue;
        if (start.getTime() < cutoff.getTime()) continue;
        if (start.getTime() >= endOfToday.getTime()) continue;

        const own = (event.eventServices ?? []).filter(
            service => service.person?.domainIdentifier === personIdentifier
                && service.isAccepted === true
        );
        if (own.length === 0) continue;

        const key = bucketKeyFor(start, win.bucket);
        if (!bucketKeys.has(key)) continue;

        let list = entriesByBucket.get(key);
        if (!list) {
            list = [];
            entriesByBucket.set(key, list);
        }

        let eventSet = eventSets.get(key);
        if (!eventSet) {
            eventSet = new Set();
            eventSets.set(key, eventSet);
        }

        let daySet = daySets.get(key);
        if (!daySet) {
            daySet = new Set();
            daySets.set(key, daySet);
        }

        eventSet.add(event.id ?? -1);
        daySet.add(toLocalDateString(start));

        for (const service of own) {
            list.push({
                dateLabel: formatEventDateTime(event),
                eventName: event.name ?? 'Unbenanntes Event',
                serviceName: service.serviceId !== undefined
                    ? serviceNames.get(service.serviceId)?.name ?? 'Dienst'
                    : 'Dienst',
            });
        }
    }

    return buckets.map(b => {
        const entries = entriesByBucket.get(b.key) ?? [];

        let count = 0;
        if (mode === 'individual') count = entries.length;
        else if (mode === 'perEvent') count = eventSets.get(b.key)?.size ?? 0;
        else count = daySets.get(b.key)?.size ?? 0;

        return { key: b.key, label: b.label, count, entries };
    });
}