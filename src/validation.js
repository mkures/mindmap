export function validateMapStructure(map) {
    if (!map || typeof map !== 'object') {
        return { valid: false, reason: 'Carte manquante ou illisible.' };
    }
    if (typeof map.rootId !== 'string' || !map.rootId.trim()) {
        return { valid: false, reason: 'Identifiant de racine manquant.' };
    }
    if (!map.nodes || typeof map.nodes !== 'object') {
        return { valid: false, reason: 'Structure des nœuds absente.' };
    }
    const nodes = map.nodes;
    const rootId = map.rootId;
    if (!nodes[rootId]) {
        return { valid: false, reason: `Nœud racine « ${rootId} » introuvable.` };
    }
    if (!Object.keys(nodes).length) {
        return { valid: false, reason: 'La carte ne contient aucun nœud.' };
    }
    for (const [id, node] of Object.entries(nodes)) {
        if (!node || typeof node !== 'object') {
            return { valid: false, reason: `Nœud « ${id} » invalide.` };
        }
        if (!Array.isArray(node.children)) {
            return { valid: false, reason: `Nœud « ${id} » : la liste des enfants est invalide.` };
        }
        for (const childId of node.children) {
            if (typeof childId !== 'string' || !childId.trim()) {
                return { valid: false, reason: `Nœud « ${id} » : identifiant d'enfant invalide.` };
            }
            if (!nodes[childId]) {
                return { valid: false, reason: `Nœud « ${id} » : enfant « ${childId} » introuvable.` };
            }
        }
        if (node.parentId == null) {
            if (id !== rootId) {
                return { valid: false, reason: `Nœud « ${id} » : parent absent (seul le nœud racine peut ne pas en avoir).` };
            }
        } else {
            if (typeof node.parentId !== 'string' || !node.parentId.trim()) {
                return { valid: false, reason: `Nœud « ${id} » : identifiant de parent invalide.` };
            }
            const parentNode = nodes[node.parentId];
            if (!parentNode) {
                return { valid: false, reason: `Nœud « ${id} » : parent « ${node.parentId} » introuvable.` };
            }
            if (!Array.isArray(parentNode.children)) {
                return { valid: false, reason: `Nœud « ${node.parentId} » : liste d'enfants invalide.` };
            }
            if (!parentNode.children.includes(id)) {
                return { valid: false, reason: `Lien incohérent : « ${node.parentId} » ne référence pas « ${id} » comme enfant.` };
            }
        }
    }
    return { valid: true };
}
