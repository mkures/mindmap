// Cache for existing DOM elements
let linkGroup = null;
let nodeGroup = null;
const nodeElements = new Map();
const linkElements = new Map();

export function render(map, svg, selectedId) {
    const settings = map.settings || {};

    // Initialize groups if needed (first render or after clear)
    if (!linkGroup || !svg.contains(linkGroup)) {
        svg.innerHTML = '';
        linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        linkGroup.id = 'links';
        svg.appendChild(linkGroup);
        nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.id = 'nodes';
        svg.appendChild(nodeGroup);
        nodeElements.clear();
        linkElements.clear();
    }

    // Build set of visible nodes (not hidden by collapsed ancestors)
    const visibleNodeIds = new Set();
    function collectVisible(nodeId) {
        const node = map.nodes[nodeId];
        if (!node) return;
        visibleNodeIds.add(nodeId);
        if (node.collapsed) return; // Don't traverse children of collapsed nodes
        for (const childId of (node.children || [])) {
            collectVisible(childId);
        }
    }
    collectVisible(map.rootId);

    const currentNodeIds = visibleNodeIds;
    const currentLinkIds = new Set();

    // Update or create links (only for visible nodes)
    for (const id of visibleNodeIds) {
        const node = map.nodes[id];
        if (node.parentId) {
            const parent = map.nodes[node.parentId];
            // Skip if parent doesn't exist or positions are invalid
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

    // Remove old links
    for (const [linkId, path] of linkElements) {
        if (!currentLinkIds.has(linkId)) {
            path.remove();
            linkElements.delete(linkId);
        }
    }

    // Update or create nodes (only visible ones)
    for (const id of visibleNodeIds) {
        const node = map.nodes[id];
        // Skip nodes with invalid coordinates (from circular references or corruption)
        if (!isFinite(node.x) || !isFinite(node.y)) continue;

        let g = nodeElements.get(id);

        if (!g) {
            // Create new node element
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('node');
            g.setAttribute('data-id', id);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            g.appendChild(rect);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('alignment-baseline', 'middle');
            g.appendChild(text);

            nodeGroup.appendChild(g);
            nodeElements.set(id, g);
        }

        // Update transform
        g.setAttribute('transform', `translate(${node.x},${node.y})`);

        // Update selection state
        g.classList.toggle('selected', id === selectedId);

        // Update rect
        const rect = g.querySelector('rect');
        rect.setAttribute('width', node.w);
        rect.setAttribute('height', node.h);
        if (node.color) {
            rect.style.fill = node.color;
        }

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

        // Update text with multi-line support
        const text = g.querySelector('text');
        text.setAttribute('x', offset);
        if (settings.fontFamily) {
            text.setAttribute('font-family', settings.fontFamily);
        }
        if (settings.fontSize) {
            text.setAttribute('font-size', settings.fontSize);
        }

        // Clear existing tspans
        text.innerHTML = '';

        const lines = node._lines || [node.text];
        const lineHeight = 20;
        // Center text block vertically: first line at center minus half of total block height
        const startY = node.h / 2 - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, i) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', offset);
            tspan.setAttribute('y', startY + i * lineHeight);
            tspan.setAttribute('dominant-baseline', 'middle');
            tspan.textContent = line;
            text.appendChild(tspan);
        });

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
            // Show count of hidden children
            const countText = collapseIndicator.querySelector('text');
            countText.textContent = node.children.length;
        } else if (collapseIndicator) {
            collapseIndicator.remove();
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

// Function to clear cache (useful when loading a new map)
export function clearRenderCache() {
    linkGroup = null;
    nodeGroup = null;
    nodeElements.clear();
    linkElements.clear();
}
