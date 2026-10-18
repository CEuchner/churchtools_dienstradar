import {
    renderServiceCheckboxes,
    setDefaultDateRange,
    type ServiceCheckboxGroup,
} from '../../components/form-controls';
import type { AutocompleteSuggestion } from '../../components/autocomplete';
import type { Service } from '../../utils/ct-types';
import { state, type InactivityElements, type InactivePersonData } from './state';
import { isServiceVisible } from './visibility';
import { NO_EMAIL_PLACEHOLDER } from './search';

/** Vorschläge für das Gruppen-Autocomplete. */
export function getGroupSuggestions(
    filterText: string,
    excludeGroupId?: string
): AutocompleteSuggestion[] {
    const filter = filterText.trim().toLowerCase();

    return state.groups
        .filter(group => {
            if (excludeGroupId && group.id.toString() === excludeGroupId) return false;
            if (!filter) return true;
            return (group.name || '').toLowerCase().includes(filter);
        })
        .map(group => ({
            id: group.id.toString(),
            label: group.name || 'Unbenannte Gruppe',
        }));
}

/** Baut die Dienste-Auswahl aus den sichtbaren Diensten, gruppiert nach Dienstgruppe. */
export function populateServiceCheckboxes(elements: InactivityElements): void {
    const visibleServices = state.services.filter(isServiceVisible);

    const grouped = new Map<number | undefined, Service[]>();
    visibleServices.forEach(service => {
        const key = service.serviceGroupId;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(service);
    });

    // Dienstgruppen alphabetisch, Dienste ohne Dienstgruppe ans Ende
    const sortedIds = Array.from(grouped.keys()).sort((a, b) => {
        if (a === undefined) return 1;
        if (b === undefined) return -1;

        const nameA = state.serviceGroups.find(g => g.id === a)?.name || '';
        const nameB = state.serviceGroups.find(g => g.id === b)?.name || '';
        return nameA.localeCompare(nameB);
    });

    const groups: ServiceCheckboxGroup[] = sortedIds.map(groupId => ({
        groupId,
        groupName:
            groupId === undefined
                ? ''
                : state.serviceGroups.find(g => g.id === groupId)?.name ||
                  'Unbekannte Dienstgruppe',
        services: (grouped.get(groupId) || []).map(service => ({
            id: service.id,
            name: service.name || 'Unbenannter Dienst',
        })),
    }));

    renderServiceCheckboxes(elements.serviceCheckboxes, groups);
}

/** Setzt den Standard-Zeitraum (6 Monate zurück bis 3 Monate voraus). */
export function setDefaultDates(elements: InactivityElements): void {
    setDefaultDateRange(elements.root, elements.dateFrom, elements.dateTo, 6, 12);
}

/** Synchronisiert die "Alle auswählen"-Checkbox mit der Auswahl im State. */
export function updateSelectAllState(elements: InactivityElements): void {
    const total = state.inactivePersons.length;
    const selected = state.inactivePersons.filter(person => person.selected).length;

    elements.selectAllResults.disabled = total === 0;
    elements.selectAllResults.checked = total > 0 && selected === total;
    elements.selectAllResults.indeterminate = selected > 0 && selected < total;
}

/** Baut die Karte einer Person inklusive Auswahl-Checkbox. */
function buildPersonCard(data: InactivePersonData, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'dr-inactivity-person-card';

    const info = document.createElement('div');
    info.className = 'dr-inactivity-person-info';

    const name = document.createElement('h3');
    name.textContent = `${data.person.firstName} ${data.person.lastName}`;
    info.appendChild(name);

    const contact = document.createElement('p');
    if (data.person.email && data.person.email !== NO_EMAIL_PLACEHOLDER) {
        const link = document.createElement('a');
        // Kein encodeURIComponent: das würde das @ in %40 umwandeln und
        // manche Mail-Clients öffnen den Link dann nicht.
        link.href = `mailto:${data.person.email}`;
        link.textContent = data.person.email;
        contact.appendChild(link);
    } else {
        contact.textContent = 'Keine E-Mail';
    }
    info.appendChild(contact);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'dr-inactivity-person-checkbox';
    checkbox.dataset.index = index.toString();
    checkbox.checked = data.selected;

    card.append(info, checkbox);

    // Ganze Karte klickbar, außer auf Link und Checkbox selbst
    card.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        if (target.tagName !== 'LABEL' && target.tagName !== 'INPUT' && target.tagName !== 'A') {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    checkbox.addEventListener('change', () => {
        state.inactivePersons[index].selected = checkbox.checked;
        updateSelectAllState(elementsRef!);
    });

    return card;
}

/**
 * Referenz auf die Seitenelemente für die Checkbox-Handler.
 * Wird in `displayResults` gesetzt – die Handler werden erst danach benutzt.
 */
let elementsRef: InactivityElements | null = null;

/** Stellt die Ergebnisliste dar. */
export function displayResults(
    elements: InactivityElements,
    persons: InactivePersonData[]
): void {
    elementsRef = elements;
    state.inactivePersons = persons;

    elements.resultCount.textContent = persons.length.toString();
    elements.personList.replaceChildren();

    if (persons.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'dr-empty';
        empty.textContent = 'Keine inaktiven Personen gefunden';
        elements.personList.appendChild(empty);
    } else {
        persons.forEach((data, index) => {
            elements.personList.appendChild(buildPersonCard(data, index));
        });
    }

    updateSelectAllState(elements);
    elements.resultsSection.classList.add('is-visible');
}

/** Blendet die Ergebnisliste aus und leert die Auswahl. */
export function hideResults(elements: InactivityElements): void {
    elements.resultsSection.classList.remove('is-visible');
    elements.personList.replaceChildren();
    elements.resultCount.textContent = '0';
    state.inactivePersons = [];
}