const MIN_NODE_W = 80;
const MAX_NODE_W = 200;
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

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = testLine.length * CHAR_WIDTH;

        if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

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

    function place(id, depth, centerY) {
        if (placed.has(id)) return;
        placed.add(id);

        const node = map.nodes[id];
        if (!node) return;

        node.depth = depth;
        const colorIndex = Math.min(depth, colors.length - 1);
        node.color = colors[colorIndex] || colors[colors.length - 1] || '#ffffff';

        // Calculate x based on previous nodes' actual widths
        if (depth === 0) {
            node.x = 0;
        } else {
            const parent = map.nodes[node.parentId];
            node.x = parent ? parent.x + parent.w + H_GAP : 0;
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
            place(c, depth + 1, childCenter);
            start += h + V_GAP;
        });
    }

    place(map.rootId, 0, 0);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(map.nodes).forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
    });
    const offsetX = -(minX + maxX) / 2;
    const offsetY = -(minY + maxY) / 2;
    Object.values(map.nodes).forEach(n => {
        n.x += offsetX;
        n.y += offsetY;
    });
}
