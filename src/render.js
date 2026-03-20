// Cache for existing DOM elements
let linkGroup = null;
let nodeGroup = null;
let freeLinkGroup = null;
const nodeElements = new Map();
const linkElements = new Map();
const freeLinkElements = new Map();

let _selectedLinkId = null;

export function setSelectedLinkId(id) {
    _selectedLinkId = id;
}

export function render(map, svg, selectedId) {
    const settings = map.settings || {};

    // Initialize groups if needed (first render or after clear)
    if (!linkGroup || !svg.contains(linkGroup)) {
        svg.innerHTML = '';
        linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        linkGroup.id = 'links';
        svg.appendChild(linkGroup);

        freeLinkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        freeLinkGroup.id = 'free-links';
        svg.appendChild(freeLinkGroup);

        nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.id = 'nodes';
        svg.appendChild(nodeGroup);

        nodeElements.clear();
        linkElements.clear();
        freeLinkElements.clear();
    }

    // Build set of visible nodes:
    // - tree nodes via collectVisible from root
    // - free nodes (placement === 'free') always visible if positioned
    const visibleNodeIds = new Set();

    function collectVisible(nodeId) {
        const node = map.nodes[nodeId];
        if (!node) return;
        visibleNodeIds.add(nodeId);
        if (node.collapsed) return;
        for (const childId of (node.children || [])) {
            collectVisible(childId);
        }
    }
    collectVisible(map.rootId);

    // Include free nodes
    Object.values(map.nodes).forEach(n => {
        if (n.placement === 'free' && n.fx != null && n.fy != null) {
            visibleNodeIds.add(n.id);
        }
    });

    const currentNodeIds = visibleNodeIds;
    const currentLinkIds = new Set();

    // Update or create tree links (only for tree-placed visible nodes)
    for (const id of visibleNodeIds) {
        const node = map.nodes[id];
        if (node.parentId && node.placement !== 'free') {
            const parent = map.nodes[node.parentId];
            if (!parent || !isFinite(node.x) || !isFinite(parent.x)) continue;

            const linkId = `${node.parentId}-${id}`;
            currentLinkIds.add(linkId);

            let x1, y1, x2, y2;
            if (node.direction === 'left') {
                x1 = parent.x;
                y1 = parent.y + parent.h / 2;
                x2 = node.x + node.w;
                y2 = node.y + node.h / 2;
            } else {
                x1 = parent.x + parent.w;
                y1 = parent.y + parent.h / 2;
                x2 = node.x;
                y2 = node.y + node.h / 2;
            }
            const curvature = Math.max(40, Math.abs(x2 - x1) / 2);
            const d = node.direction === 'left'
                ? `M${x1},${y1} C${x1 - curvature},${y1} ${x2 + curvature},${y2} ${x2},${y2}`
                : `M${x1},${y1} C${x1 + curvature},${y1} ${x2 - curvature},${y2} ${x2},${y2}`;

            let path = linkElements.get(linkId);
            if (!path) {
                path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.classList.add('link');
                linkGroup.appendChild(path);
                linkElements.set(linkId, path);
            }
            path.setAttribute('d', d);
        }
    }

    // Remove old tree links
    for (const [linkId, path] of linkElements) {
        if (!currentLinkIds.has(linkId)) {
            path.remove();
            linkElements.delete(linkId);
        }
    }

    // Render free links (between any two nodes)
    renderFreeLinks(map);

    // Update or create nodes (visible ones)
    for (const id of visibleNodeIds) {
        const node = map.nodes[id];
        if (!isFinite(node.x) || !isFinite(node.y)) continue;

        const isCard = node.nodeType === 'card';
        let g = nodeElements.get(id);

        // If node type changed (bubble ↔ card), recreate the element
        const existingIsCard = g?.classList.contains('card-node');
        if (g && isCard !== existingIsCard) {
            g.remove();
            nodeElements.delete(id);
            g = null;
        }

        if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('node');
            g.setAttribute('data-id', id);

            if (isCard) {
                g.classList.add('card-node');
                buildCardElement(g, id);
            } else {
                if (node.placement === 'free') g.classList.add('free-node');
                buildBubbleElement(g);
            }

            nodeGroup.appendChild(g);
            nodeElements.set(id, g);
        }

        // Update transform
        g.setAttribute('transform', `translate(${node.x},${node.y})`);

        // Update selection state
        g.classList.toggle('selected', id === selectedId);

        if (isCard) {
            updateCardElement(g, node, settings);
        } else {
            updateBubbleElement(g, node, settings, id === selectedId);
        }
    }

    // Remove old nodes
    for (const [id, g] of nodeElements) {
        if (!currentNodeIds.has(id)) {
            g.remove();
            nodeElements.delete(id);
        }
    }
}

