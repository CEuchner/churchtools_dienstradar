import { showStatus, showActionToast, hideStatus } from '../../components/toast';
import { pollForNews } from '../../api/pollfornews';
import {
    acceptServiceRequest,
    declineServiceRequest,
    undoServiceRequest,
    loadServiceRequests,
} from '../../api/servicerequests';
import { loadDashboardEvents, resetDashboardEvents } from './data';
import { getUpcomingOwnEvents, getOpenServices } from './derive';
import { renderHero, renderUpcomingList, renderOpenServices, renderRequests } from './cards';
import { renderStats } from './stats-ui';
import { dashboardState, handlers } from './state';

// ── Polling ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const POLL_DOMAIN_TYPES = ['event_service'];

/** Muss mit UNDO_TIMEOUT_MS in toast.ts übereinstimmen. */
const UNDO_WINDOW_MS = 15_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Ein Poll-Tick: Fragment-Anfrage nach Änderungen, nur bei Treffern
 * wird reloadAll() ausgeführt. Wird vom Intervall UND vom
 * visibilitychange genutzt (Rückkehr in den Tab → sofort ein Tick).
 */
export async function pollTick(): Promise<void> {
    if (dashboardState.undoWindowOpen) return;
    if (document.visibilityState !== 'visible') return;

    try {
        const result = await pollForNews(POLL_DOMAIN_TYPES, dashboardState.lastPollDate);
        dashboardState.lastPollDate = result.lastPollDate;

        if (result.hasChanges) {
            await reloadAll();
        }
    } catch {
        // Still: fehlgeschlagener Poll-Zyklus ist kein Nutzerfehler
    }
}

export function startPolling(): void {
    stopPolling();

    pollTimer = setInterval(() => { void pollTick(); }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function stopPolling(): void {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

/** Bei Rückkehr in den sichtbaren Tab: sofort ein Poll-Tick. */
function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    void pollTick();
}

// ── Gemeinsamer Neu-Lade-Weg ─────────────────────────────────────────

/**
 * Lädt Events und Anfragen frisch und baut ALLE Karten neu – der gemeinsame
 * Weg nach Annehmen, Ablehnen, Undo UND Polling-Änderung.
 */
export async function reloadAll(): Promise<void> {
    resetDashboardEvents();

    const [events, requestList] = await Promise.all([
        loadDashboardEvents(),
        loadServiceRequests(dashboardState.personId),
    ]);
    dashboardState.requests = requestList;
    dashboardState.events = events;

    const upcoming = getUpcomingOwnEvents(events, dashboardState.personIdentifier);
    dashboardState.upcomingEntries = upcoming;
    const openEntries = dashboardState.perms
        ? getOpenServices(events, dashboardState.services, dashboardState.perms)
        : [];
    dashboardState.openEntries = openEntries;

    renderHero(upcoming[0], dashboardState.serviceNames);
    renderUpcomingList(upcoming, dashboardState.serviceNames);
    renderRequests();
    renderOpenServices(openEntries, dashboardState.serviceNames);
    renderStats();
}

// ── Delegation-Listener ──────────────────────────────────────────────

/** Setzt den EINEN Delegation-Listener für die Quick-Buttons der Karte. */
export function bindOpenQuickButtons(): void {
    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    handlers.openQuick = (event: Event) => {
        // Zuerst: Auf-/Zuklappen der Offene-Dienste-Liste
        const expand = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-expand-open');
        if (expand) {
            dashboardState.openExpanded = !dashboardState.openExpanded;
            renderOpenServices(dashboardState.openEntries, dashboardState.serviceNames);
            return;
        }

        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-quick-open');
        if (!btn?.dataset.days) return;

        dashboardState.openWindowDays = parseInt(btn.dataset.days, 10);
        renderOpenServices(dashboardState.openEntries, dashboardState.serviceNames);
    };

    card.addEventListener('click', handlers.openQuick);
}

/** Delegation-Listener der Anstehende-Dienste-Karte (Auf-/Zuklappen). */
export function bindUpcomingControls(): void {
    const card = document.getElementById('dashboardUpcoming');
    if (!card) return;

    handlers.upcoming = (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-expand-upcoming');
        if (!btn) return;

        dashboardState.upcomingExpanded = !dashboardState.upcomingExpanded;
        renderUpcomingList(dashboardState.upcomingEntries, dashboardState.serviceNames);
    };

    card.addEventListener('click', handlers.upcoming);
}

/**
 * Delegation-Listener der Anfragen-Karte: Annehmen/Ablehnen direkt im
 * Dashboard. Nach Erfolg erscheint eine Undo-Meldung („Zugesagt"/„Abgesagt"
 * + „Rückgängig", 15 s), und ALLE Ansichten werden frisch geladen.
 */
export function bindRequestActions(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    handlers.requestAction = async (event: Event) => {
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

            dashboardState.undoWindowOpen = true;
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
            setTimeout(() => { dashboardState.undoWindowOpen = false; }, UNDO_WINDOW_MS);
        } catch (error) {
            showStatus(
                'Fehler: ' +
                    (error instanceof Error ? error.message : 'Unbekannter Fehler'),
                'error'
            );
            btn.disabled = false;
        }
    };

    card.addEventListener('click', handlers.requestAction);
}

/**
 * Nimmt eine Annahme/Ablehnung zurück und lädt alles frisch.
 * Läuft im Kontext des Undo-Toasts – Fehler erscheinen als Toast.
 */
export async function undoRequest(eventId: number, requestId: number): Promise<void> {
    dashboardState.undoWindowOpen = false;
    showStatus('🔄 Aktion wird zurückgenommen…', 'loading');

    try {
        await undoServiceRequest(eventId, requestId, dashboardState.personId);
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