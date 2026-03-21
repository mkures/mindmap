/**
 * Outline view — unified tree-first plan with inline note previews
 * On mobile (≤768px): drill-down mode showing one level at a time with breadcrumbs
 * Exported: initOutline(map, containerEl, callbacks)
 * Call renderOutline(map) to refresh after data changes.
 */

let _map = null;
let _container = null;
let _callbacks = null;
let _drillStack = []; // stack of node IDs for drill-down breadcrumbs

export function isMobileOutline() {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function initOutline(map, container, callbacks) {
    _map = map;
    _container = container;
    _callbacks = callbacks;
    _drillStack = [];
    renderOutline();
}

export function renderOutline(map) {
    if (map) _map = map;
    if (!_map || !_container) return;
    _container.innerHTML = '';

    const mobile = isMobileOutline();

    if (mobile) {
        renderMobileOutline();
    } else {
        renderDesktopOutline();
    }
}

// ── Desktop: original indented tree ──────────────────────────
function renderDesktopOutline() {
    // Header bar with export button
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

    // Single unified list
    const list = document.createElement('ul');
    list.className = 'outline-tree';

    // Tree nodes (root + children, depth-first)
    renderTreeNode(_map.rootId, list, 0);

    // Free bubbles and cards as top-level peers
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

        const body = node.body || node.note;
        if (body) {
            li.appendChild(buildNotePreview(body));
        }

        list.appendChild(li);

        if (node.children && node.children.length > 0) {
            node.children.forEach(childId => {
                renderTreeNode(childId, list, 1);
            });
        }
    });

    _container.appendChild(list);

    // Quick-add bar at bottom
    appendQuickAdd(_map.rootId);
}

