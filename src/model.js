const DEFAULT_LEVEL_COLORS = ['#ffffff', '#ff6f59', '#f6bd60', '#43aa8b', '#577590', '#d7263d', '#06d6a0'];
const DEFAULT_FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_AUTOSAVE_DELAY = 1200;
const MIN_AUTOSAVE_DELAY = 200;

export function ensureSettings(map) {
    if (!map.settings) {
        map.settings = {
            levelColors: [...DEFAULT_LEVEL_COLORS],
            fontFamily: DEFAULT_FONT_FAMILY,
            fontSize: DEFAULT_FONT_SIZE,
            autosaveDelay: DEFAULT_AUTOSAVE_DELAY
        };
    } else {
        if (!Array.isArray(map.settings.levelColors) || !map.settings.levelColors.length) {
            map.settings.levelColors = [...DEFAULT_LEVEL_COLORS];
        }
        if (!map.settings.fontFamily) {
            map.settings.fontFamily = DEFAULT_FONT_FAMILY;
        }
        const parsedFontSize = Number(map.settings.fontSize);
        map.settings.fontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0
            ? parsedFontSize
            : DEFAULT_FONT_SIZE;
        const parsedAutosaveDelay = Number(map.settings.autosaveDelay);
        map.settings.autosaveDelay = Number.isFinite(parsedAutosaveDelay) && parsedAutosaveDelay >= MIN_AUTOSAVE_DELAY
            ? parsedAutosaveDelay
            : DEFAULT_AUTOSAVE_DELAY;
    }
    return map;
}

export const DEFAULTS = {
    levelColors: DEFAULT_LEVEL_COLORS,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    autosaveDelay: DEFAULT_AUTOSAVE_DELAY
};

export { MIN_AUTOSAVE_DELAY };

export function createEmptyMap() {
    const rootId = 'n1';
    const map = {
        id: 'map-' + Date.now(),
        title: 'MindMap',
        rootId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        nodes: {
            [rootId]: { id: rootId, parentId: null, text: 'Root', children: [], color: '#ffffff' }
        }
    };
    return ensureSettings(map);
}

// Generate a unique node ID that doesn't collide with existing nodes
function generateNodeId(map) {
    let counter = Object.keys(map.nodes).length + 1;
    let id = 'n' + counter;
    while (map.nodes[id]) {
        counter++;
        id = 'n' + counter;
    }
    return id;
}

export function addChild(map, parentId) {
    ensureSettings(map);
    const id = generateNodeId(map);
    map.nodes[id] = { id, parentId, text: 'Node', children: [], color: map.nodes[parentId] ? map.nodes[parentId].color : map.settings.levelColors[0] };
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

export function isDescendant(map, ancestorId, maybeDescendantId) {
    if (ancestorId === maybeDescendantId) return true;
    const node = map.nodes[ancestorId];
    if (!node) return false;
    for (const childId of node.children) {
        if (childId === maybeDescendantId) return true;
        if (isDescendant(map, childId, maybeDescendantId)) return true;
    }
    return false;
}

export function reparentNode(map, nodeId, newParentId) {
    if (nodeId === map.rootId) return false;
    const node = map.nodes[nodeId];
    const newParent = map.nodes[newParentId];
    if (!node || !newParent) return false;
    if (node.parentId === newParentId) return false;
    if (isDescendant(map, nodeId, newParentId)) return false;
    const oldParent = map.nodes[node.parentId];
    if (!oldParent) return false;
    oldParent.children = oldParent.children.filter(id => id !== nodeId);
    newParent.children.push(nodeId);
    node.parentId = newParentId;
    map.updatedAt = Date.now();
    return true;
}

export function moveSibling(map, nodeId, offset) {
    const node = map.nodes[nodeId];
    if (!node) return false;
    const parent = map.nodes[node.parentId];
    if (!parent) return false;
    const siblings = parent.children;
    const index = siblings.indexOf(nodeId);
    if (index === -1) return false;
    const newIndex = index + offset;
    if (newIndex < 0 || newIndex >= siblings.length) return false;
    siblings.splice(index, 1);
    siblings.splice(newIndex, 0, nodeId);
    map.updatedAt = Date.now();
    return true;
}

// Copy a node and all its descendants (returns a standalone subtree object)
export function copySubtree(map, nodeId) {
    const node = map.nodes[nodeId];
    if (!node) return null;

    const subtree = {
        nodes: {},
        rootId: nodeId
    };

    function cloneNode(id) {
        const n = map.nodes[id];
        if (!n) return;
        subtree.nodes[id] = {
            id: n.id,
            parentId: n.parentId,
            text: n.text,
            children: [...(n.children || [])],
            color: n.color,
            side: n.side
        };
        if (n.media) {
            subtree.nodes[id].media = { ...n.media };
        }
        for (const childId of (n.children || [])) {
            cloneNode(childId);
        }
    }

    cloneNode(nodeId);
    return subtree;
}

// Paste a copied subtree as children of targetId
export function pasteSubtree(map, subtree, targetId) {
    if (!subtree || !subtree.nodes || !subtree.rootId) return null;
    if (!map.nodes[targetId]) return null;

    // Create ID mapping from old IDs to new IDs
    const idMap = {};
    for (const oldId of Object.keys(subtree.nodes)) {
        idMap[oldId] = generateNodeId(map);
        // Reserve the ID in the map temporarily
        map.nodes[idMap[oldId]] = {};
    }

    // Clone nodes with new IDs
    const newRootId = idMap[subtree.rootId];
    for (const [oldId, oldNode] of Object.entries(subtree.nodes)) {
        const newId = idMap[oldId];
        const newParentId = oldId === subtree.rootId
            ? targetId
            : idMap[oldNode.parentId];

        map.nodes[newId] = {
            id: newId,
            parentId: newParentId,
            text: oldNode.text,
            children: (oldNode.children || []).map(cid => idMap[cid]),
            color: oldNode.color
        };
        if (oldNode.media) {
            map.nodes[newId].media = { ...oldNode.media };
        }
    }

    // Add new root to target's children
    map.nodes[targetId].children.push(newRootId);
    map.updatedAt = Date.now();

    return newRootId;
}

// Set which side a root child appears on ('left' or 'right')
export function setNodeSide(map, nodeId, side) {
    const node = map.nodes[nodeId];
    if (!node) return false;
    if (node.parentId !== map.rootId) return false;
    node.side = side;
    map.updatedAt = Date.now();
    return true;
}

// Toggle collapsed state of a node
export function toggleCollapse(map, nodeId) {
    const node = map.nodes[nodeId];
    if (!node) return false;
    // Only allow collapse if node has children
    if (!node.children || node.children.length === 0) return false;
    node.collapsed = !node.collapsed;
    map.updatedAt = Date.now();
    return true;
}
