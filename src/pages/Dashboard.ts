import { showStatus, showActionToast, hideStatus } from '../components/toast';
import { loadUserPermissions } from '../api/permissions';
import { pollForNews } from '../api/pollfornews';
import { canAccessPage } from '../api/access-control';
import { routeHref } from '../utils/base';
import { icon } from '../components/icons';
import {
    acceptServiceRequest,
    declineServiceRequest,
    undoServiceRequest,
    loadServiceRequests,
    type ServiceRequest,
} from '../api/servicerequests';
import {
    loadDashboardEvents,
    resetDashboardEvents,
    getPersonId,
    getServiceMetaMap,
    getServices,
    getUpcomingOwnEvents,
    getOpenServices,
    formatEventDateTime,
    formatEventDateLong,
    formatDayOfMonth,
    formatMonthShort,
    formatCountdown,
    eventStartDate,
    buildEventUrl,
    type ServiceMeta,
    type OwnEventEntry,
    type OpenServiceEntry,
} from '../features/dashboard/data';
import {
    STATS_WINDOWS,
    computeStats,
    renderStatsChart,
    type StatsMode,
    type StatsChart,
    type StatsPoint,
} from '../features/dashboard/statistics';
import type { Event as CtEvent, Service } from '../utils/ct-types';

export const title = 'Dashboard';

/** HTML-Escaping für Namen aus der Datenbank (Service-/Eventnamen). */
function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Holt den Dienstnamen aus der Meta-Map (einzige Quelle für alle Karten). */
function serviceNameOf(
    serviceNames: Map<number, ServiceMeta>,
    serviceId: number | undefined
): string {
    return serviceId !== undefined
        ? serviceNames.get(serviceId)?.name ?? 'Dienst'
        : 'Dienst';
}

/** Zugesagte Dienste eines Events als Pill-Badges (Hero). */
function servicePills(
    entry: OwnEventEntry,
    serviceNames: Map<number, ServiceMeta>
): string {
    return entry.services
        .map(service =>
            `<span class="dr-hero-pill">${esc(serviceNameOf(serviceNames, service.serviceId))}</span>`
        )
        .join('');
}

/** Dienste eines Events als einfache Listeneinträge (Anstehende Dienste). */
function serviceListItems(
    entry: OwnEventEntry,
    serviceNames: Map<number, ServiceMeta>
): string {
    return entry.services
        .map(service =>
            `<li>${esc(serviceNameOf(serviceNames, service.serviceId))}</li>`
        )
        .join('');
}

export default function Dashboard() {
  return `
    <div class="dr-dashboard" id="dashboardRoot">

      <div class="dr-content dr-content-full">
        <div class="dr-dashboard-hero card" id="dashboardHero">
          <h2 class="dr-dashboard-hero-title">Nächster Dienst</h2>
          <p class="dr-empty">Wird geladen…</p>
        </div>

        <div class="dr-dashboard-grid">

          <section class="dr-dashboard-col dr-dashboard-col--1" aria-label="Anfragen und anstehende Dienste">
            <div class="card dr-dashboard-card" id="dashboardRequests">
              <h2>Anfragen</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>

            <div class="card dr-dashboard-card" id="dashboardUpcoming">
              <h2>Anstehende Dienste</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

          <section class="dr-dashboard-col dr-dashboard-col--2" aria-label="Offene Dienste">
            <div class="card dr-dashboard-card" id="dashboardOpenServices">
              <h2>Offene Dienste</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

          <section class="dr-dashboard-col dr-dashboard-col--3" aria-label="Statistik und Aktionen">
            <div class="card dr-dashboard-card dr-stats-card" id="dashboardStats">
              <h2>Meine Statistik</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>

            <div class="card dr-dashboard-card" id="dashboardQuickActions">
              <h2>Schnellzugriff</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

        </div>
      </div>

    </div>
  `;
}

let instanceId = 0;

/** Gewählter Zeitraum der Offene-Dienste-Karte (Tage). */
let openWindowDays = 60;

// ── Modul-Zustand für Neu-Rendern ohne Daten-Argumente ───────────────

let lastPersonId = 0;
let lastPersonIdentifier = '';
let lastServiceNames: Map<number, ServiceMeta> = new Map();
let lastServices: Service[] = [];
let lastPerms = null as Awaited<ReturnType<typeof loadUserPermissions>> | null;
let lastOpenEntries: OpenServiceEntry[] = [];
let lastRequests: ServiceRequest[] = [];
let lastEvents: CtEvent[] = [];