// ── Bubble rendering ────────────────────────────────────────────────────────

function buildBubbleElement(g) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    g.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('alignment-baseline', 'middle');
    g.appendChild(text);
}

function updateBubbleElement(g, node, settings, isSelected) {
    const rect = g.querySelector('rect:not(.card-bg)');
    rect.setAttribute('width', node.w);
    rect.setAttribute('height', node.h);
    if (node.color) rect.style.fill = node.color;

    // Handle image
    let img = g.querySelector('image');
    let offset = 10;

    if (node.media && node.media.kind === 'image') {
        if (!img) {
            img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            g.insertBefore(img, g.querySelector('text'));
        }
        img.setAttribute('href', node.media.dataUrl);
        img.setAttribute('width', node.media.width);
        img.setAttribute('height', node.media.height);
        img.setAttribute('x', 5);
        img.setAttribute('y', (node.h - node.media.height) / 2);
        offset += node.media.width + 5;
    } else if (img) {
        img.remove();
    }

    // Update text
    const text = g.querySelector('text');
    text.setAttribute('x', offset);
    if (settings.fontFamily) text.setAttribute('font-family', settings.fontFamily);
    if (settings.fontSize) text.setAttribute('font-size', settings.fontSize);

    text.innerHTML = '';
    const lines = node._lines || [node.text];
    const lineHeight = 20;
    const startY = node.h / 2 - (lines.length - 1) * lineHeight / 2;

    lines.forEach((line, i) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', offset);
        tspan.setAttribute('y', startY + i * lineHeight);
        tspan.setAttribute('dominant-baseline', 'middle');
        tspan.textContent = line;
        text.appendChild(tspan);
    });

    // Render tag dots (small colored circles at bottom-left of node)
    let existingDots = Array.from(g.querySelectorAll('.tag-dot'));
    const nodeTags = node.tags || [];
    const tagDefs = settings.tags || [];
    existingDots.forEach(d => d.remove());
    if (nodeTags.length > 0) {
        let xOff = 6;
        const yOff = node.h - 5;
        nodeTags.forEach(tagId => {
            const def = tagDefs.find(t => t.id === tagId);
            if (!def) return;
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.classList.add('tag-dot');
            dot.setAttribute('r', 4);
            dot.setAttribute('cx', xOff);
            dot.setAttribute('cy', yOff);
            dot.setAttribute('fill', def.color || '#94a3b8');
            g.appendChild(dot);
            xOff += 11;
        });
    }

    // Collapse indicator
    let collapseIndicator = g.querySelector('.collapse-indicator');
    const hasChildren = node.children && node.children.length > 0;

    if (hasChildren && node.collapsed) {
        if (!collapseIndicator) {
            collapseIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            collapseIndicator.classList.add('collapse-indicator');

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('r', 10);
            circle.setAttribute('fill', '#666');
            collapseIndicator.appendChild(circle);

            const plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            plus.setAttribute('text-anchor', 'middle');
            plus.setAttribute('dominant-baseline', 'middle');
            plus.setAttribute('fill', '#fff');
            plus.setAttribute('font-size', '14');
            plus.setAttribute('font-weight', 'bold');
            plus.textContent = '+';
            collapseIndicator.appendChild(plus);

            g.appendChild(collapseIndicator);
        }
        const collapseX = node.direction === 'left' ? -15 : node.w + 15;
        collapseIndicator.setAttribute('transform', `translate(${collapseX},${node.h / 2})`);
        const countText = collapseIndicator.querySelector('text');
        countText.textContent = node.children.length;
    } else if (collapseIndicator) {
        collapseIndicator.remove();
    }
}

