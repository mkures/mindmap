const DEFAULT_LEVEL_COLORS = ['#ffffff', '#ff6f59', '#f6bd60', '#43aa8b', '#577590', '#d7263d', '#06d6a0'];
const DEFAULT_FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 14;

export function ensureSettings(map) {
    if (!map.settings) {
        map.settings = {
            levelColors: [...DEFAULT_LEVEL_COLORS],
            fontFamily: DEFAULT_FONT_FAMILY,
            fontSize: DEFAULT_FONT_SIZE
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
    }
    return map;
}

export const DEFAULTS = {
    levelColors: DEFAULT_LEVEL_COLORS,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE
};

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

export function addChild(map, parentId) {
    ensureSettings(map);
    const id = 'n' + (Object.keys(map.nodes).length + 1);
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
