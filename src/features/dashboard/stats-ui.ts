import {
    STATS_WINDOWS,
    computeStats,
    type StatsMode,
    type StatsChart,
    type StatsPoint,
} from './statistics';
import { renderStatsChart } from './stats-chart';
import { esc } from './format';
import { dashboardState, handlers, statsRuntime } from './state';

// ── Spalte 3a: Eigene Statistik ──────────────────────────────────────

/**
 * Aggregiert über dashboardState.events (kein eigener API-Aufruf). Die drei
 * Button-Gruppen (Zeitraum/Kumulierung/Diagramm) laufen über EINEN
 * Delegation-Listener auf der Karte und rendern bei jedem Klick neu.
 */
export function renderStats(): void {
    const card = document.getElementById('dashboardStats');
    dashboardState.pinnedStatsIndex = null;
    if (!card) return;

    const win = STATS_WINDOWS.find(w => w.id === dashboardState.statsWindowId) ?? STATS_WINDOWS[1];
    const points = computeStats(
        dashboardState.ownEvents,
        dashboardState.personIdentifier,
        win,
        dashboardState.statsMode,
        dashboardState.serviceNames
    );
    dashboardState.statsPoints = points;

    const windowButtons = STATS_WINDOWS.map(w => `
        <button type="button" class="dr-quick${w.id === win.id ? ' active' : ''}"
                data-stats="window" data-value="${w.id}">${w.label}</button>
    `).join('');

    const modeButtons = ([
        { id: 'individual', label: 'Dienste' },
        { id: 'perEvent', label: 'Events' },
        { id: 'perDay', label: 'Tage' },
    ] as Array<{ id: StatsMode; label: string }>).map(m => `
        <button type="button" class="dr-quick${m.id === dashboardState.statsMode ? ' active' : ''}"
                data-stats="mode" data-value="${m.id}">${m.label}</button>
    `).join('');

    const chartButtons = ([
        { id: 'bars', label: 'Säulen' },
        { id: 'line', label: 'Linien' },
    ] as Array<{ id: StatsChart; label: string }>).map(c => `
        <button type="button" class="dr-quick${c.id === dashboardState.statsChart ? ' active' : ''}"
                data-stats="chart" data-value="${c.id}">${c.label}</button>
    `).join('');

    // Verfügbare Breite: Karten-Innenbreite (padding: spacing*5 = 20px pro Seite).
    // Im Neben-einander-Layout (Container-Query ab 800px Innenbreite) nimmt die
    // Buttons-Spalte 240px + 16px Gap weg – MUSS zur flex-basis in dashboard-stats.css
    // passen (dr-stats-controls) und zum @container-Schwellwert (50rem).
    const cardInner = Math.max(0, card.clientWidth - 40);
    const isRowLayout = cardInner >= 800;
    const controlsWidth = isRowLayout ? 240 + 16 : 0;
    const availableWidth = Math.max(0, cardInner - controlsWidth);

    card.innerHTML = `
        <h2>Meine Statistik</h2>
        <div class="dr-stats-body">
            <div class="dr-stats-controls">
                <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${windowButtons}</div>
                <div class="dr-quick-buttons" role="group" aria-label="Kumulierung">${modeButtons}</div>
                <div class="dr-quick-buttons" role="group" aria-label="Diagrammform">${chartButtons}</div>
            </div>
            ${renderStatsChart(points, dashboardState.statsChart, availableWidth)}
        </div>
    `;
}

/** EIN Delegation-Listener für alle drei Button-Gruppen der Statistik-Karte. */
export function bindStatsControls(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    handlers.stats = (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLElement>('button[data-stats]');
        if (!btn) return;

        const type = btn.dataset.stats;
        const value = btn.dataset.value ?? '';
        if (!type || !value) return;

        if (type === 'window') dashboardState.statsWindowId = value;
        else if (type === 'mode') dashboardState.statsMode = value as StatsMode;
        else if (type === 'chart') dashboardState.statsChart = value as StatsChart;

        renderStats();
    };

    card.addEventListener('click', handlers.stats);
}

// ── Hover-Tooltip + Klick-Fixierung ──────────────────────────────────

/**
 * Detail-Karten („welche Dienste wann") erscheinen beim Hover – und
 * bleiben nach KLICK auf eine Diagramm-Spalte stehen (wichtig für
 * Touch-Geräte, wo es kein Hover gibt). Ein Klick irgendwo anders
 * (auch auf einen Button der Karte oder außerhalb) löst die Fixierung.
 */
