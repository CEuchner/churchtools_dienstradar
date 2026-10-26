import type { Event } from '../../utils/ct-types';
import type { ServiceMeta } from './data';

/** HTML-Escaping für Namen aus der Datenbank (Service-/Eventnamen). */
export function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Date → 'YYYY-MM-DD' (lokal, nicht UTC – damit Tagesgrenzen stimmen). */
export function toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function monthsAgo(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
}

export function monthsAhead(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d;
}

export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Event-Startzeit als Date. `startDate` ist ein Zulu-String (UTC). */
export function eventStartDate(event: Event): Date {
    return new Date(event.startDate ?? '');
}

/** Deutsche Kurzform für Listen/Hero, z. B. „Fr, 23.10. · 01:00".
 *  Akzeptiert jedes Objekt mit startDate (Event ODER ServiceRequest.event). */
export function formatEventDateTime(event: { startDate?: string }): string {
    const date = new Date(event.startDate ?? '');
    if (Number.isNaN(date.getTime())) return '';

    const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' });
    const day = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${weekday}, ${day} · ${time}`;
}

/** Nur die Tageszahl, z. B. „23". */
export function formatDayOfMonth(date: Date): string {
    return date.toLocaleDateString('de-DE', { day: '2-digit' });
}

/** Monat kurz, z. B. „Okt.". */
export function formatMonthShort(date: Date): string {
    return date.toLocaleDateString('de-DE', { month: 'short' });
}

/** Lange Form fürs Hero, z. B. „Freitag, 23. Oktober · 01:00 Uhr". */
export function formatEventDateLong(event: Event): string {
    const date = eventStartDate(event);
    if (Number.isNaN(date.getTime())) return '';

    const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
    const day = date.toLocaleDateString('de-DE', { day: 'numeric' });
    const month = date.toLocaleDateString('de-DE', { month: 'long' });
    const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${weekday}, ${day}. ${month} · ${time} Uhr`;
}

/** Countdown-Text für den Hero: „heute", „morgen", „in X Tagen". */
export function formatCountdown(target: Date, now: Date = new Date()): string {
    const diffDays = Math.round(
        (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000
    );

    if (diffDays <= 0) return 'heute';
    if (diffDays === 1) return 'morgen';
    return `in ${diffDays} Tagen`;
}

/** Basis-URL der ChurchTools-Instanz – nicht die der Extension. */
function ctBaseUrl(): string {
    // Installiert: der Host setzt window.settings.base_url.
    // Dev: VITE_BASE_URL aus der .env. Fallback: aktueller Origin.
    const settings = (window as any)?.settings;
    return settings?.base_url ?? import.meta.env.VITE_BASE_URL ?? window.location.origin;
}

/**
 * Link zum Event in ChurchTools (für target="_blank"):
 * https://<instanz>/?q=churchservice&id=<eventId>#ListView/
 */
export function buildEventUrl(eventId: number | undefined): string {
    if (!eventId) return '';
    return `${ctBaseUrl()}/?q=churchservice&id=${eventId}#ListView/`;
}

/** Holt den Dienstnamen aus der Meta-Map (einzige Quelle für alle Karten). */
export function serviceNameOf(
    serviceNames: Map<number, ServiceMeta>,
    serviceId: number | undefined
): string {
    return serviceId !== undefined
        ? serviceNames.get(serviceId)?.name ?? 'Dienst'
        : 'Dienst';
}