// ── Statistik-Zustand ────────────────────────────────────────────────

/** Default-Zeitraum (Stellschraube: eine der IDs aus STATS_WINDOWS). */
let statsWindowId = '8w';
let statsMode: StatsMode = 'individual';
let statsChart: StatsChart = 'bars';

/** Punkte des aktuell gerenderten Diagramms – Datenquelle des Tooltips. */
let lastStatsPoints: StatsPoint[] = [];

// ── Polling ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const POLL_DOMAIN_TYPES = ['event_service'];

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPollDate = new Date().toISOString();

/** true, solange ein Undo-Fenster offen ist – Polling pausiert dann. */
let undoWindowOpen = false;

// ── Delegation-Listener ──────────────────────────────────────────────

let openQuickHandler: ((event: Event) => void) | null = null;
let requestActionHandler: ((event: Event) => void) | null = null;
let statsHandler: ((event: Event) => void) | null = null;
let statsTipHandler: ((event: Event) => void) | null = null;
let statsTipLeaveHandler: (() => void) | null = null;

/** Index der per Klick fixierten Diagramm-Spalte – null = nichts fixiert. */
let pinnedStatsIndex: number | null = null;

/** Klick-Listener (document-Ebene) für Fixieren/Lösen des Tooltips. */
let statsTipClickHandler: ((event: Event) => void) | null = null;

// ── Statistik: Resize-Handling ───────────────────────────────────────

let statsResizeObserver: ResizeObserver | null = null;
let lastStatsWidth = 0;
let statsRafId: number | null = null;

export async function init(): Promise<void> {
    const id = ++instanceId;

    try {
        const personId = await getPersonId();
        const personIdentifier = String(personId);

        const [events, serviceNames, services, perms, requestList] = await Promise.all([
            loadDashboardEvents(),
            getServiceMetaMap(),
            getServices(),
            loadUserPermissions(),
            loadServiceRequests(personId),
        ]);

        if (id !== instanceId) return;

        lastPersonId = personId;
        lastPersonIdentifier = personIdentifier;
        lastServiceNames = serviceNames;
        lastServices = services;
        lastPerms = perms;
        lastRequests = requestList;
        lastEvents = events;

        const upcoming = getUpcomingOwnEvents(events, personIdentifier);
        const openEntries = getOpenServices(events, services, perms);

        renderHero(upcoming[0], serviceNames);
        renderUpcomingList(upcoming, serviceNames);
        renderRequests();
        renderOpenServices(openEntries, serviceNames);
        renderStats();
        renderQuickActions();

        bindOpenQuickButtons();
        bindRequestActions();
        bindStatsControls();
        bindStatsTooltip();
        bindStatsResize();

        startPolling();
    } catch (error) {
        if (id !== instanceId) return;

        showStatus(
            'Fehler beim Laden der Dienste: ' +
                (error instanceof Error ? error.message : 'Unbekannter Fehler'),
            'error'
        );

        const hero = document.getElementById('dashboardHero');
        if (hero) hero.innerHTML = `<h2 class="dr-dashboard-hero-title">Nächstes Event</h2><p class="dr-empty">Konnte nicht geladen werden</p>`;
    }
}

export function destroy(): void {
    instanceId++;

    stopPolling();

    if (openQuickHandler) {
        document.getElementById('dashboardOpenServices')
            ?.removeEventListener('click', openQuickHandler);
        openQuickHandler = null;
    }

    if (requestActionHandler) {
        document.getElementById('dashboardRequests')
            ?.removeEventListener('click', requestActionHandler);
        requestActionHandler = null;
    }

    if (statsHandler) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('click', statsHandler);
        statsHandler = null;
    }

    if (statsTipHandler) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('pointerover', statsTipHandler);
        statsTipHandler = null;
    }

    if (statsTipLeaveHandler) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('pointerleave', statsTipLeaveHandler);
        statsTipLeaveHandler = null;
    }

    if (statsTipClickHandler) {
        document.removeEventListener('click', statsTipClickHandler);
        statsTipClickHandler = null;
    }

    if (statsResizeObserver) {
        statsResizeObserver.disconnect();
        statsResizeObserver = null;
    }

    if (statsRafId !== null) {
        cancelAnimationFrame(statsRafId);
        statsRafId = null;
    }
}

// ── Polling ──────────────────────────────────────────────────────────

