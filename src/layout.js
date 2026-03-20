const MIN_NODE_W = 80;
const MAX_NODE_W = 280;
const NODE_H = 40;
const LINE_HEIGHT = 20;
const H_GAP = 60;
const V_GAP = 20;
const CHAR_WIDTH = 8; // Approximate character width
const PADDING = 20;

const FALLBACK_COLORS = ['#ffffff', '#ff6f59', '#f6bd60', '#43aa8b', '#577590', '#d7263d', '#06d6a0'];

// Wrap text into lines that fit within maxWidth
function wrapText(text, maxWidth) {
    if (!text) return [''];
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    const maxChars = Math.floor(maxWidth / CHAR_WIDTH);

    for (const word of words) {
        // Hard-break word if it exceeds maxWidth alone
        let remaining = word;
        while (remaining.length > maxChars) {
            if (currentLine) { lines.push(currentLine); currentLine = ''; }
            lines.push(remaining.slice(0, maxChars));
            remaining = remaining.slice(maxChars);
        }
        if (!remaining) continue;

        const testLine = currentLine ? `${currentLine} ${remaining}` : remaining;
        if (testLine.length * CHAR_WIDTH > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = remaining;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length ? lines : [text];
}

export function layout(map) {
    const heights = {};
    const settings = map.settings || {};
    const colors = Array.isArray(settings.levelColors) && settings.levelColors.length
        ? settings.levelColors
        : FALLBACK_COLORS;

    // Track visited nodes to prevent infinite recursion from circular references
    const visited = new Set();

    function measure(id) {
        // Prevent infinite recursion
        if (visited.has(id)) {
            console.warn(`[layout] Circular reference detected at node ${id}`);
            return 40;
        }
        visited.add(id);

        const node = map.nodes[id];
        if (!node) {
            console.warn(`[layout] Node ${id} not found`);
            return 40;
        }

        const textWidth = (node.text || '').length * CHAR_WIDTH;
        const mediaWidth = node.media ? node.media.width + 10 : 0;

        // Calculate width: min of text width or max, plus media
        const contentWidth = Math.min(textWidth, MAX_NODE_W - PADDING);
        node.w = Math.max(MIN_NODE_W, contentWidth + PADDING + mediaWidth);

        // Wrap text and calculate height
        const wrapWidth = MAX_NODE_W - PADDING - mediaWidth;
        node._lines = wrapText(node.text, wrapWidth);
        const textHeight = node._lines.length * LINE_HEIGHT + 10;
        const mediaHeight = node.media ? node.media.height + 10 : 0;

        node.h = Math.max(NODE_H, textHeight, mediaHeight);

        // If collapsed, don't measure children
        if (node.collapsed) {
            heights[id] = node.h;
            return heights[id];
        }

        // Filter valid children (exist and not circular)
        const validChildren = (node.children || []).filter(c => map.nodes[c] && !visited.has(c));

        if (!validChildren.length) {
            heights[id] = node.h;
            return heights[id];
        }
        let total = 0;
        validChildren.forEach(c => {
            total += measure(c);
        });
        total += V_GAP * (validChildren.length - 1);
        heights[id] = Math.max(node.h, total);
        return heights[id];
    }

    measure(map.rootId);

    const placed = new Set();

    function place(id, depth, centerY, direction) {
        if (placed.has(id)) return;
        placed.add(id);

        const node = map.nodes[id];
        if (!node) return;

        node.depth = depth;
        node.direction = direction; // 'right' or 'left'
        const colorIndex = Math.min(depth, colors.length - 1);
        node.color = colors[colorIndex] || colors[colors.length - 1] || '#ffffff';

        // Calculate x based on direction
        if (depth === 0) {
            node.x = 0;
        } else {
            const parent = map.nodes[node.parentId];
            if (direction === 'left') {
                node.x = parent ? parent.x - H_GAP - node.w : 0;
            } else {
                node.x = parent ? parent.x + parent.w + H_GAP : 0;
            }
        }

        node.y = centerY - node.h / 2;

        // Don't place children if collapsed
        if (node.collapsed) return;

        const validChildren = (node.children || []).filter(c => map.nodes[c] && heights[c] && !placed.has(c));
        if (!validChildren.length) return;

        let total = 0;
        validChildren.forEach(c => total += heights[c] || 40);
        total += V_GAP * (validChildren.length - 1);
        let start = centerY - total / 2;
        validChildren.forEach(c => {
            const h = heights[c] || 40;
            const childCenter = start + h / 2;
            place(c, depth + 1, childCenter, direction);
            start += h + V_GAP;
        });
    }

    // Split root children by their stored 'side' property, or auto-assign
    const root = map.nodes[map.rootId];
    if (root) {
        root.depth = 0;
        root.direction = 'right';
        root.x = 0;
        root.y = -root.h / 2;
        const colorIndex = 0;
        root.color = colors[colorIndex] || '#ffffff';
        placed.add(map.rootId);

        if (!root.collapsed) {
            const validChildren = (root.children || []).filter(c => map.nodes[c] && heights[c]);

            // Auto-assign side to children that don't have one yet
            const unassigned = validChildren.filter(c => !map.nodes[c].side);
            if (unassigned.length > 0) {
                const rightCount = validChildren.filter(c => map.nodes[c].side === 'right').length;
                const leftCount = validChildren.filter(c => map.nodes[c].side === 'left').length;
                unassigned.forEach(c => {
                    // Balance: assign to the side with fewer children
                    if (rightCount <= leftCount) {
                        map.nodes[c].side = 'right';
                    } else {
                        map.nodes[c].side = 'left';
                    }
                });
            }

            const rightChildren = validChildren.filter(c => map.nodes[c].side !== 'left');
            const leftChildren = validChildren.filter(c => map.nodes[c].side === 'left');

            // Place right side
            let totalR = 0;
            rightChildren.forEach(c => totalR += heights[c] || 40);
            totalR += V_GAP * Math.max(0, rightChildren.length - 1);
            let startR = -totalR / 2;
            rightChildren.forEach(c => {
                const h = heights[c] || 40;
                place(c, 1, startR + h / 2, 'right');
                startR += h + V_GAP;
            });

            // Place left side
            let totalL = 0;
            leftChildren.forEach(c => totalL += heights[c] || 40);
            totalL += V_GAP * Math.max(0, leftChildren.length - 1);
            let startL = -totalL / 2;
            leftChildren.forEach(c => {
                const h = heights[c] || 40;
                place(c, 1, startL + h / 2, 'left');
                startL += h + V_GAP;
            });
        }
    }

    // Compute bounding box and center from TREE nodes only (skip free nodes)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(map.nodes).forEach(n => {
        if (n.placement === 'free') return;
        if (!isFinite(n.x) || !isFinite(n.y)) return;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.w || 0));
        maxY = Math.max(maxY, n.y + (n.h || 0));
    });

    if (isFinite(minX)) {
        const offsetX = -(minX + maxX) / 2;
        const offsetY = -(minY + maxY) / 2;
        Object.values(map.nodes).forEach(n => {
            if (n.placement === 'free') return;
            n.x += offsetX;
            n.y += offsetY;
        });
    }

    // Layout free nodes — each free root is a mini-tree anchored at (fx, fy)
    Object.values(map.nodes).forEach(freeRoot => {
        if (freeRoot.placement !== 'free') return;
        if (freeRoot.fx == null || freeRoot.fy == null) return;

        const fHeights = {};
        const fVisited = new Set();

        function measureFree(id) {
            if (fVisited.has(id)) return 40;
            fVisited.add(id);
            const node = map.nodes[id];
            if (!node) return 40;
            const textWidth = (node.text || '').length * CHAR_WIDTH;
            const mediaWidth = node.media ? node.media.width + 10 : 0;
            const contentWidth = Math.min(textWidth, MAX_NODE_W - PADDING);
            node.w = Math.max(MIN_NODE_W, contentWidth + PADDING + mediaWidth);
            const wrapWidth = MAX_NODE_W - PADDING - mediaWidth;
            node._lines = wrapText(node.text, wrapWidth);
            const textHeight = node._lines.length * LINE_HEIGHT + 10;
            const mediaHeight = node.media ? node.media.height + 10 : 0;
            node.h = Math.max(NODE_H, textHeight, mediaHeight);
            if (node.collapsed) { fHeights[id] = node.h; return node.h; }
            const kids = (node.children || []).filter(c => map.nodes[c] && !fVisited.has(c));
            if (!kids.length) { fHeights[id] = node.h; return node.h; }
            let total = kids.reduce((s, c) => s + measureFree(c), 0) + V_GAP * (kids.length - 1);
            fHeights[id] = Math.max(node.h, total);
            return fHeights[id];
        }

        measureFree(freeRoot.id);

        const fPlaced = new Set();

        function placeFree(id, depth, centerY) {
            if (fPlaced.has(id)) return;
            fPlaced.add(id);
            const node = map.nodes[id];
            if (!node) return;
            node.depth = depth;
            node.direction = 'right';
            const colorIndex = Math.min(depth, colors.length - 1);
            node.color = colors[colorIndex] || colors[colors.length - 1] || '#ffffff';
            if (depth === 0) {
                node.x = 0;
            } else {
                const parent = map.nodes[node.parentId];
                node.x = parent ? parent.x + parent.w + H_GAP : 0;
            }
            node.y = centerY - node.h / 2;
            if (node.collapsed) return;
            const kids = (node.children || []).filter(c => map.nodes[c] && fHeights[c] && !fPlaced.has(c));
            if (!kids.length) return;
            let total = kids.reduce((s, c) => s + (fHeights[c] || 40), 0) + V_GAP * (kids.length - 1);
            let start = centerY - total / 2;
            kids.forEach(c => {
                const h = fHeights[c] || 40;
                placeFree(c, depth + 1, start + h / 2);
                start += h + V_GAP;
            });
        }

        placeFree(freeRoot.id, 0, 0);

        // Offset all placed nodes so the free root lands at (fx, fy)
        fPlaced.forEach(id => {
            const node = map.nodes[id];
            if (node) { node.x += freeRoot.fx; node.y += freeRoot.fy; }
        });
    });
}
