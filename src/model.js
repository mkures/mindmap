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
            autosaveDelay: DEFAULT_AUTOSAVE_DELAY,
            tags: []
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
        if (!Array.isArray(map.settings.tags)) {
            map.settings.tags = [];
        }
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

    // Collect all IDs to be deleted (node + subtree)
    const deletedIds = new Set();
    function collectIds(id) {
        if (!map.nodes[id]) return;
        deletedIds.add(id);
        (map.nodes[id].children || []).forEach(collectIds);
    }
    collectIds(nodeId);

    // Remove from parent's children list (only for tree nodes with a real parent)
    if (node.parentId) {
        const parent = map.nodes[node.parentId];
        if (parent) {
            parent.children = parent.children.filter(id => id !== nodeId);
        }
    }

    // Delete all nodes in subtree
    deletedIds.forEach(id => delete map.nodes[id]);

    // Clean up free links referencing any deleted node
    if (map.links) {
        map.links = map.links.filter(l => !deletedIds.has(l.from) && !deletedIds.has(l.to));
    }

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

// Create a free bubble at absolute SVG coordinates
export function addFreeBubble(map, fx, fy) {
    const id = generateNodeId(map);
    map.nodes[id] = {
        id, parentId: null, text: 'Note', children: [],
        nodeType: 'bubble', placement: 'free',
        fx, fy, color: '#fef3c7'
    };
    map.updatedAt = Date.now();
    return id;
}

// Create a card (markdown note) at absolute SVG coordinates
export function addCard(map, fx, fy) {
    const id = generateNodeId(map);
    map.nodes[id] = {
        id, parentId: null, text: 'Sans titre', children: [],
        nodeType: 'card', placement: 'free',
        fx, fy, color: '#ffffff',
        body: '', cardWidth: 280, cardExpanded: false
    };
    map.updatedAt = Date.now();
    return id;
}

// Convert a free bubble into a card
export function convertToCard(map, nodeId) {
    const node = map.nodes[nodeId];
    if (!node || node.placement !== 'free') return false;
    node.nodeType = 'card';
    node.body = node.body || '';
    node.cardWidth = node.cardWidth || 280;
    node.cardExpanded = false;
    if (node.fx == null) { node.fx = node.x || 0; node.fy = node.y || 0; }
    map.updatedAt = Date.now();
    return true;
}

// Toggle card expanded/collapsed state
export function toggleCardExpanded(map, nodeId) {
    const node = map.nodes[nodeId];
    if (!node || node.nodeType !== 'card') return false;
    node.cardExpanded = !node.cardExpanded;
    map.updatedAt = Date.now();
    return true;
}

// Add a free link between any two nodes
export function addLink(map, fromId, toId, label = '') {
    if (!map.links) map.links = [];
    if (!map.nodes[fromId] || !map.nodes[toId]) return null;
    if (fromId === toId) return null;
    // Avoid duplicate
    if (map.links.some(l => l.from === fromId && l.to === toId)) return null;
    const id = 'l' + Date.now();
    const link = { id, from: fromId, to: toId, label, color: '#94a3b8', style: 'dashed' };
    map.links.push(link);
    map.updatedAt = Date.now();
    return link;
}

// Delete a free link by ID
export function deleteLink(map, linkId) {
    if (!map.links) return;
    map.links = map.links.filter(l => l.id !== linkId);
    map.updatedAt = Date.now();
}

// Tag definitions (in settings.tags)
export function addTagDef(map, name, color) {
    ensureSettings(map);
    const id = 'tag-' + Date.now();
    map.settings.tags.push({ id, name, color: color || '#94a3b8' });
    map.updatedAt = Date.now();
    return id;
}

export function removeTagDef(map, tagId) {
    ensureSettings(map);
    map.settings.tags = map.settings.tags.filter(t => t.id !== tagId);
    Object.values(map.nodes).forEach(n => {
        if (n.tags) n.tags = n.tags.filter(id => id !== tagId);
    });
    map.updatedAt = Date.now();
}

export function toggleNodeTag(map, nodeId, tagId) {
    const node = map.nodes[nodeId];
    if (!node) return;
    if (!node.tags) node.tags = [];
    const idx = node.tags.indexOf(tagId);
    if (idx >= 0) node.tags.splice(idx, 1);
    else node.tags.push(tagId);
    map.updatedAt = Date.now();
}

// ── Frames ────────────────────────────────────────────────────────────────

export function addFrame(map, x, y, w = 400, h = 300) {
    if (!map.frames) map.frames = [];
    const id = 'f' + Date.now();
    const frame = { id, title: 'Zone', color: '#dbeafe', x, y, w, h };
    map.frames.push(frame);
    map.updatedAt = Date.now();
    return frame;
}

export function deleteFrame(map, frameId) {
    if (!map.frames) return;
    map.frames = map.frames.filter(f => f.id !== frameId);
    map.updatedAt = Date.now();
}

export function updateFrame(map, frameId, updates) {
    if (!map.frames) return null;
    const frame = map.frames.find(f => f.id === frameId);
    if (!frame) return null;
    Object.assign(frame, updates);
    map.updatedAt = Date.now();
    return frame;
}

export function getNodesInFrame(map, frameId) {
    const frame = (map.frames || []).find(f => f.id === frameId);
    if (!frame) return [];
    return Object.values(map.nodes).filter(node => {
        if (node.placement !== 'free') return false;
        const cx = (node.fx ?? node.x ?? 0) + (node.w || 0) / 2;
        const cy = (node.fy ?? node.y ?? 0) + (node.h || 0) / 2;
        return cx >= frame.x && cx <= frame.x + frame.w
            && cy >= frame.y && cy <= frame.y + frame.h;
    });
}