// ── Card rendering ──────────────────────────────────────────────────────────

function buildCardElement(g, nodeId) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('card-bg');
    rect.setAttribute('rx', 8);
    rect.setAttribute('ry', 8);
    g.appendChild(rect);

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.classList.add('card-fo');

    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('span');
    title.className = 'card-title';

    const toggle = document.createElement('button');
    toggle.className = 'card-toggle';
    toggle.textContent = '▼';
    toggle.type = 'button';

    header.appendChild(title);
    header.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'card-body collapsed';

    cardContent.appendChild(header);
    cardContent.appendChild(body);
    fo.appendChild(cardContent);
    g.appendChild(fo);

    // Dispatch custom events (caught by main.js)
    toggle.addEventListener('click', e => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('mindmap:card-toggle', {
            detail: { nodeId: g.dataset.id }
        }));
    });

    title.addEventListener('click', e => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('mindmap:card-title-click', {
            detail: { nodeId: g.dataset.id, titleEl: title }
        }));
    });

    body.addEventListener('dblclick', e => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('mindmap:card-body-dblclick', {
            detail: { nodeId: g.dataset.id }
        }));
    });

    // Card selection: clicking anywhere on the card triggers selection
    cardContent.addEventListener('click', e => {
        document.dispatchEvent(new CustomEvent('mindmap:card-select', {
            detail: { nodeId: g.dataset.id }
        }));
    });

    // Card drag via header (primary drag handle)
    header.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('mindmap:card-drag-start', {
            detail: { nodeId: g.dataset.id, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }
        }));
    });

    // Prevent mousedown on body from bubbling to SVG drag handler (allow text selection)
    body.addEventListener('mousedown', e => {
        e.stopPropagation();
    });
}

function updateCardElement(g, node, settings) {
    const cardWidth = node.cardWidth || 280;
    const fo = g.querySelector('.card-fo');
    const rect = g.querySelector('.card-bg');

    fo.setAttribute('width', cardWidth);
    if (rect) rect.setAttribute('width', cardWidth);

    const cardContent = fo.querySelector('.card-content');
    const titleEl = cardContent.querySelector('.card-title');
    const toggleEl = cardContent.querySelector('.card-toggle');
    const bodyEl = cardContent.querySelector('.card-body');

    // Update title
    if (!titleEl._editing) {
        titleEl.textContent = node.text;
    }

    // Render tag pills in card header
    let tagBar = g.querySelector('.card-tag-bar');
    const nodeTags2 = node.tags || [];
    const tagDefs2 = (settings && settings.tags) || [];
    if (nodeTags2.length > 0) {
        if (!tagBar) {
            tagBar = document.createElement('div');
            tagBar.className = 'card-tag-bar';
            const header = g.querySelector('.card-header');
            if (header) header.after(tagBar);
        }
        tagBar.innerHTML = '';
        nodeTags2.forEach(tagId => {
            const def = tagDefs2.find(t => t.id === tagId);
            if (!def) return;
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.textContent = def.name;
            pill.style.background = def.color || '#94a3b8';
            tagBar.appendChild(pill);
        });
    } else if (tagBar) {
        tagBar.remove();
    }

    // Update toggle
    toggleEl.classList.toggle('expanded', !!node.cardExpanded);

    // Update body markdown (cached)
    if (!bodyEl._editing) {
        if (node.body !== node._bodyRaw) {
            node._bodyRaw = node.body;
            if (node.body && typeof marked !== 'undefined') {
                node._bodyHtml = marked.parse(node.body, { breaks: true, gfm: true });
            } else {
                node._bodyHtml = node.body ? escapeHtml(node.body).replace(/\n/g, '<br>') : '';
            }
        }
        bodyEl.innerHTML = node._bodyHtml ||
            '<span class="card-body-placeholder">Double-clic pour éditer…</span>';
    }

    // Expanded/collapsed class
    bodyEl.className = 'card-body ' + (node.cardExpanded ? 'expanded' : 'collapsed');

    // Measure height after browser layout and update
    requestAnimationFrame(() => {
        if (!cardContent.isConnected) return;
        const h = cardContent.offsetHeight || 120;
        if (Math.abs(h - (node.h || 0)) > 2) {
            node.h = h;
            fo.setAttribute('height', h);
            if (rect) rect.setAttribute('height', h);
        }
    });

    // Set tentative height immediately so rect shows something
    const currentH = node.h || 120;
    fo.setAttribute('height', currentH);
    if (rect) rect.setAttribute('height', currentH);
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Free links rendering ────────────────────────────────────────────────────

// SVG marker for arrowhead (created once)
let arrowMarkerCreated = false;

function ensureArrowMarker(svg) {
    if (arrowMarkerCreated) return;
    arrowMarkerCreated = true;
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#94a3b8');
    marker.appendChild(polygon);
    defs.appendChild(marker);
}

function getEdgePoint(node, otherNode) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const ocx = otherNode.x + otherNode.w / 2;
    // const ocy = otherNode.y + otherNode.h / 2;

    if (ocx < cx) {
        return { x: node.x, y: cy };
    } else {
        return { x: node.x + node.w, y: cy };
    }
}

