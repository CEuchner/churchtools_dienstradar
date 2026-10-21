/**
 * Wiederverwendbares Eingabefeld mit Vorschlagsliste.
 *
 * Die Komponente kennt keine Daten – sie fragt über `getSuggestions` nach
 * Vorschlägen und meldet Auswahlen über `onSelect` zurück. Damit lässt sie
 * sich für Gruppensuche, Zielgruppensuche und künftige Zwecke nutzen.
 *
 * `destroy()` entfernt ALLE Listener inklusive des document-Klick-Handlers –
 * wichtig, weil der Router Seiten mehrfach aufbauen kann.
 */

export interface AutocompleteSuggestion {
    id: string;
    label: string;
}

export interface AutocompleteOptions {
    input: HTMLInputElement;
    list: HTMLElement;
    /** Liefert die Vorschläge für den aktuellen Suchtext. */
    getSuggestions: (filterText: string) => AutocompleteSuggestion[];
    /** Wird bei Auswahl (Maus oder Enter) aufgerufen. */
    onSelect: (id: string, label: string) => void;
    /** Wird bei jedem Tastendruck im Feld aufgerufen – z. B. Auswahl zurücksetzen. */
    onInput?: () => void;
    /** Text, wenn die Suche keine Treffer liefert. */
    emptyText?: string;
}

export interface AutocompleteInstance {
    close: () => void;
    destroy: () => void;
}

const ITEM_CLASS = 'dr-autocomplete-item';

export function createAutocomplete(options: AutocompleteOptions): AutocompleteInstance {
    const { input, list, getSuggestions, onSelect, onInput, emptyText = 'Keine Treffer' } = options;

    function resetActive(): void {
        list.dataset.activeIndex = '-1';
        list.querySelectorAll(`.${ITEM_CLASS}.active`).forEach(el => el.classList.remove('active'));
    }

    function close(): void {
        list.classList.remove('is-open');
        list.replaceChildren();
        resetActive();
    }

    function render(filterText: string): void {
        const suggestions = getSuggestions(filterText);
        list.replaceChildren();

        if (suggestions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dr-autocomplete-empty';
            empty.textContent = emptyText;
            list.appendChild(empty);
        } else {
            suggestions.forEach(suggestion => {
                const item = document.createElement('div');
                item.className = ITEM_CLASS;
                item.textContent = suggestion.label;
                item.dataset.id = suggestion.id;
                list.appendChild(item);
            });
        }

        list.classList.add('is-open');
    }

    function setActive(index: number): void {
        const items = Array.from(list.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`));
        items.forEach(item => item.classList.remove('active'));

        const item = items[index];
        if (!item) return;

        item.classList.add('active');
        list.dataset.activeIndex = index.toString();

        // Aktiven Eintrag in den sichtbaren Bereich holen
        const itemTop = item.offsetTop;
        const itemBottom = itemTop + item.offsetHeight;
        const listTop = list.scrollTop;
        const listBottom = listTop + list.clientHeight;

        if (itemTop < listTop) {
            list.scrollTop = itemTop;
        } else if (itemBottom > listBottom) {
            list.scrollTop = itemBottom - list.clientHeight;
        }
    }

    function handleKeydown(event: KeyboardEvent): void {
        const items = Array.from(list.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`));
        if (items.length === 0) return;

        const currentIndex = parseInt(list.dataset.activeIndex || '-1', 10);

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(currentIndex + 1 >= items.length ? 0 : currentIndex + 1);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(currentIndex - 1 < 0 ? items.length - 1 : currentIndex - 1);
            return;
        }

        if (event.key === 'Enter') {
            const active = items[currentIndex];
            if (active?.dataset.id) {
                event.preventDefault();
                onSelect(active.dataset.id, active.textContent ?? '');
                close();
            }
            return;
        }

        if (event.key === 'Escape') {
            close();
        }
    }

    function handleInput(): void {
        onInput?.();

        if (input.value.trim() === '') {
            close();
        } else {
            render(input.value);
        }
        resetActive();
    }

    function handleFocus(): void {
        if (input.value.trim() !== '') {
            render(input.value);
        }
    }

    function handleListClick(event: MouseEvent): void {
        const item = (event.target as HTMLElement).closest<HTMLElement>(`.${ITEM_CLASS}`);
        if (!item?.dataset.id) return;

        onSelect(item.dataset.id, item.textContent ?? '');
        close(); 
    }

    function handleDocumentClick(event: MouseEvent): void {
        const target = event.target as Node;
        if (!input.contains(target) && !list.contains(target)) {
            close();
        }
    }

    input.addEventListener('input', handleInput);
    input.addEventListener('focus', handleFocus);
    input.addEventListener('keydown', handleKeydown);
    list.addEventListener('click', handleListClick);
    document.addEventListener('click', handleDocumentClick);

    return {
        close,
        destroy(): void {
            input.removeEventListener('input', handleInput);
            input.removeEventListener('focus', handleFocus);
            input.removeEventListener('keydown', handleKeydown);
            list.removeEventListener('click', handleListClick);
            document.removeEventListener('click', handleDocumentClick);
        },
    };
}