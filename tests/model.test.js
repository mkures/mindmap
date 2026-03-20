import { describe, it, expect } from 'vitest';
import {
  createEmptyMap, addChild, addSibling, deleteNode,
  reparentNode, moveSibling, isDescendant,
  copySubtree, pasteSubtree, toggleCollapse,
  setNodeSide, setNodeImage, ensureSettings
} from '../src/model.js';

describe('createEmptyMap', () => {
  it('crée une map avec un root node', () => {
    const map = createEmptyMap();
    expect(map.rootId).toBe('n1');
    expect(map.nodes['n1']).toBeDefined();
    expect(map.nodes['n1'].parentId).toBeNull();
    expect(map.nodes['n1'].children).toEqual([]);
    expect(map.nodes['n1'].text).toBe('Root');
  });

  it('initialise les settings par défaut', () => {
    const map = createEmptyMap();
    expect(map.settings).toBeDefined();
    expect(map.settings.levelColors).toHaveLength(7);
    expect(map.settings.fontFamily).toBe('sans-serif');
    expect(map.settings.fontSize).toBe(14);
    expect(map.settings.autosaveDelay).toBe(1200);
  });

  it('génère un id unique basé sur le timestamp', () => {
    const map = createEmptyMap();
    expect(map.id).toMatch(/^map-\d+$/);
  });

  it('contient createdAt, updatedAt, version', () => {
    const map = createEmptyMap();
    expect(map.createdAt).toBeGreaterThan(0);
    expect(map.updatedAt).toBeGreaterThan(0);
    expect(map.version).toBe(1);
  });
});

describe('addChild', () => {
  it('ajoute un enfant au nœud spécifié', () => {
    const map = createEmptyMap();
    const childId = addChild(map, 'n1');
    expect(map.nodes[childId]).toBeDefined();
    expect(map.nodes[childId].parentId).toBe('n1');
    expect(map.nodes['n1'].children).toContain(childId);
  });

  it('génère des IDs uniques pour chaque enfant', () => {
    const map = createEmptyMap();
    const id1 = addChild(map, 'n1');
    const id2 = addChild(map, 'n1');
    expect(id1).not.toBe(id2);
    expect(map.nodes['n1'].children).toHaveLength(2);
  });

  it('met à jour updatedAt', () => {
    const map = createEmptyMap();
    const before = map.updatedAt;
    addChild(map, 'n1');
    expect(map.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('hérite la couleur du parent', () => {
    const map = createEmptyMap();
    map.nodes['n1'].color = '#ff0000';
    const childId = addChild(map, 'n1');
    expect(map.nodes[childId].color).toBe('#ff0000');
  });
});

describe('addSibling', () => {
  it('ajoute un frère au même parent', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const sibling = addSibling(map, child);
    expect(map.nodes[sibling].parentId).toBe('n1');
    expect(map.nodes['n1'].children).toContain(sibling);
  });

  it('retourne null pour le root (pas de parent)', () => {
    const map = createEmptyMap();
    expect(addSibling(map, 'n1')).toBeNull();
  });
});

describe('deleteNode', () => {
  it('supprime un nœud et le retire du parent', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    deleteNode(map, child);
    expect(map.nodes[child]).toBeUndefined();
    expect(map.nodes['n1'].children).not.toContain(child);
  });

  it('supprime récursivement les enfants', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const grandchild = addChild(map, child);
    const greatgrandchild = addChild(map, grandchild);
    deleteNode(map, child);
    expect(map.nodes[child]).toBeUndefined();
    expect(map.nodes[grandchild]).toBeUndefined();
    expect(map.nodes[greatgrandchild]).toBeUndefined();
  });

  it('ne supprime pas le root', () => {
    const map = createEmptyMap();
    deleteNode(map, 'n1');
    expect(map.nodes['n1']).toBeDefined();
  });

  it('met à jour updatedAt', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const before = map.updatedAt;
    deleteNode(map, child);
    expect(map.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('reparentNode', () => {
  it('déplace un nœud vers un nouveau parent', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    expect(reparentNode(map, a, b)).toBe(true);
    expect(map.nodes[a].parentId).toBe(b);
    expect(map.nodes[b].children).toContain(a);
    expect(map.nodes['n1'].children).not.toContain(a);
  });

  it('refuse de reparenter le root', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(reparentNode(map, 'n1', child)).toBe(false);
  });

  it('refuse de reparenter vers un descendant (cycle)', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const grandchild = addChild(map, child);
    expect(reparentNode(map, child, grandchild)).toBe(false);
  });

  it('refuse de reparenter vers le même parent', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(reparentNode(map, child, 'n1')).toBe(false);
  });

  it("refuse si le nœud source n'existe pas", () => {
    const map = createEmptyMap();
    expect(reparentNode(map, 'nope', 'n1')).toBe(false);
  });
});

