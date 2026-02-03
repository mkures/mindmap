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

    function measure(id) {
        const node = map.nodes[id];
        const textWidth = node.text.length * CHAR_WIDTH;
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

        if (!node.children.length) {
            heights[id] = node.h;
            return heights[id];
        }
        let total = 0;
        node.children.forEach(c => {
            total += measure(c);
        });
        total += V_GAP * (node.children.length - 1);
        heights[id] = Math.max(node.h, total);
        return heights[id];
    }

    measure(map.rootId);

    function place(id, depth, centerY) {
        const node = map.nodes[id];
        node.depth = depth;
        const colorIndex = Math.min(depth, colors.length - 1);
        node.color = colors[colorIndex] || colors[colors.length - 1] || '#ffffff';

        // Calculate x based on previous nodes' actual widths
        if (depth === 0) {
            node.x = 0;
        } else {
            const parent = map.nodes[node.parentId];
            node.x = parent.x + parent.w + H_GAP;
        }

        node.y = centerY - node.h / 2;
        if (!node.children.length) return;
        let total = 0;
        node.children.forEach(c => total += heights[c]);
        total += V_GAP * (node.children.length - 1);
        let start = centerY - total / 2;
        node.children.forEach(c => {
            const h = heights[c];
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
