import type { Event } from '../../utils/ct-types';
import {
    eventStartDate,
    startOfDay,
    toLocalDateString,
    formatEventDateTime,
    type ServiceMeta,
} from './data';

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

// ── Diagramm-Konstanten ──────────────────────────────────────────────

/** Normale Diagrammhöhe – wird NUR bei Breitenmangel reduziert. */
const CHART_HEIGHT = 160;

/** Angenehme feste Balkenbreite, solange der Platz reicht. */
const MAX_BAR_WIDTH = 24;

/** Unter diese Balkenbreite wird nur bei echtem Platzmangel gegangen –
 *  und ab hier reduziert sich auch die Höhe mit. */
const MIN_BAR_WIDTH = 12;

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

// ── SVG-Diagramm ─────────────────────────────────────────────────────

function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Größten „schönen" Achsenwert finden (1/2/5 × Zehnerpotenz ≥ max).
 * Beispiele: max 7 → 10, max 23 → 50, max 3 → 3 (kleine Werte bleiben roh).
 */
function niceMax(maxValue: number): number {
    if (maxValue <= 4) return Math.max(2, maxValue);
    const pow = 10 ** Math.floor(Math.log10(maxValue));
    for (const m of [1, 2, 5, 10]) {
        if (m * pow >= maxValue) return m * pow;
    }
    return 10 * pow;
}

/**
 * Handgebautes SVG in ECHTEN PIXELN – kein viewBox-Skalieren.
 *
 * Deshalb funktioniert das Responsiv-Verhalten:
 *  - Das SVG bekommt exakt die gemessene Kartenbreite als width/height/viewBox.
 *    Es wird NIE vom Browser skaliert – bei Breitenänderung rechnet der
 *    ResizeObserver (bindStatsResize in Dashboard.ts) neu.
 *  - Balken: feste angenehme Breite (MAX_BAR_WIDTH), solange der Platz reicht;
 *    davor rücken sie nur enger zusammen (step ≥ barWidth = kein Überlappen).
 *    Erst bei Platzmangel unter MIN_BAR_WIDTH schrumpfen sie weiter –
 *    und NUR dann reduziert sich auch die Höhe.
 *  - Schrift: immer in Token-Größe (skaliert nicht mit, weil 1:1 gerendert).
 *  - X-Beschriftungen: alle anzeigen, wenn der Platz reicht; sonst jede
 *    zweite/dritte.
 *  - Y-Achse: Tick-Labels (0 / Mitte / Max auf schönen Zahlen) plus feine
 *    horizontale Gitterlinien – die Anzahl ist auf einen Blick ablesbar.
 *
 * `availableWidth` = gemessene Innenbreite der Karte in Pixeln. Ohne Angabe
 * (z. B. erste Renderung vor der Messung) wird eine Mindestbreite angenommen.
 */
