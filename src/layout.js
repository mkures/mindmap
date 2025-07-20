export const NODE_MIN_W = 80;
export const NODE_TEXT_H = 24; // approximate height of one line
export const NODE_PADDING = 10;
const H_GAP = 60;
const V_GAP = 20;

export function layout(map) {
    const heights = {};

    function measure(id) {
        const node = map.nodes[id];
        const textWidth = Math.max(node.text.length * 8 + NODE_PADDING * 2, NODE_MIN_W);
        const mediaWidth = node.media ? node.media.width + NODE_PADDING * 2 : 0;
        node.w = Math.max(textWidth, mediaWidth, NODE_MIN_W);
        const mediaH = node.media ? node.media.height : 0;
        node.h = NODE_PADDING * 2 + mediaH + (node.media ? NODE_PADDING : 0) + NODE_TEXT_H;
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
        node.x = depth * (NODE_MIN_W + H_GAP);
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
