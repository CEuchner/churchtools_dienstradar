/**
 * Geteilte Formular-Bausteine: Dienst-Auswahl und Schnelldatum-Buttons.
 *
 * Bewusst OHNE Rechteprüfung und ohne State-Zugriff: Diese Datei bekommt
 * fertige Daten übergeben und rendert nur. Die Auswahl, welche Dienste ein
 * Nutzer sehen darf, entscheidet die jeweilige Seite.
 */

export interface ServiceOption {
    id: number;
    name: string;
}

export interface ServiceCheckboxGroup {
    /** `undefined` = Dienst ohne zugeordnete Dienstgruppe. */
    groupId?: number;
    groupName: string;
    services: ServiceOption[];
}

/** Rendert die Dienste-Auswahl mit aufklappbaren Dienstgruppen und Master-Checkbox. */
export function renderServiceCheckboxes(
    container: HTMLElement,
    groups: ServiceCheckboxGroup[]
): void {
    container.replaceChildren();

    if (groups.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'dr-empty';
        empty.textContent = 'Keine Dienste verfügbar';
        container.appendChild(empty);
        return;
    }

    groups.forEach(group => {
        if (group.groupId === undefined) {
            container.appendChild(buildGroupItems(group, null));
            return;
        }

        const header = document.createElement('div');
        header.className = 'dr-service-group-header collapsed';

        const toggle = document.createElement('span');
        toggle.className = 'dr-service-group-toggle';
        toggle.textContent = '▼';

        const masterCheckbox = document.createElement('input');
        masterCheckbox.type = 'checkbox';
        masterCheckbox.className = 'dr-group-master-checkbox';
        masterCheckbox.dataset.groupId = group.groupId.toString();

        const masterId = `dr_servicegroup_${group.groupId}`;
        masterCheckbox.id = masterId;

        const label = document.createElement('label');
        label.htmlFor = masterId;
        label.textContent = group.groupName;

        header.append(toggle, masterCheckbox, label);

        const items = buildGroupItems(group, masterCheckbox);
        items.classList.add('collapsed');

        // Auf-/zuklappen – nur wenn nicht auf Checkbox oder Label geklickt wurde
        header.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target.tagName !== 'LABEL' && target.tagName !== 'INPUT') {
                items.classList.toggle('collapsed');
                header.classList.toggle('collapsed');
            }
        });

        // Klick auf die Master-Checkbox darf das Aufklappen nicht auslösen
        masterCheckbox.addEventListener('click', event => event.stopPropagation());

        // Master-Checkbox: alle Dienste der Gruppe setzen
        masterCheckbox.addEventListener('change', () => {
            items.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
                .forEach(cb => { cb.checked = masterCheckbox.checked; });
        });

        container.append(header, items);
    });
}

/**
 * Baut den Container mit den Einzel-Checkboxen einer Dienstgruppe.
 * Ist eine Master-Checkbox übergeben, wird deren Zustand bei jeder Änderung
 * mitgeführt (inkl. indeterminate bei Teilauswahl).
 */
function buildGroupItems(
    group: ServiceCheckboxGroup,
    masterCheckbox: HTMLInputElement | null
): HTMLDivElement {
    const items = document.createElement('div');
    items.className = 'dr-service-group-items';

    group.services.forEach(service => {
        const item = document.createElement('div');
        item.className = 'dr-service-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = service.id.toString();
        checkbox.id = `dr_service_${service.id}`;

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = service.name;

        item.append(checkbox, label);

        // Ganzes Feld klickbar
        item.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target.tagName !== 'LABEL' && target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        if (masterCheckbox) {
            checkbox.addEventListener('change', () => {
                const all = Array.from(
                    items.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
                );
                const checked = all.filter(cb => cb.checked).length;

                if (checked === 0) {
                    masterCheckbox.checked = false;
                    masterCheckbox.indeterminate = false;
                } else if (checked === all.length) {
                    masterCheckbox.checked = true;
                    masterCheckbox.indeterminate = false;
                } else {
                    masterCheckbox.checked = false;
                    masterCheckbox.indeterminate = true;
                }
            });
        }

        items.appendChild(item);
    });

    return items;
}

/** IDs aller aktuell angehakten Dienste. */
export function getSelectedServiceIds(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value, 10))
        .filter(id => !Number.isNaN(id));
}

/** Setzt alle Dienst-Checkboxen zurück. */
export function clearServiceCheckboxes(container: HTMLElement): void {
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach(cb => {
            cb.checked = false;
            cb.indeterminate = false;
        });
}

/** Setzt ein Datumsfeld relativ zum heutigen Tag in die Vergangenheit. */
export function setDateFrom(input: HTMLInputElement, monthsAgo: number): void {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    input.valueAsDate = date;
}

/** Setzt ein Datumsfeld relativ zum heutigen Tag in die Zukunft. */
export function setDateTo(input: HTMLInputElement, monthsAhead: number): void {
    const date = new Date();
    date.setMonth(date.getMonth() + monthsAhead);
    input.valueAsDate = date;
}

/**
 * Setzt den Standard-Zeitraum und markiert die passenden Schnellauswahl-Buttons.
 * `fromMonths`/`toMonths` müssen zu den `data-months`-Werten im Markup passen.
 */
export function setDefaultDateRange(
    root: ParentNode,
    fromInput: HTMLInputElement,
    toInput: HTMLInputElement,
    fromMonths = 6,
    toMonths = 3
): void {
    setDateFrom(fromInput, fromMonths);
    setDateTo(toInput, toMonths);

    root.querySelectorAll<HTMLElement>('.dr-quick-from').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.months === String(fromMonths));
    });
    root.querySelectorAll<HTMLElement>('.dr-quick-to').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.months === String(toMonths));
    });
}

/**
 * Verdrahtet die Schnelldatum-Buttons (`.dr-quick-from` / `.dr-quick-to`).
 * Gibt eine Aufräumfunktion zurück, damit beim Seitenwechsel keine
 * Listener zurückbleiben.
 */
export function initQuickDateButtons(
    root: ParentNode,
    options: { fromInput: HTMLInputElement; toInput: HTMLInputElement }
): () => void {
    const { fromInput, toInput } = options;
    const cleanups: Array<() => void> = [];

    function bind(
        selector: string,
        target: HTMLInputElement,
        apply: (input: HTMLInputElement, months: number) => void
    ): void {
        root.querySelectorAll<HTMLElement>(selector).forEach(btn => {
            const handler = (event: Event) => {
                event.preventDefault();

                // currentTarget statt target: robust, falls der Button mal ein Icon enthält
                const el = event.currentTarget as HTMLElement;
                const months = parseInt(el.dataset.months || '0', 10);

                apply(target, months);

                root.querySelectorAll<HTMLElement>(selector)
                    .forEach(other => other.classList.remove('active'));
                el.classList.add('active');
            };

            btn.addEventListener('click', handler);
            cleanups.push(() => btn.removeEventListener('click', handler));
        });
    }

    bind('.dr-quick-from', fromInput, setDateFrom);
    bind('.dr-quick-to', toInput, setDateTo);

    return () => cleanups.forEach(fn => fn());
}