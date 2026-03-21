/**
 * Outline view — unified tree-first plan with inline note previews
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

    // ── Header bar with export button ──
    const header = document.createElement('div');
    header.className = 'outline-header';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'outline-header-title';
    headerTitle.textContent = _map.title || 'Plan';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'outline-export-btn';
    exportBtn.textContent = 'Exporter MD';
    exportBtn.addEventListener('click', () => {
        if (_callbacks?.onExportMd) _callbacks.onExportMd();
    });
    header.appendChild(headerTitle);
    header.appendChild(exportBtn);
    _container.appendChild(header);

    // ── Single unified list ──
    const list = document.createElement('ul');
    list.className = 'outline-tree';

    // 1. Tree nodes (root + children, depth-first)
    renderTreeNode(_map.rootId, list, 0);

    // 2. Free bubbles and cards as top-level peers
    const freeNodes = Object.values(_map.nodes).filter(n =>
        n.placement === 'free' || (n.fx != null && n.id !== _map.rootId && !hasTreeParent(n))
    );
    freeNodes.forEach(node => {
        const li = document.createElement('li');
        li.className = 'outline-item';

        const row = document.createElement('div');
        row.className = 'outline-item-row';

        const icon = document.createElement('span');
        if (node.nodeType === 'card') {
            icon.className = 'outline-icon outline-icon-card';
            icon.textContent = '▪';
        } else {
            icon.className = 'outline-dot';
            icon.style.background = node.color || '#fef3c7';
            icon.style.borderRadius = '3px';
        }

        const text = document.createElement('span');
        text.className = 'outline-item-text';
        text.textContent = node.text || 'Sans titre';
        if (node.nodeType === 'card') text.style.fontWeight = '600';

        row.appendChild(icon);
        row.appendChild(text);
        appendTagDots(row, node);

        row.addEventListener('click', () => {
            if (_callbacks?.onSelectNode) _callbacks.onSelectNode(node.id);
        });

        li.appendChild(row);

        // Note/body preview for free nodes
        const body = node.body || node.note;
        if (body) {
            li.appendChild(buildNotePreview(body));
        }

        list.appendChild(li);

        // Render children of free nodes (free roots can have children)
        if (node.children && node.children.length > 0) {
            node.children.forEach(childId => {
                renderTreeNode(childId, list, 1);
            });
        }
    });

    _container.appendChild(list);

    // ── Quick-add bar at bottom ──
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

/** Check if a node is part of the tree (has a non-free ancestor chain to root) */
function hasTreeParent(node) {
    if (!_map) return false;
    let current = node;
    const visited = new Set();
    while (current && current.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = _map.nodes[current.parentId];
        if (!parent) return false;
        if (parent.id === _map.rootId) return true;
        current = parent;
    }
    return false;
}

function renderTreeNode(nodeId, parentEl, depth) {
    if (!_map || depth > 20) return;
    const node = _map.nodes[nodeId];
    if (!node) return;
    // Skip free nodes (they're rendered separately as peers)
    if (node.placement === 'free' && node.id !== _map.rootId) return;

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
    if (depth === 0) text.style.fontWeight = '600';

    row.appendChild(dot);
    row.appendChild(text);
    appendTagDots(row, node);

    row.addEventListener('click', () => {
        if (_callbacks?.onSelectNode) _callbacks.onSelectNode(nodeId);
    });

    li.appendChild(row);

    // Note preview
    const body = node.body || node.note;
    if (body) {
        li.appendChild(buildNotePreview(body));
    }

    parentEl.appendChild(li);

    if (!node.collapsed) {
        (node.children || []).forEach(childId => {
            renderTreeNode(childId, parentEl, depth + 1);
        });
    }
}

function appendTagDots(row, node) {
    const nodeTags = node.tags || [];
    const tagDefs = (_map.settings && _map.settings.tags) || [];
    nodeTags.forEach(tagId => {
        const def = tagDefs.find(t => t.id === tagId);
        if (!def) return;
        const tagDot = document.createElement('span');
        tagDot.className = 'outline-tag-dot';
        tagDot.style.background = def.color || '#94a3b8';
        tagDot.title = def.name;
        row.appendChild(tagDot);
    });
}

function buildNotePreview(body) {
    const preview = document.createElement('div');
    preview.className = 'outline-note-preview';
    const truncated = body.length > 120 ? body.slice(0, 120) + '…' : body;
    preview.textContent = truncated;
    return preview;
}
