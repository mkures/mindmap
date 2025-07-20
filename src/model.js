export function createEmptyMap() {
    const rootId = 'n1';
    return {
        id: 'map-' + Date.now(),
        title: 'MindMap',
        rootId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        nodes: {
            [rootId]: { id: rootId, parentId: null, text: 'Root', children: [] }
        }
    };
}

export function addChild(map, parentId) {
    const id = 'n' + (Object.keys(map.nodes).length + 1);
    map.nodes[id] = { id, parentId, text: 'Node', children: [] };
    map.nodes[parentId].children.push(id);
    map.updatedAt = Date.now();
    return id;
}

export function addSibling(map, nodeId) {
    const parentId = map.nodes[nodeId].parentId;
    if (parentId === null) return null;
    return addChild(map, parentId);
}

export function deleteNode(map, nodeId) {
    const node = map.nodes[nodeId];
    if (!node || nodeId === map.rootId) return;
    const parent = map.nodes[node.parentId];
    parent.children = parent.children.filter(id => id !== nodeId);
    function removeSubtree(id) {
        map.nodes[id].children.forEach(removeSubtree);
        delete map.nodes[id];
    }
    removeSubtree(nodeId);
    map.updatedAt = Date.now();
}