export function bindStatsTooltip(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    // Hover: zeigt das Tooltip – außer etwas ist fixiert (dann gewinnt der Pin)
    handlers.statsTip = (event: Event) => {
        if (dashboardState.pinnedStatsIndex !== null) return;

        const hit = (event.target as Element).closest<SVGRectElement>('[data-stats-index]');
        if (!hit) return;   // Hovern außerhalb der Spalten: nichts ändern

        const index = parseInt(hit.dataset.statsIndex ?? '', 10);
        const point = dashboardState.statsPoints[index];
        if (!point || point.entries.length === 0) {
            hideStatsTip();
            return;
        }

        showStatsTip(hit, point);
    };

    // Verlassen der Spalten versteckt nur, wenn NICHT fixiert
    handlers.statsTipLeave = () => {
        if (dashboardState.pinnedStatsIndex === null) hideStatsTip();
    };

    card.addEventListener('pointerover', handlers.statsTip);
    card.addEventListener('pointerleave', handlers.statsTipLeave);

    // Klick: auf eine Spalte → fixieren (bzw. auf eine andere umspringen);
    // irgendwo anders → lösen. document-Ebene, damit auch Klicks außerhalb
    // der Karte das fixierte Tooltip lösen.
    handlers.statsTipClick = (event: Event) => {
        const hit = (event.target as Element).closest<SVGRectElement>('[data-stats-index]');

        if (!hit) {
            unpinStats();
            return;
        }

        const index = parseInt(hit.dataset.statsIndex ?? '', 10);
        const point = dashboardState.statsPoints[index];
        if (!point || point.entries.length === 0) {
            unpinStats();
            return;
        }

        dashboardState.pinnedStatsIndex = index;
        showStatsTip(hit, point);
    };

    document.addEventListener('click', handlers.statsTipClick);
}

/** Fixierung lösen und Tooltip entfernen. */
function unpinStats(): void {
    dashboardState.pinnedStatsIndex = null;
    hideStatsTip();
}

/** Baut das Tooltip über der gehoverten Spalte. */
function showStatsTip(hit: SVGRectElement, point: StatsPoint): void {
    const wrap = document.querySelector<HTMLElement>('#dashboardStats .dr-stats-wrap');
    if (!wrap) return;

    hideStatsTip();

    const tip = document.createElement('div');
    tip.className = 'dr-stats-tip';
    // Fixierte Tooltips bekommen einen blauen Rand als Sichtfeedback
    tip.classList.toggle('dr-stats-tip--pinned', dashboardState.pinnedStatsIndex !== null);
    tip.innerHTML = `
        <div class="dr-stats-tip-head">${esc(point.label)}</div>
        ${point.entries.map(entry => `
            <div class="dr-stats-tip-row">
                <span class="dr-stats-tip-date">${esc(entry.dateLabel)}</span>
                ${esc(entry.serviceName)} · ${esc(entry.eventName)}
            </div>
        `).join('')}
    `;

    wrap.appendChild(tip);

    // Über der Trefferfläche positionieren – aber EINGEKLEMMT in die Karte:
    // Zentriert über der Spalte (translate(-50%)), soweit der Platz reicht.
    // Nahe den Kanten wird der Mittelpunkt des Tooltips zur Kartenmitte
    // zurückgeschoben, damit nichts über die Kante ragt.
    const hitRect = hit.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    tip.style.left = '0px';   // erst sichtbar machen, dann messen
    const tipWidth = tip.offsetWidth;
    const tipHalf = tipWidth / 2;

    const centered = hitRect.left - wrapRect.left + hitRect.width / 2;
    const clamped = Math.min(
        Math.max(centered, tipHalf + 8),                 // linke Kante + 8px Puffer
        wrapRect.width - tipHalf - 8                     // rechte Kante + 8px Puffer
    );

    tip.style.left = `${clamped}px`;
    tip.style.top = `${hitRect.top - wrapRect.top}px`;
}

function hideStatsTip(): void {
    document.querySelector('#dashboardStats .dr-stats-tip')?.remove();
}

// ── Resize-Handling ──────────────────────────────────────────────────

/**
 * Beobachtet die Breite der Statistik-Karte und rendert das Diagramm
 * bei ausreichender Änderung neu – damit es beim Fensterziehen (und beim
 * Grid-Umbruch der Responsive-Stufen) sofort mitwandert statt auf das
 * nächste zufällige Neu-Rendern zu warten.
 *
 * Schwelle (8px) ignoriert Rundungsrauschen; das rAF-Throttle begrenzt
 * das Neu-Rendern beim kontinuierlichen Ziehen auf einen Frame-Aufruf.
 * Die Karte selbst überlebt das Neu-Rendern (nur innerHTML wird getauscht),
 * deshalb muss der Observer nicht neu gebunden werden.
 */
export function bindStatsResize(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    statsRuntime.lastWidth = card.clientWidth;

    statsRuntime.observer = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width ?? 0;

        // Rundungsrauschen und Sub-Pixel-Schwankungen ignorieren
        if (Math.abs(width - statsRuntime.lastWidth) < 8) return;

        if (statsRuntime.rafId !== null) cancelAnimationFrame(statsRuntime.rafId);
        statsRuntime.rafId = requestAnimationFrame(() => {
            statsRuntime.rafId = null;
            statsRuntime.lastWidth = width;
            renderStats();
        });
    });

    statsRuntime.observer.observe(card);
}

/** Für destroy(): Observer und laufende rAF aufräumen. */
export function cleanupStats(): void {
    if (statsRuntime.observer) {
        statsRuntime.observer.disconnect();
        statsRuntime.observer = null;
    }

    if (statsRuntime.rafId !== null) {
        cancelAnimationFrame(statsRuntime.rafId);
        statsRuntime.rafId = null;
    }
}