async function pollTick(): Promise<void> {
    if (undoWindowOpen) return;
    if (document.visibilityState !== 'visible') return;

    try {
        const result = await pollForNews(POLL_DOMAIN_TYPES, lastPollDate);
        lastPollDate = result.lastPollDate;

        if (result.hasChanges) {
            await reloadAll();
        }
    } catch {
        // Still: fehlgeschlagener Poll-Zyklus ist kein Nutzerfehler
    }
}

function startPolling(): void {
    stopPolling();

    pollTimer = setInterval(() => { void pollTick(); }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

function stopPolling(): void {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    void pollTick();
}

/** Setzt den EINEN Delegation-Listener für die Quick-Buttons der Karte. */
function bindOpenQuickButtons(): void {
    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    openQuickHandler = (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-quick-open');
        if (!btn?.dataset.days) return;

        openWindowDays = parseInt(btn.dataset.days, 10);
        renderOpenServices(lastOpenEntries, lastServiceNames);
    };

    card.addEventListener('click', openQuickHandler);
}

/**
 * Lädt Events und Anfragen frisch und baut ALLE Karten neu – der gemeinsame
 * Weg nach Annehmen, Ablehnen, Undo UND Polling-Änderung.
 */
async function reloadAll(): Promise<void> {
    resetDashboardEvents();

    const [events, requestList] = await Promise.all([
        loadDashboardEvents(),
        loadServiceRequests(lastPersonId),
    ]);
    lastRequests = requestList;
    lastEvents = events;

    const upcoming = getUpcomingOwnEvents(events, lastPersonIdentifier);
    const openEntries = lastPerms
        ? getOpenServices(events, lastServices, lastPerms)
        : [];

    renderHero(upcoming[0], lastServiceNames);
    renderUpcomingList(upcoming, lastServiceNames);
    renderRequests();
    renderOpenServices(openEntries, lastServiceNames);
    renderStats();
}

function bindRequestActions(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    requestActionHandler = async (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-request-btn');
        if (!btn) return;

        const action = btn.dataset.action;
        const requestId = parseInt(btn.dataset.requestId || '', 10);
        const eventId = parseInt(btn.dataset.eventId || '', 10);
        if (!action || Number.isNaN(requestId) || Number.isNaN(eventId)) return;

        btn.disabled = true;
        showStatus(
            action === 'accept' ? '🔄 Anfrage wird angenommen…' : '🔄 Anfrage wird abgelehnt…',
            'loading'
        );

        try {
            if (action === 'accept') {
                await acceptServiceRequest(eventId, requestId);
            } else {
                await declineServiceRequest(eventId, requestId);
            }

            undoWindowOpen = true;
            await reloadAll();

            showActionToast(
                action === 'accept' ? '✓ Zugesagt' : '✓ Abgesagt',
                'Rückgängig',
                () => undoRequest(eventId, requestId)
            );

            // Undo-Fenster automatisch schließen, wenn der Toast ohne Klick
            // abläuft. Muss mit UNDO_TIMEOUT_MS in toast.ts übereinstimmen.
            // Klickt der Nutzer vorher: undoRequest() setzt die Variable
            // schon auf false – das doppelte Zurücksetzen ist harmlos.
            setTimeout(() => { undoWindowOpen = false; }, 15_000);
        } catch (error) {
            showStatus(
                'Fehler: ' +
                    (error instanceof Error ? error.message : 'Unbekannter Fehler'),
                'error'
            );
            btn.disabled = false;
        }
    };

    card.addEventListener('click', requestActionHandler);
}

async function undoRequest(eventId: number, requestId: number): Promise<void> {
    undoWindowOpen = false;
    showStatus('🔄 Aktion wird zurückgenommen…', 'loading');

    try {
        await undoServiceRequest(eventId, requestId, lastPersonId);
        await reloadAll();
        hideStatus();
        showStatus('✓ Zurückgenommen', 'success');
    } catch (error) {
        hideStatus();
        showStatus(
            'Fehler beim Zurücknehmen: ' +
                (error instanceof Error ? error.message : 'Unbekannter Fehler'),
            'error'
        );
    }
}

// ── Hero ─────────────────────────────────────────────────────────────

function renderHero(
    entry: OwnEventEntry | undefined,
    serviceNames: Map<number, ServiceMeta>
): void {
    const hero = document.getElementById('dashboardHero');
    if (!hero) return;

    if (!entry) {
        hero.innerHTML = `
            <h2 class="dr-dashboard-hero-title">Nächstes Event</h2>
            <p class="dr-empty">Du bist für kein anstehendes Event eingeteilt.</p>
        `;
        return;
    }

    const date = eventStartDate(entry.event);
    const countdown = formatCountdown(date);
    const url = buildEventUrl(entry.event.id);

    hero.innerHTML = `
        <div class="dr-hero">
            <div class="dr-hero-date">
                <span class="dr-hero-date-day">${esc(formatDayOfMonth(date))}</span>
                <span class="dr-hero-date-month">${esc(formatMonthShort(date))}</span>
            </div>
            <div class="dr-hero-main">
                <div class="dr-hero-title-row">
                    <h2 class="dr-dashboard-hero-title">${esc(entry.event.name ?? 'Unbenanntes Event')}</h2>
                    <span class="dr-dashboard-hero-countdown">${esc(countdown)}</span>
                </div>
                <p class="dr-hero-date-long">${esc(formatEventDateLong(entry.event))}</p>
                <div class="dr-hero-services">${servicePills(entry, serviceNames)}</div>
            </div>
            ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-hero-btn">Event aufrufen</a>` : ''}
        </div>
    `;
}

// ── Spalte 1: Anstehende Dienste ─────────────────────────────────────

function renderUpcomingList(
    upcoming: OwnEventEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    const card = document.getElementById('dashboardUpcoming');
    if (!card) return;

    if (upcoming.length === 0) {
        card.innerHTML = `
            <h2>Anstehende Dienste</h2>
            <p class="dr-empty">Keine anstehenden eigenen Dienste gefunden.</p>
        `;
        return;
    }

    const items = upcoming.map(entry => {
        const url = buildEventUrl(entry.event.id);

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-entry-btn">Event aufrufen</a>` : ''}
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(entry.event))}</span>
                    <span class="dr-dashboard-entry-event">${esc(entry.event.name ?? 'Unbenanntes Event')}</span>
                </div>
                <ul class="dr-dashboard-entry-services">${serviceListItems(entry, serviceNames)}</ul>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Anstehende Dienste</h2>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 2b: Offene Dienste ────────────────────────────────────────

