/**
 * App-weite Toast-Benachrichtigungen.
 *
 * Verhalten:
 *  - loading : bleibt stehen, bis die Aktion fertig ist. Wiederholte
 *              Aufrufe aktualisieren den bestehenden Toast statt zu stapeln.
 *  - success : verschwindet nach 5 s automatisch, mit Fortschrittsbalken.
 *  - error   : verschwindet nach 10 s automatisch (doppelt so lange wie
 *              success, damit sie lesbar bleiben), ebenfalls mit
 *              Fortschrittsbalken. Der ✕-Button erlaubt früheres Schließen.
 *
 * Beim Entfernen kollabiert ein Toast animiert (Höhe + Deckkraft), sodass
 * die darunterliegenden Toasts sanft nach oben rutschen.
 *
 * Der Container hängt bewusst an <body> (außerhalb von .dr-root), damit die
 * Toasts unabhängig von der aktuellen Seite und vom Scroll-Container sichtbar
 * bleiben. Die Klassen sind daher auf Root-Ebene gestylt.
 */

export type StatusType = 'loading' | 'error' | 'success';

const CONTAINER_CLASS = 'dr-toast-container';
const TOAST_CLASS = 'dr-toast';
const CONTENT_CLASS = 'dr-toast-content';

/** Muss zur `animation-duration` des Fortschrittsbalkens in toast.css passen. */
const SUCCESS_TIMEOUT_MS = 5000;

/** Fehler stehen doppelt so lange, damit sie lesbar bleiben. */
const ERROR_TIMEOUT_MS = SUCCESS_TIMEOUT_MS * 2;

/** Muss zur Animation `dr-toast-out` in toast.css passen. */
const REMOVE_ANIMATION_MS = 250;

function getContainer(): HTMLDivElement {
    let container = document.querySelector<HTMLDivElement>(`.${CONTAINER_CLASS}`);

    if (!container) {
        container = document.createElement('div');
        container.className = CONTAINER_CLASS;
        document.body.appendChild(container);
    }

    return container;
}

/** Baut den Inhalt eines Toasts: optionaler Spinner + Text. */
function buildContent(message: string, withSpinner: boolean): HTMLDivElement {
    const content = document.createElement('div');
    content.className = CONTENT_CLASS;

    if (withSpinner) {
        const spinner = document.createElement('span');
        spinner.className = 'dr-spinner';
        content.appendChild(spinner);
    }

    const text = document.createElement('span');
    text.textContent = message;
    content.appendChild(text);

    return content;
}

/**
 * Entfernt einen Toast mit Ausblend-Animation: Höhe und Deckkraft laufen
 * auf 0, sodass die darunterliegenden Toasts sanft nach oben rutschen,
 * statt bei einem plötzlichen remove() hochzuspringen.
 */
function removeToast(toast: HTMLElement): void {
    if (toast.dataset.leaving === 'true') return;   // bereits am Schwinden
    toast.dataset.leaving = 'true';

    // Explizite Starthöhe setzen, damit height → 0 animierbar ist
    toast.style.height = `${toast.offsetHeight}px`;

    toast.classList.add('dr-toast--leaving');
    setTimeout(() => toast.remove(), REMOVE_ANIMATION_MS);
}

/**
 * Zeigt eine Statusmeldung an.
 * Für `type = 'loading'` wird ein vorhandener Loading-Toast aktualisiert,
 * damit parallele Schritte die Anzeige nicht zumüllen.
 */
export function showStatus(message: string, type: StatusType): void {
    const container = getContainer();

    // ── loading ──────────────────────────────────────────────────────────
    if (type === 'loading') {
        const existing = container.querySelector<HTMLDivElement>(
            `.${TOAST_CLASS}.status-loading`
        );

        if (existing) {
            existing.replaceChildren(buildContent(message, true));
            return;
        }

        const toast = document.createElement('div');
        toast.className = `${TOAST_CLASS} status-loading`;
        toast.appendChild(buildContent(message, true));
        container.appendChild(toast);
        return;
    }

    // Ab hier keine Loading-Toasts mehr stehen lassen
    container.querySelectorAll(`.${TOAST_CLASS}.status-loading`).forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `${TOAST_CLASS} status-${type}`;
    toast.appendChild(buildContent(message, false));

    if (type === 'error') {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dr-toast-close';
        closeBtn.setAttribute('aria-label', 'Meldung schließen');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => removeToast(toast));
        toast.appendChild(closeBtn);
    }

    // ── Ablaufende für success und error ─────────────────────────────────
    // Fehler bleiben doppelt so lange stehen, verschwinden aber auch
    // automatisch. Der Fortschrittsbalken zeigt die verbleibende Zeit an.
    const timeoutMs = type === 'error' ? ERROR_TIMEOUT_MS : SUCCESS_TIMEOUT_MS;

    const progress = document.createElement('div');
    progress.className = 'dr-toast-progress';

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.animationDuration = `${timeoutMs}ms`;

    progress.appendChild(bar);
    toast.appendChild(progress);

    // Ist der Toast schon weg, ist remove() ein No-op – kein Extra-Aufräumen nötig.
    setTimeout(() => removeToast(toast), timeoutMs);

    container.appendChild(toast);
}

/** Entfernt alle Loading-Toasts (z. B. wenn eine Aktion abgebrochen wurde). */
export function hideStatus(): void {
    const container = document.querySelector<HTMLDivElement>(`.${CONTAINER_CLASS}`);
    container?.querySelectorAll<HTMLElement>(`.${TOAST_CLASS}.status-loading`)
        .forEach(removeToast);
}

/** Entfernt alle Toasts sofort – z. B. beim Verlassen einer Seite. */
export function clearStatusToasts(): void {
    const container = document.querySelector<HTMLDivElement>(`.${CONTAINER_CLASS}`);
    container?.replaceChildren();
}