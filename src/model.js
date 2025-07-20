const PALETTE = ['#ff6f59', '#f6bd60', '#43aa8b', '#577590', '#d7263d', '#06d6a0'];

export function createEmptyMap() {
    const rootId = 'n1';
    return {
        id: 'map-' + Date.now(),
        title: 'MindMap',
        rootId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        colorIndex: 0,
        nodes: {
            [rootId]: { id: rootId, parentId: null, text: 'Root', children: [], color: '#ffffff' }
        }
    };
}

export function addChild(map, parentId) {
    const id = 'n' + (Object.keys(map.nodes).length + 1);
    let color = '#ffffff';
    if (parentId === map.rootId) {
        color = PALETTE[map.colorIndex % PALETTE.length];
        map.colorIndex++;
    } else {
        color = map.nodes[parentId].color;
    }
    map.nodes[id] = { id, parentId, text: 'Node', children: [], color };
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

export function setNodeImage(map, nodeId, media) {
    const node = map.nodes[nodeId];
    if (!node) return;
    if (media) node.media = media; else delete node.media;
    map.updatedAt = Date.now();
}