// ── Mobile: drill-down one level at a time ───────────────────
function renderMobileOutline() {
    // Determine current focus node
    const focusId = _drillStack.length > 0 ? _drillStack[_drillStack.length - 1] : _map.rootId;
    const focusNode = _map.nodes[focusId];
    if (!focusNode) return;

    // ── Breadcrumbs ──
    const breadcrumb = document.createElement('nav');
    breadcrumb.className = 'mobile-breadcrumb';

    // Build breadcrumb trail
    const trail = buildBreadcrumbTrail(focusId);
    trail.forEach((crumb, i) => {
        if (i > 0) {
            const sep = document.createElement('span');
            sep.className = 'mobile-breadcrumb-sep';
            sep.textContent = '›';
            breadcrumb.appendChild(sep);
        }
        const btn = document.createElement('button');
        btn.className = 'mobile-breadcrumb-btn';
        btn.textContent = truncateText(crumb.text, 15);
        if (i === trail.length - 1) {
            btn.classList.add('active');
        } else {
            btn.addEventListener('click', () => {
                // Navigate back to this level
                const idx = _drillStack.indexOf(crumb.id);
                if (idx >= 0) {
                    _drillStack = _drillStack.slice(0, idx + 1);
                } else {
                    _drillStack = [];
                }
                renderOutline();
            });
        }
        breadcrumb.appendChild(btn);
    });

    _container.appendChild(breadcrumb);

    // ── Current node header ──
    const header = document.createElement('div');
    header.className = 'mobile-node-header';

    // Back button (if not at root)
    if (_drillStack.length > 0) {
        const backBtn = document.createElement('button');
        backBtn.className = 'mobile-back-btn';
        backBtn.textContent = '←';
        backBtn.addEventListener('click', () => {
            _drillStack.pop();
            renderOutline();
        });
        header.appendChild(backBtn);
    }

    const titleEl = document.createElement('h2');
    titleEl.className = 'mobile-node-title';
    titleEl.textContent = focusNode.text || 'Sans titre';
    header.appendChild(titleEl);

    // Edit button for current node text
    const editBtn = document.createElement('button');
    editBtn.className = 'mobile-edit-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Modifier';
    editBtn.addEventListener('click', () => {
        startMobileEdit(titleEl, focusId, 'text');
    });
    header.appendChild(editBtn);

    _container.appendChild(header);

    // ── Current node's note (accordion) ──
    const focusBody = focusNode.body || focusNode.note;
    if (focusBody) {
        _container.appendChild(buildNoteAccordion(focusId, focusBody, true));
    }

    // ── Current node's tasks ──
    if (focusNode.tasks && focusNode.tasks.length > 0) {
        _container.appendChild(buildTaskSection(focusId, focusNode.tasks));
    }

    // ── Unified list: tree children + free nodes as peers ──
    const children = focusNode.children || [];

    // Collect free nodes (only at root level)
    const freeNodes = (focusId === _map.rootId)
        ? Object.values(_map.nodes).filter(n =>
            n.placement === 'free' || (n.fx != null && n.id !== _map.rootId && !hasTreeParent(n)))
        : [];

    const allItems = [
        ...children.map(id => ({ id, type: 'tree' })),
        ...freeNodes.map(n => ({ id: n.id, type: 'free' }))
    ];

    if (allItems.length > 0) {
        const list = document.createElement('ul');
        list.className = 'outline-tree mobile-tree';

        allItems.forEach(({ id: childId, type }) => {
            const child = _map.nodes[childId];
            if (!child) return;

            const li = document.createElement('li');
            li.className = 'outline-item mobile-item';

            const row = document.createElement('div');
            row.className = 'outline-item-row mobile-row';

            // Color dot
            const dot = document.createElement('span');
            dot.className = 'outline-dot';
            dot.style.background = child.color || '#ccc';
            if (type === 'free') dot.style.borderRadius = '3px';
            row.appendChild(dot);

            // Text
            const text = document.createElement('span');
            text.className = 'outline-item-text';
            text.textContent = child.text || 'Sans titre';
            if (child.nodeType === 'card') text.style.fontWeight = '600';
            row.appendChild(text);

            appendTagDots(row, child);

            // Child count + chevron (if has children)
            const childChildren = child.children || [];
            if (childChildren.length > 0) {
                const badge = document.createElement('span');
                badge.className = 'mobile-child-count';
                badge.textContent = childChildren.length;
                row.appendChild(badge);

                const chevron = document.createElement('span');
                chevron.className = 'mobile-chevron';
                chevron.textContent = '›';
                row.appendChild(chevron);
            }

            // Task count indicator
            if (child.tasks && child.tasks.length > 0) {
                const doneCount = child.tasks.filter(t => t.done).length;
                const taskBadge = document.createElement('span');
                taskBadge.className = 'mobile-task-count';
                taskBadge.textContent = `✓ ${doneCount}/${child.tasks.length}`;
                row.appendChild(taskBadge);
            }

            // Note icon indicator
            const childBody = child.body || child.note;
            if (childBody) {
                const noteIcon = document.createElement('span');
                noteIcon.className = 'mobile-note-icon';
                noteIcon.textContent = '📝';
                // Tap note icon to toggle accordion directly
                noteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const accordion = li.querySelector('.mobile-note-accordion');
                    if (accordion) {
                        const isOpen = accordion.classList.toggle('open');
                        const arrow = accordion.querySelector('.mobile-note-arrow');
                        if (arrow) arrow.textContent = isOpen ? '▾' : '▸';
                    }
                });
                row.appendChild(noteIcon);
            }

            // Tap behavior: drill down if has children, toggle note if leaf with note
            row.addEventListener('click', () => {
                if (childChildren.length > 0) {
                    _drillStack.push(childId);
                    renderOutline();
                } else if (childBody) {
                    // Leaf with note: toggle the note accordion
                    const accordion = li.querySelector('.mobile-note-accordion');
                    if (accordion) {
                        const isOpen = accordion.classList.toggle('open');
                        const arrow = accordion.querySelector('.mobile-note-arrow');
                        if (arrow) arrow.textContent = isOpen ? '▾' : '▸';
                    }
                }
            });

            li.appendChild(row);

            // Note accordion (collapsed by default)
            if (childBody) {
                li.appendChild(buildNoteAccordion(childId, childBody, false));
            }

            list.appendChild(li);
        });

        _container.appendChild(list);
    } else {
        const empty = document.createElement('p');
        empty.className = 'mobile-empty';
        empty.textContent = 'Aucun sous-nœud';
        _container.appendChild(empty);
    }

    // Quick-add bar
    appendQuickAdd(focusId);
}

function buildBreadcrumbTrail(nodeId) {
    const trail = [];
    let current = _map.nodes[nodeId];
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        trail.unshift({ id: current.id, text: current.text || 'Sans titre' });
        if (current.parentId && _map.nodes[current.parentId]) {
            current = _map.nodes[current.parentId];
        } else {
            break;
        }
    }
    return trail;
}

