/**
 * Command palette — Ctrl+K fuzzy search over all available actions
 */

let _palette = null;
let _actions = [];
let _onAction = null;

export function initCommandPalette(actions, onAction) {
    _actions = actions;
    _onAction = onAction;
}

export function openCommandPalette() {
    if (_palette) { closeCommandPalette(); return; }

    _palette = document.createElement('div');
    _palette.className = 'cmd-palette';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cmd-palette-input';
    input.placeholder = 'Rechercher une action…';
    _palette.appendChild(input);

    const list = document.createElement('div');
    list.className = 'cmd-palette-list';
    _palette.appendChild(list);

    let selectedIdx = 0;

    function renderList(query) {
        const q = (query || '').toLowerCase().trim();
        const filtered = q
            ? _actions.filter(a => a.label.toLowerCase().includes(q) || (a.shortcut || '').toLowerCase().includes(q))
            : _actions;
        list.innerHTML = '';
        selectedIdx = 0;
        filtered.forEach((action, i) => {
            const item = document.createElement('div');
            item.className = 'cmd-palette-item' + (i === 0 ? ' active' : '');
            const label = document.createElement('span');
            label.className = 'cmd-palette-label';
            label.textContent = action.label;
            item.appendChild(label);
            if (action.shortcut) {
                const kbd = document.createElement('span');
                kbd.className = 'cmd-palette-kbd';
                kbd.textContent = action.shortcut;
                item.appendChild(kbd);
            }
            item.addEventListener('click', () => {
                closeCommandPalette();
                if (_onAction) _onAction(action);
                else action.fn?.();
            });
            item.addEventListener('mouseenter', () => {
                list.querySelectorAll('.cmd-palette-item.active').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                selectedIdx = i;
            });
            list.appendChild(item);
        });
        return filtered;
    }

    let currentFiltered = renderList('');

    input.addEventListener('input', () => {
        currentFiltered = renderList(input.value);
    });

    input.addEventListener('keydown', e => {
        const items = list.querySelectorAll('.cmd-palette-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[selectedIdx]?.classList.remove('active');
            selectedIdx = (selectedIdx + 1) % items.length;
            items[selectedIdx]?.classList.add('active');
            items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[selectedIdx]?.classList.remove('active');
            selectedIdx = (selectedIdx - 1 + items.length) % items.length;
            items[selectedIdx]?.classList.add('active');
            items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const action = currentFiltered[selectedIdx];
            if (action) {
                closeCommandPalette();
                if (_onAction) _onAction(action);
                else action.fn?.();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeCommandPalette();
        }
    });

    document.body.appendChild(_palette);
    input.focus();

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('mousedown', paletteOutsideClick);
    }, 0);
}

function paletteOutsideClick(e) {
    if (_palette && !_palette.contains(e.target)) {
        closeCommandPalette();
    }
}

export function closeCommandPalette() {
    if (_palette) {
        _palette.remove();
        _palette = null;
    }
    document.removeEventListener('mousedown', paletteOutsideClick);
}
