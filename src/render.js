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

let frameGroup = null;
let frameOverlayGroup = null;
const frameElements = new Map();
const frameOverlayElements = new Map();
let _selectedFrameId = null;

const FRAME_STROKE = {
    '#dbeafe': '#93c5fd',
    '#dcfce7': '#86efac',
    '#fef9c3': '#fde047',
    '#fce7f3': '#f9a8d4',
    '#ede9fe': '#c4b5fd',
    '#f3f4f6': '#d1d5db',
};

const FRAME_TITLE_COLOR = {
    '#dbeafe': '#1e40af',
    '#dcfce7': '#166534',
    '#fef9c3': '#854d0e',
    '#fce7f3': '#9d174d',
    '#ede9fe': '#5b21b6',
    '#f3f4f6': '#374151',
};

export function setSelectedFrameId(id) {
    _selectedFrameId = id;
}

export function render(map, svg, selectedId) {
    const settings = map.settings || {};

    // Initialize groups if needed (first render or after clear)
    if (!linkGroup || !svg.contains(linkGroup)) {
        svg.innerHTML = '';

        frameGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        frameGroup.id = 'frames';
        svg.appendChild(frameGroup);

        linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        linkGroup.id = 'links';
        svg.appendChild(linkGroup);

        freeLinkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        freeLinkGroup.id = 'free-links';
        svg.appendChild(freeLinkGroup);

        nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.id = 'nodes';
        svg.appendChild(nodeGroup);

        frameOverlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        frameOverlayGroup.id = 'frame-overlays';
        svg.appendChild(frameOverlayGroup);

        nodeElements.clear();
        linkElements.clear();
        freeLinkElements.clear();
        frameElements.clear();
        frameOverlayElements.clear();
        arrowMarkerCreated = false;
    }

    // Render frames (background layer)
    renderFrames(map);

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

    // Include free nodes and their subtrees
    Object.values(map.nodes).forEach(n => {
        if (n.placement === 'free' && n.fx != null && n.fy != null) {
            collectVisible(n.id);
        }
    });

    const currentNodeIds = visibleNodeIds;
    const currentLinkIds = new Set();

    // Update or create tree links (only for tree-placed visible nodes)
    for (const id of visibleNodeIds) {
        const node = map.nodes[id];
        if (node.parentId && !(node.placement === 'free' && node.fx != null)) {
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

        let g = nodeElements.get(id);

        if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('node');
            g.setAttribute('data-id', id);

            if (node.placement === 'free') g.classList.add('free-node');
            buildBubbleElement(g);

            nodeGroup.appendChild(g);
            nodeElements.set(id, g);
        }

        // Update transform
        g.setAttribute('transform', `translate(${node.x},${node.y})`);

        // Update selection state
        g.classList.toggle('selected', id === selectedId);

        updateBubbleElement(g, node, settings, id === selectedId);
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
    const rect = g.querySelector('rect');
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
        img.setAttribute('data-original-url', node.media.originalDataUrl || node.media.dataUrl);
        img.setAttribute('width', node.media.width);
        img.setAttribute('height', node.media.height);
        img.setAttribute('x', 5);
        img.setAttribute('y', (node.h - node.media.height) / 2);
        if (!img._hasClickListener) {
            img._hasClickListener = true;
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', e => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('mindmap:image-click', {
                    detail: { dataUrl: img.getAttribute('data-original-url') || img.getAttribute('href') }
                }));
            });
        }
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

    // Note indicator
    let noteIcon = g.querySelector('.note-icon');
    if (node.body) {
        if (!noteIcon) {
            noteIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            noteIcon.classList.add('note-icon');
            noteIcon.setAttribute('font-size', '10');
            noteIcon.setAttribute('text-anchor', 'end');
            noteIcon.setAttribute('dominant-baseline', 'hanging');
            noteIcon.textContent = '✎';
            g.appendChild(noteIcon);
        }
        noteIcon.setAttribute('x', node.w - 4);
        noteIcon.setAttribute('y', 3);
        noteIcon.setAttribute('fill', '#6366f1');
        noteIcon.setAttribute('pointer-events', 'none');
    } else if (noteIcon) {
        noteIcon.remove();
    }

    // Task indicator
    let taskIcon = g.querySelector('.task-icon');
    if (node.tasks && node.tasks.length > 0) {
        const doneCount = node.tasks.filter(t => t.done).length;
        const total = node.tasks.length;
        const allDone = doneCount === total;
        if (!taskIcon) {
            taskIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            taskIcon.classList.add('task-icon');
            taskIcon.setAttribute('font-size', '9');
            taskIcon.setAttribute('dominant-baseline', 'hanging');
            taskIcon.setAttribute('pointer-events', 'none');
            g.appendChild(taskIcon);
        }
        taskIcon.textContent = allDone ? '✓' + total : doneCount + '/' + total;
        taskIcon.setAttribute('x', node.body ? node.w - 30 : node.w - 4);
        taskIcon.setAttribute('y', 3);
        taskIcon.setAttribute('text-anchor', 'end');
        taskIcon.setAttribute('fill', allDone ? '#22c55e' : '#f59e0b');
    } else if (taskIcon) {
        taskIcon.remove();
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

// ── Frame rendering ──────────────────────────────────────────────────────────

function renderFrames(map) {
    if (!frameGroup) return;
    const frames = map.frames || [];
    const currentFrameIds = new Set();

    for (const frame of frames) {
        currentFrameIds.add(frame.id);

        // Background layer (behind nodes)
        let g = frameElements.get(frame.id);
        if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('frame');
            g.setAttribute('data-frame-id', frame.id);

            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bg.classList.add('frame-bg');
            bg.setAttribute('rx', '12');
            bg.setAttribute('ry', '12');
            g.appendChild(bg);

            frameGroup.appendChild(g);
            frameElements.set(frame.id, g);
        }

        g.setAttribute('transform', `translate(${frame.x},${frame.y})`);
        g.classList.toggle('selected', frame.id === _selectedFrameId);

        const stroke = FRAME_STROKE[frame.color] || '#cbd5e1';

        const bg = g.querySelector('.frame-bg');
        bg.setAttribute('width', frame.w);
        bg.setAttribute('height', frame.h);
        bg.setAttribute('fill', frame.color || '#dbeafe');
        bg.setAttribute('fill-opacity', '0.35');
        bg.setAttribute('stroke', stroke);
        bg.setAttribute('stroke-width', '1.5');
        bg.setAttribute('stroke-dasharray', '6 3');

        // Overlay layer (above nodes) — title + resize handle
        let ov = frameOverlayElements.get(frame.id);
        if (!ov) {
            ov = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ov.classList.add('frame');
            ov.setAttribute('data-frame-id', frame.id);

            const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            titleEl.classList.add('frame-title');
            ov.appendChild(titleEl);

            const resizeHandle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            resizeHandle.classList.add('frame-resize-handle');
            resizeHandle.setAttribute('width', '16');
            resizeHandle.setAttribute('height', '16');
            resizeHandle.setAttribute('rx', '2');
            ov.appendChild(resizeHandle);

            frameOverlayGroup.appendChild(ov);
            frameOverlayElements.set(frame.id, ov);
        }

        ov.setAttribute('transform', `translate(${frame.x},${frame.y})`);
        ov.classList.toggle('selected', frame.id === _selectedFrameId);

        const titleEl = ov.querySelector('.frame-title');
        titleEl.setAttribute('x', '12');
        titleEl.setAttribute('y', '-14');
        titleEl.setAttribute('font-size', '26');
        titleEl.setAttribute('font-weight', '600');
        titleEl.setAttribute('fill', FRAME_TITLE_COLOR[frame.color] || '#374151');
        titleEl.textContent = frame.title || 'Zone';

        const resizeHandle = ov.querySelector('.frame-resize-handle');
        resizeHandle.setAttribute('x', frame.w - 16);
        resizeHandle.setAttribute('y', frame.h - 16);
    }

    // Remove stale frames
    for (const [id, g] of frameElements) {
        if (!currentFrameIds.has(id)) {
            g.remove();
            frameElements.delete(id);
        }
    }
    for (const [id, ov] of frameOverlayElements) {
        if (!currentFrameIds.has(id)) {
            ov.remove();
            frameOverlayElements.delete(id);
        }
    }
}

// Function to clear cache (useful when loading a new map)
export function clearRenderCache() {
    linkGroup = null;
    nodeGroup = null;
    freeLinkGroup = null;
    frameGroup = null;
    frameOverlayGroup = null;
    frameElements.clear();
    frameOverlayElements.clear();
    _selectedFrameId = null;
    arrowMarkerCreated = false;
    nodeElements.clear();
    linkElements.clear();
    freeLinkElements.clear();
    _selectedLinkId = null;
}