function renderOpenServices(
    openEntries: OpenServiceEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    lastOpenEntries = openEntries;

    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + openWindowDays);
    const cutoffTime = cutoff.getTime();

    const filtered = openEntries.filter(
        entry => eventStartDate(entry.event).getTime() <= cutoffTime
    );

    const buttons = [14, 30, 60, 90].map(days => `
        <button type="button" class="dr-quick dr-quick-open${days === openWindowDays ? ' active' : ''}"
                data-days="${days}">${days} T</button>
    `).join('');

    if (filtered.length === 0) {
        card.innerHTML = `
            <h2>Offene Dienste</h2>
            <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
            <p class="dr-empty">Keine offenen Dienste in den nächsten ${openWindowDays} Tagen.</p>
        `;
        return;
    }

    const items = filtered.map(entry => {
        const url = buildEventUrl(entry.event.id);
        const services = entry.services
            .map(service => ({
                serviceId: service.serviceId,
                name: serviceNameOf(serviceNames, service.serviceId),
                sortKey: service.serviceId !== undefined
                    ? serviceNames.get(service.serviceId)?.sortKey ?? Number.MAX_SAFE_INTEGER
                    : Number.MAX_SAFE_INTEGER,
            }))
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(item => `<span class="dr-open-pill">${esc(item.name)}</span>`)
            .join('');

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-entry-btn">Zum Event</a>` : ''}
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(entry.event))}</span>
                    <span class="dr-dashboard-entry-event">${esc(entry.event.name ?? 'Unbenanntes Event')}</span>
                </div>
                <div class="dr-dashboard-entry-services dr-open-services">${services}</div>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Offene Dienste</h2>
        <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 2a: Anfragen ──────────────────────────────────────────────

