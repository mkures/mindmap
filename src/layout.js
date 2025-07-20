const NODE_W = 100;
const NODE_H = 40;
const V_GAP = 20;

export function layout(map) {
    let y = 0;
    function dfs(id, depth) {
        const node = map.nodes[id];
        node.x = depth * (NODE_W + 40);
        node.y = y;
        node.w = NODE_W;
        node.h = NODE_H;
        y += NODE_H + V_GAP;
        node.children.forEach(childId => dfs(childId, depth + 1));
    }
    dfs(map.rootId, 0);
}
