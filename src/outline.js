/**
 * Outline view — mobile-friendly tree + cards list
 * Exported: initOutline(map, containerEl, callbacks)
 * Call renderOutline(map) to refresh after data changes.
 */

let _map = null;
let _container = null;
let _callbacks = null;

export function initOutline(map, container, callbacks) {
    _map = map;
    _container = container;
    _callbacks = callbacks;
    renderOutline();
}

export function renderOutline(map) {
    if (map) _map = map;
    if (!_map || !_container) return;
    _container.innerHTML = '';

    // Tree section
    const treeSection = document.createElement('div');
    treeSection.className = 'outline-section';
    const treeHeader = document.createElement('div');
    treeHeader.className = 'outline-section-title';
    treeHeader.textContent = 'Carte mentale';
    treeSection.appendChild(treeHeader);
    const treeList = document.createElement('ul');
    treeList.className = 'outline-tree';
    renderTreeNode(_map.rootId, treeList, 0);
    treeSection.appendChild(treeList);
    _container.appendChild(treeSection);

    // Cards section
    const cards = Object.values(_map.nodes).filter(n => n.nodeType === 'card');
    if (cards.length > 0) {
        const cardsSection = document.createElement('div');
        cardsSection.className = 'outline-section';
        const cardsHeader = document.createElement('div');
        cardsHeader.className = 'outline-section-title';
        cardsHeader.textContent = 'Cards';
        cardsSection.appendChild(cardsHeader);
        cards.forEach(card => {
            const item = document.createElement('div');
            item.className = 'outline-card-item';
            const title = document.createElement('span');
            title.className = 'outline-card-title';
            title.textContent = card.text || 'Sans titre';
            const preview = document.createElement('p');
            preview.className = 'outline-card-preview';
            preview.textContent = (card.body || '').slice(0, 80) + ((card.body || '').length > 80 ? '…' : '');
            item.appendChild(title);
            item.appendChild(preview);
            item.addEventListener('click', () => {
                if (_callbacks?.onSelectNode) _callbacks.onSelectNode(card.id);
            });
            cardsSection.appendChild(item);
        });
        _container.appendChild(cardsSection);
    }

    // Free bubbles section
    const bubbles = Object.values(_map.nodes).filter(n => n.placement === 'free' && n.nodeType !== 'card');
    if (bubbles.length > 0) {
        const bubblesSection = document.createElement('div');
        bubblesSection.className = 'outline-section';
        const bubblesHeader = document.createElement('div');
        bubblesHeader.className = 'outline-section-title';
        bubblesHeader.textContent = 'Notes libres';
        bubblesSection.appendChild(bubblesHeader);
        bubbles.forEach(bubble => {
            const item = document.createElement('div');
            item.className = 'outline-bubble-item';
            item.textContent = bubble.text || '';
            item.style.borderLeft = `3px solid ${bubble.color || '#fef3c7'}`;
            item.addEventListener('click', () => {
                if (_callbacks?.onSelectNode) _callbacks.onSelectNode(bubble.id);
            });
            bubblesSection.appendChild(item);
        });
        _container.appendChild(bubblesSection);
    }

    // Quick-add bar at bottom
    const quickAdd = document.createElement('div');
    quickAdd.className = 'outline-quick-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'outline-quick-input';
    input.placeholder = 'Ajouter un nœud enfant à la racine…';
    const addBtn = document.createElement('button');
    addBtn.className = 'outline-quick-btn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        if (_callbacks?.onAddChild) _callbacks.onAddChild(_map.rootId, text);
        input.value = '';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn.click();
    });
    quickAdd.appendChild(input);
    quickAdd.appendChild(addBtn);
    _container.appendChild(quickAdd);
}

function renderTreeNode(nodeId, parentEl, depth) {
    if (!_map || depth > 20) return;
    const node = _map.nodes[nodeId];
    if (!node || node.placement === 'free') return;

    const li = document.createElement('li');
    li.className = 'outline-item';
    li.style.paddingLeft = (depth * 16) + 'px';

    const row = document.createElement('div');
    row.className = 'outline-item-row';

    const dot = document.createElement('span');
    dot.className = 'outline-dot';
    dot.style.background = node.color || '#ccc';

    const text = document.createElement('span');
    text.className = 'outline-item-text';
    text.textContent = node.text || '';

    // Tag dots
    const nodeTags = node.tags || [];
    const tagDefs = (_map.settings && _map.settings.tags) || [];

    row.appendChild(dot);
    row.appendChild(text);
    nodeTags.forEach(tagId => {
        const def = tagDefs.find(t => t.id === tagId);
        if (!def) return;
        const tagDot = document.createElement('span');
        tagDot.className = 'outline-tag-dot';
        tagDot.style.background = def.color || '#94a3b8';
        tagDot.title = def.name;
        row.appendChild(tagDot);
    });

    row.addEventListener('click', () => {
        if (_callbacks?.onSelectNode) _callbacks.onSelectNode(nodeId);
    });

    li.appendChild(row);
    parentEl.appendChild(li);

    if (!node.collapsed) {
        (node.children || []).forEach(childId => {
            renderTreeNode(childId, parentEl, depth + 1);
        });
    }
}