function renderRequests(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const open = lastRequests
        .filter(request =>
            request.isAccepted === false
            && request.isValid !== false
            && request.event !== null
        )
        .filter(request =>
            new Date(request.event!.startDate).getTime() >= todayStart.getTime()
        )
        .sort((a, b) =>
            new Date(a.event!.startDate).getTime() - new Date(b.event!.startDate).getTime()
        );

    if (open.length === 0) {
        // Leer → Karte komplett ausblenden (wie die Schnellzugriff-Karte).
        // Bewusst nur hier: Anstehende Dienste und Offene Dienste haben
        // immer sinnvolle Inhalte und bleiben stehen.
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const items = open.map(request => {
        const url = buildEventUrl(request.event!.id);
        const serviceName = request.serviceName ?? 'Dienst';

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(request.event!))}</span>
                    <span class="dr-dashboard-entry-event">${esc(serviceName)} · ${esc(request.event!.name ?? '')}</span>
                </div>
                ${request.requesterPerson
                    ? `<p class="dr-request-requester">Angefragt von ${esc(request.requesterPerson.title)}</p>`
                    : ''}
                <div class="dr-request-actions">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-request-link dr-request-btn">Zum Event</a>` : ''}
                    <div class="dr-request-buttons">
                        <button type="button" class="dr-btn dr-btn--secondary dr-request-btn"
                                data-action="decline"
                                data-request-id="${request.id}"
                                data-event-id="${request.event!.id}">Ablehnen</button>
                        <button type="button" class="dr-btn dr-btn--primary dr-request-btn"
                                data-action="accept"
                                data-request-id="${request.id}"
                                data-event-id="${request.event!.id}">Annehmen</button>
                    </div>
                </div>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Anfragen</h2>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 3a: Eigene Statistik ──────────────────────────────────────

function renderStats(): void {
    const card = document.getElementById('dashboardStats');
    pinnedStatsIndex = null;
    if (!card) return;

    const win = STATS_WINDOWS.find(w => w.id === statsWindowId) ?? STATS_WINDOWS[1];
    const points = computeStats(lastEvents, lastPersonIdentifier, win, statsMode, lastServiceNames);
    lastStatsPoints = points;

    const windowButtons = STATS_WINDOWS.map(w => `
        <button type="button" class="dr-quick${w.id === win.id ? ' active' : ''}"
                data-stats="window" data-value="${w.id}">${w.label}</button>
    `).join('');

    const modeButtons = ([
        { id: 'individual', label: 'Einzeln' },
        { id: 'perEvent', label: 'Pro Event' },
        { id: 'perDay', label: 'Pro Tag' },
    ] as Array<{ id: StatsMode; label: string }>).map(m => `
        <button type="button" class="dr-quick${m.id === statsMode ? ' active' : ''}"
                data-stats="mode" data-value="${m.id}">${m.label}</button>
    `).join('');

    const chartButtons = ([
        { id: 'bars', label: 'Säulen' },
        { id: 'line', label: 'Linien' },
    ] as Array<{ id: StatsChart; label: string }>).map(c => `
        <button type="button" class="dr-quick${c.id === statsChart ? ' active' : ''}"
                data-stats="chart" data-value="${c.id}">${c.label}</button>
    `).join('');

    // Verfügbare Breite: Karten-Innenbreite (padding: spacing*5 = 20px pro Seite).
    // Im Neben-einander-Layout (Container-Query ab 800px Innenbreite) nimmt die
    // Buttons-Spalte 240px + 16px Gap weg – MUSS zur flex-basis in dashboard.css
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
            ${renderStatsChart(points, statsChart, availableWidth)}
        </div>
    `;
}

/** EIN Delegation-Listener für alle drei Button-Gruppen der Statistik-Karte. */
function bindStatsControls(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    statsHandler = (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLElement>('button[data-stats]');
        if (!btn) return;

        const type = btn.dataset.stats;
        const value = btn.dataset.value ?? '';
        if (!type || !value) return;

        if (type === 'window') statsWindowId = value;
        else if (type === 'mode') statsMode = value as StatsMode;
        else if (type === 'chart') statsChart = value as StatsChart;

        renderStats();
    };

    card.addEventListener('click', statsHandler);
}

// ── Spalte 3b: Quick-Actions ─────────────────────────────────────────

function renderQuickActions(): void {
    const card = document.getElementById('dashboardQuickActions');
    if (!card) return;

    const actions = [
        {
            route: '/inactivity',
            icon: 'magnificant_glass',
            label: 'Inaktivität finden',
            description: 'Wer war in welchem Zeitraum in keinen Diensten?',
        },
        {
            route: '/statistics',
            icon: 'chart',
            label: 'Statistiken',
            description: 'Dienste pro Person im Detail',
        },
        {
            route: '/settings',
            icon: 'settings',
            label: 'Einstellungen',
            description: 'Konfiguration der Extension',
        },
    ].filter(action => canAccessPage(action.route));

    if (actions.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const items = actions.map(action => `
        <a href="${routeHref(action.route)}" class="dr-quick-action">
            <span class="dr-quick-action-icon">${icon(action.icon)}</span>
            <span class="dr-quick-action-text">
                <span class="dr-quick-action-label">${esc(action.label)}</span>
                <span class="dr-quick-action-description">${esc(action.description)}</span>
            </span>
        </a>
    `).join('');

    card.innerHTML = `
        <h2>Schnellzugriff</h2>
        <div class="dr-quick-action-list">${items}</div>
    `;
}

// ── Statistik: Hover-Tooltip ─────────────────────────────────────────

// ── Statistik: Hover-Tooltip + Klick-Fixierung ───────────────────────

/**
 * Detail-Karten („welche Dienste wann") erscheinen beim Hover – und
 * bleiben nach KLICK auf eine Diagramm-Spalte stehen (wichtig für
 * Touch-Geräte, wo es kein Hover gibt). Ein Klick irgendwo anders
 * (auch auf einen Button der Karte oder außerhalb) löst die Fixierung.
 */
function bindStatsTooltip(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    // Hover: zeigt das Tooltip – außer etwas ist fixiert (dann gewinnt der Pin)
    statsTipHandler = (event: Event) => {
        if (pinnedStatsIndex !== null) return;

        const hit = (event.target as Element).closest<SVGRectElement>('[data-stats-index]');
        if (!hit) return;   // Hovern außerhalb der Spalten: nichts ändern

        const index = parseInt(hit.dataset.statsIndex ?? '', 10);
        const point = lastStatsPoints[index];
        if (!point || point.entries.length === 0) {
            hideStatsTip();
            return;
        }

        showStatsTip(hit, point);
    };

    // Verlassen der Spalten versteckt nur, wenn NICHT fixiert
    statsTipLeaveHandler = () => {
        if (pinnedStatsIndex === null) hideStatsTip();
    };

    card.addEventListener('pointerover', statsTipHandler);
    card.addEventListener('pointerleave', statsTipLeaveHandler);

    // Klick: auf eine Spalte → fixieren (bzw. auf eine andere umspringen);
    // irgendwo anders → lösen. document-Ebene, damit auch Klicks außerhalb
    // der Karte das fixierte Tooltip lösen.
    statsTipClickHandler = (event: Event) => {
        const hit = (event.target as Element).closest<SVGRectElement>('[data-stats-index]');

        if (!hit) {
            unpinStats();
            return;
        }

        const index = parseInt(hit.dataset.statsIndex ?? '', 10);
        const point = lastStatsPoints[index];
        if (!point || point.entries.length === 0) {
            unpinStats();
            return;
        }

        pinnedStatsIndex = index;
        showStatsTip(hit, point);
    };

    document.addEventListener('click', statsTipClickHandler);
}

/** Fixierung lösen und Tooltip entfernen. */
function unpinStats(): void {
    pinnedStatsIndex = null;
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
    tip.classList.toggle('dr-stats-tip--pinned', pinnedStatsIndex !== null);
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
    // Nahe den Kanten wird der Mittelpunkt des Tooltips zur Karteiteile
    // zurückgeschoben, damit nichts über die Kante ragt.
    const hitRect = hit.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    tip.style.left = '0px';   // erst sichtbar machen, dann messen
    const tipWidth = tip.offsetWidth;
    const tipHalf = tipWidth / 2;

    const centered = hitRect.left - wrapRect.left + hitRect.width / 2;
    const clamped = Math.min(
        Math.max(centered, tipHalf + 8),                 // linke Kante + 8px Puffer
        wrapRect.width - tipHalf - 8                      // rechte Kante + 8px Puffer
    );

    tip.style.left = `${clamped}px`;
    tip.style.top = `${hitRect.top - wrapRect.top}px`;
}

function hideStatsTip(): void {
    document.querySelector('#dashboardStats .dr-stats-tip')?.remove();
}

// ── Statistik: Resize-Handling ───────────────────────────────────────

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
function bindStatsResize(): void {
    const card = document.getElementById('dashboardStats');
    if (!card) return;

    lastStatsWidth = card.clientWidth;

    statsResizeObserver = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width ?? 0;

        // Rundungsrauschen und Sub-Pixel-Schwankungen ignorieren
        if (Math.abs(width - lastStatsWidth) < 8) return;

        if (statsRafId !== null) cancelAnimationFrame(statsRafId);
        statsRafId = requestAnimationFrame(() => {
            statsRafId = null;
            lastStatsWidth = width;
            renderStats();
        });
    });

    statsResizeObserver.observe(card);
}