describe('moveSibling', () => {
  it('monte un nœud dans la liste des frères', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    moveSibling(map, b, -1);
    expect(map.nodes['n1'].children[0]).toBe(b);
    expect(map.nodes['n1'].children[1]).toBe(a);
  });

  it('descend un nœud dans la liste des frères', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    moveSibling(map, a, 1);
    expect(map.nodes['n1'].children[0]).toBe(b);
    expect(map.nodes['n1'].children[1]).toBe(a);
  });

  it('refuse de dépasser les bornes', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    expect(moveSibling(map, a, -1)).toBe(false);
    expect(moveSibling(map, a, 1)).toBe(false);
  });
});

describe('isDescendant', () => {
  it('détecte un descendant direct', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(isDescendant(map, 'n1', child)).toBe(true);
  });

  it('détecte un descendant indirect', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const grandchild = addChild(map, child);
    expect(isDescendant(map, 'n1', grandchild)).toBe(true);
  });

  it('un nœud est son propre descendant', () => {
    const map = createEmptyMap();
    expect(isDescendant(map, 'n1', 'n1')).toBe(true);
  });

  it('non-descendant retourne false', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    expect(isDescendant(map, a, b)).toBe(false);
  });
});

describe('copySubtree / pasteSubtree', () => {
  it('copie et colle un sous-arbre avec de nouveaux IDs', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    map.nodes[child].text = 'Copié';
    const grandchild = addChild(map, child);

    const subtree = copySubtree(map, child);
    const newId = pasteSubtree(map, subtree, 'n1');

    expect(newId).toBeDefined();
    expect(newId).not.toBe(child);
    expect(map.nodes[newId].text).toBe('Copié');
    expect(map.nodes[newId].children).toHaveLength(1);
    expect(map.nodes[newId].children[0]).not.toBe(grandchild);
  });

  it("retourne null si le target n'existe pas", () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const subtree = copySubtree(map, child);
    expect(pasteSubtree(map, subtree, 'nope')).toBeNull();
  });

  it('retourne null pour un subtree invalide', () => {
    const map = createEmptyMap();
    expect(pasteSubtree(map, null, 'n1')).toBeNull();
    expect(pasteSubtree(map, {}, 'n1')).toBeNull();
  });
});

describe('toggleCollapse', () => {
  it('toggle collapsed sur un nœud avec enfants', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    addChild(map, child);
    expect(toggleCollapse(map, child)).toBe(true);
    expect(map.nodes[child].collapsed).toBe(true);
    expect(toggleCollapse(map, child)).toBe(true);
    expect(map.nodes[child].collapsed).toBe(false);
  });

  it('refuse de collapse un nœud sans enfants', () => {
    const map = createEmptyMap();
    const leaf = addChild(map, 'n1');
    expect(toggleCollapse(map, leaf)).toBe(false);
  });
});

describe('setNodeSide', () => {
  it("change le côté pour un enfant direct du root", () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(setNodeSide(map, child, 'left')).toBe(true);
    expect(map.nodes[child].side).toBe('left');
  });

  it("refuse pour un non-enfant du root", () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const grandchild = addChild(map, child);
    expect(setNodeSide(map, grandchild, 'left')).toBe(false);
  });
});

describe('setNodeImage', () => {
  it('ajoute une image à un nœud', () => {
    const map = createEmptyMap();
    setNodeImage(map, 'n1', { kind: 'image', dataUrl: 'data:...', width: 64, height: 64 });
    expect(map.nodes['n1'].media).toBeDefined();
    expect(map.nodes['n1'].media.kind).toBe('image');
  });

  it("supprime l'image quand media est null", () => {
    const map = createEmptyMap();
    setNodeImage(map, 'n1', { kind: 'image', dataUrl: 'x', width: 1, height: 1 });
    setNodeImage(map, 'n1', null);
    expect(map.nodes['n1'].media).toBeUndefined();
  });
});

describe('ensureSettings', () => {
  it('ajoute les settings manquants', () => {
    const map = { nodes: {}, rootId: 'n1' };
    ensureSettings(map);
    expect(map.settings).toBeDefined();
    expect(map.settings.levelColors).toHaveLength(7);
  });

  it('ne remplace pas les settings existants valides', () => {
    const map = { settings: { levelColors: ['#000'], fontFamily: 'Arial', fontSize: 16, autosaveDelay: 2000, tags: [] } };
    ensureSettings(map);
    expect(map.settings.fontFamily).toBe('Arial');
    expect(map.settings.fontSize).toBe(16);
  });

  it('corrige fontSize invalide', () => {
    const map = { settings: { fontSize: 'invalid', levelColors: [], tags: [] } };
    ensureSettings(map);
    expect(map.settings.fontSize).toBe(14);
  });

  it('corrige autosaveDelay trop bas', () => {
    const map = { settings: { autosaveDelay: 50, levelColors: [], tags: [] } };
    ensureSettings(map);
    expect(map.settings.autosaveDelay).toBe(1200);
  });
});