function truncateText(text, maxLen) {
    if (!text) return '…';
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function buildNoteAccordion(nodeId, body, startOpen) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mobile-note-accordion' + (startOpen ? ' open' : '');

    const toggle = document.createElement('button');
    toggle.className = 'mobile-note-toggle';
    toggle.innerHTML = '<span class="mobile-note-arrow">' + (startOpen ? '▾' : '▸') + '</span> Note';
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        toggle.querySelector('.mobile-note-arrow').textContent = isOpen ? '▾' : '▸';
    });

    const content = document.createElement('div');
    content.className = 'mobile-note-content';
    if (typeof marked !== 'undefined' && marked.parse) {
        content.innerHTML = marked.parse(body, { breaks: true });
    } else {
        content.textContent = body;
    }

    // Edit note button
    const editNoteBtn = document.createElement('button');
    editNoteBtn.className = 'mobile-note-edit-btn';
    editNoteBtn.textContent = '✎ Modifier la note';
    editNoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_callbacks?.onEditNote) _callbacks.onEditNote(nodeId);
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(content);
    wrapper.appendChild(editNoteBtn);
    return wrapper;
}

function startMobileEdit(titleEl, nodeId, field) {
    const node = _map.nodes[nodeId];
    if (!node) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mobile-inline-edit';
    input.value = node[field] || '';

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
        const newVal = input.value.trim();
        if (newVal && newVal !== node[field]) {
            node[field] = newVal;
            if (_callbacks?.onNodeChanged) _callbacks.onNodeChanged(nodeId);
        }
        renderOutline();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') renderOutline();
    });
}

function appendQuickAdd(parentId) {
    const quickAdd = document.createElement('div');
    quickAdd.className = 'outline-quick-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'outline-quick-input';
    input.placeholder = 'Ajouter un nœud…';
    const addBtn = document.createElement('button');
    addBtn.className = 'outline-quick-btn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        if (_callbacks?.onAddChild) _callbacks.onAddChild(parentId, text);
        input.value = '';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn.click();
    });
    quickAdd.appendChild(input);
    quickAdd.appendChild(addBtn);
    _container.appendChild(quickAdd);
}

// ── Shared helpers ───────────────────────────────────────────

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
    if (node.placement === 'free' && node.id !== _map.rootId) return;

    const li = document.createElement('li');
    li.className = 'outline-item';
    li.style.paddingLeft = (depth * 16) + 'px';

    const row = document.createElement('div');
    row.className = 'outline-item-row';

    // Collapse/expand chevron for nodes with children
    const children = node.children || [];
    if (children.length > 0) {
        const chevron = document.createElement('span');
        chevron.className = 'outline-chevron';
        chevron.textContent = node.collapsed ? '▸' : '▾';
        chevron.addEventListener('click', (e) => {
            e.stopPropagation();
            node.collapsed = !node.collapsed;
            if (_callbacks?.onNodeChanged) _callbacks.onNodeChanged(nodeId);
            renderOutline();
        });
        row.appendChild(chevron);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'outline-chevron-spacer';
        row.appendChild(spacer);
    }

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
        children.forEach(childId => {
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

function buildTaskSection(nodeId, tasks) {
    const section = document.createElement('div');
    section.className = 'mobile-task-section';

    const header = document.createElement('div');
    header.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;';
    const doneCount = tasks.filter(t => t.done).length;
    header.textContent = `Tâches (${doneCount}/${tasks.length})`;
    section.appendChild(header);

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'mobile-task-item' + (task.done ? ' done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = task.done;
        cb.addEventListener('change', () => {
            task.done = !task.done;
            if (_callbacks?.onNodeChanged) _callbacks.onNodeChanged(nodeId);
            renderOutline();
        });

        const text = document.createElement('span');
        text.className = 'mobile-task-item-text';
        text.textContent = task.text;

        item.appendChild(cb);
        item.appendChild(text);
        section.appendChild(item);
    });

    return section;
}

function buildNotePreview(body) {
    const preview = document.createElement('div');
    preview.className = 'outline-note-preview';
    const truncated = body.length > 120 ? body.slice(0, 120) + '…' : body;
    preview.textContent = truncated;
    return preview;
}