function renderFreeLinks(map) {
    if (!freeLinkGroup) return;
    const links = map.links || [];
    const currentFreeLinkIds = new Set();

    ensureArrowMarker(freeLinkGroup.ownerSVGElement || freeLinkGroup.closest('svg'));

    for (const link of links) {
        const fromNode = map.nodes[link.from];
        const toNode = map.nodes[link.to];
        if (!fromNode || !toNode) continue;
        if (!isFinite(fromNode.x) || !isFinite(toNode.x)) continue;

        currentFreeLinkIds.add(link.id);

        const p1 = getEdgePoint(fromNode, toNode);
        const p2 = getEdgePoint(toNode, fromNode);

        const dx = p2.x - p1.x;
        const curvature = Math.max(40, Math.abs(dx) / 2);
        const d = `M${p1.x},${p1.y} C${p1.x + Math.sign(dx) * curvature},${p1.y} ${p2.x - Math.sign(dx) * curvature},${p2.y} ${p2.x},${p2.y}`;

        let g = freeLinkElements.get(link.id);
        if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('free-link');
            g.setAttribute('data-link-id', link.id);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('free-link-path');
            path.setAttribute('stroke-dasharray', '6 3');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrowhead)');

            // Wider invisible hit area for clicking
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.classList.add('free-link-hit');
            hitPath.setAttribute('fill', 'none');
            hitPath.setAttribute('stroke', 'black');
            hitPath.setAttribute('stroke-opacity', '0');
            hitPath.setAttribute('stroke-width', '12');
            hitPath.setAttribute('pointer-events', 'stroke');

            g.appendChild(hitPath);
            g.appendChild(path);

            // Label text
            const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            labelText.classList.add('free-link-label');
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('dominant-baseline', 'middle');
            g.appendChild(labelText);

            freeLinkGroup.appendChild(g);
            freeLinkElements.set(link.id, g);
        }

        const path = g.querySelector('.free-link-path');
        const hitPath = g.querySelector('.free-link-hit');
        const labelText = g.querySelector('.free-link-label');

        path.setAttribute('d', d);
        path.setAttribute('stroke', link.color || '#94a3b8');
        hitPath.setAttribute('d', d);

        // Position label at midpoint
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        labelText.setAttribute('x', mx);
        labelText.setAttribute('y', my - 8);
        labelText.textContent = link.label || '';

        // Selected state
        g.classList.toggle('selected', link.id === _selectedLinkId);
    }

    // Remove stale free links
    for (const [id, g] of freeLinkElements) {
        if (!currentFreeLinkIds.has(id)) {
            g.remove();
            freeLinkElements.delete(id);
        }
    }
}

// Function to clear cache (useful when loading a new map)
export function clearRenderCache() {
    linkGroup = null;
    nodeGroup = null;
    freeLinkGroup = null;
    arrowMarkerCreated = false;
    nodeElements.clear();
    linkElements.clear();
    freeLinkElements.clear();
    _selectedLinkId = null;
}
