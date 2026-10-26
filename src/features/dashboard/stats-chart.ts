import type { StatsPoint, StatsChart } from './statistics';

// ── Diagramm-Konstanten ──────────────────────────────────────────────

/** Normale Diagrammhöhe – wird NUR bei Breitenmangel reduziert. */
const CHART_HEIGHT = 160;

/** Angenehme feste Balkenbreite, solange der Platz reicht. */
const MAX_BAR_WIDTH = 24;

/** Unter diese Balkenbreite wird nur bei echtem Platzmangel gegangen –
 *  und ab hier reduziert sich auch die Höhe mit. */
const MIN_BAR_WIDTH = 12;

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
 *    ResizeObserver (bindStatsResize in stats-ui.ts) neu.
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