export function renderStatsChart(
    points: StatsPoint[],
    chart: StatsChart,
    availableWidth?: number
): string {
    if (points.length === 0) {
        return `<p class="dr-empty">Keine Daten im Zeitraum.</p>`;
    }

    const n = points.length;

    // ── Layout-Maße ──────────────────────────────────────────────────────
    const padLeft = 30;    // Platz für die Y-Tick-Labels
    const padRight = 8;
    const padTop = 18;     // Platz für die Wert-Labels über den Balken
    const padBottom = 18;  // Platz für die X-Beschriftungen

    const avail = Math.max(padLeft + padRight + n * MIN_BAR_WIDTH, availableWidth ?? 0);
    const plotWidth = avail - padLeft - padRight;

    // Spalten über die volle Breite verteilen; Balkenbreite = fix, bis der
    // Platz nicht mehr reicht (nie breiter als die Spalte → kein Überlappen)
    const step = plotWidth / n;
    const barWidth = Math.max(4, Math.min(MAX_BAR_WIDTH, step * 0.7));

    // Höhe: fest – erst reduzieren, wenn die Balkenbreite unter die
    // Mindestbreite gedrückt wurde (echter Breitenmangel)
    const heightFactor = barWidth >= MIN_BAR_WIDTH
        ? 1
        : Math.max(0.6, barWidth / MIN_BAR_WIDTH);
    const height = Math.round(CHART_HEIGHT * heightFactor);

    const innerHeight = height - padTop - padBottom;

    // ── Y-Achse: schöne Skala + Ticks ────────────────────────────────────
    const max = Math.max(1, ...points.map(p => p.count));
    const yMax = niceMax(max);
    const ticks: number[] = yMax <= 4
        ? Array.from({ length: yMax + 1 }, (_, i) => i)   // kleine Werte: jede Zahl
        : [0, yMax / 2, yMax];

    const yScale = (count: number) =>
        padTop + innerHeight - (count / yMax) * innerHeight;
    const xCenter = (i: number) => padLeft + step * (i + 0.5);

    // ── Gitterlinien + Y-Tick-Labels ─────────────────────────────────────
    const grid = ticks.map(t => `
        <line x1="${padLeft}" y1="${yScale(t)}" x2="${avail - padRight}" y2="${yScale(t)}"
              class="dr-stats-grid${t === 0 ? ' dr-stats-grid--axis' : ''}" />
        <text x="${padLeft - 5}" y="${yScale(t) + 3}" text-anchor="end"
              class="dr-stats-ylabel">${t}</text>
    `).join('');

    // ── Balken oder Linie ────────────────────────────────────────────────
    let content = '';

    if (chart === 'bars') {
        content = points.map((p, i) => {
            if (p.count === 0) return '';
            const barHeight = Math.max(2, (p.count / yMax) * innerHeight);
            return `
                <rect x="${xCenter(i) - barWidth / 2}" y="${yScale(p.count)}"
                      width="${barWidth}" height="${barHeight}" rx="2" class="dr-stats-bar" />
                <text x="${xCenter(i)}" y="${yScale(p.count) - 4}" text-anchor="middle"
                      class="dr-stats-value">${p.count}</text>
            `;
        }).join('');
    } else {
        const coords = points.map((p, i) => `${xCenter(i)},${yScale(p.count)}`).join(' ');
        const dots = points
            .map((p, i) =>
                `<circle cx="${xCenter(i)}" cy="${yScale(p.count)}" r="3" class="dr-stats-dot" />`)
            .join('');
        content = `<polyline points="${coords}" class="dr-stats-line" />${dots}`;
    }

    // X-Beschriftungen: ausdünnen, BEVOR sie kollidieren.
    // Schwellen auf KW-Labels (~40px) abgestimmt: Bei step < 56 jede zweite,
    // bei step < 32 jede dritte, sonst alle.
    const labelEvery = step >= 56 ? 1 : step >= 32 ? 2 : 3;
    const labels = points.map((p, i) =>
        i % labelEvery === 0
            ? `<text x="${xCenter(i)}" y="${height - 4}" text-anchor="middle"
                   class="dr-stats-xlabel">${esc(p.label)}</text>`
            : ''
    ).join('');

    // ── Unsichtbare Trefferflächen (Hover-Tooltip) – bewusst ZULETZT, damit
    //    sie als oberste Elemente die Pointer-Events fangen ──────────────
    const hitAreas = points.map((_p, i) =>
        `<rect x="${padLeft + step * i}" y="0" width="${step}" height="${height}"
               fill="transparent" data-stats-index="${i}" />`
    ).join('');

    // 1:1-Pixel-Rendering: width = height = viewBox = gemessene Pixel
    return `
        <div class="dr-stats-wrap">
            <svg width="${avail}" height="${height}" viewBox="0 0 ${avail} ${height}"
                 class="dr-stats-svg" role="img" aria-label="Eigene Dienste im Zeitraum">
                ${grid}
                ${content}
                ${labels}
                ${hitAreas}
            </svg>
        </div>
    `;
}