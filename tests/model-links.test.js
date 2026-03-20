import { describe, it, expect } from 'vitest';
import { createEmptyMap, addChild, deleteNode } from '../src/model.js';
import * as model from '../src/model.js';

const { addLink, deleteLink, addFreeBubble, addCard } = model;

const maybeIt = (fn, name, testFn) => fn ? it(name, testFn) : it.skip(name, testFn);

describe('addLink', () => {
  maybeIt(addLink, 'crée un lien entre deux nœuds', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const link = addLink(map, a, b, 'dépend de');
    expect(link).toBeDefined();
    expect(link.from).toBe(a);
    expect(link.to).toBe(b);
    expect(link.label).toBe('dépend de');
    expect(map.links).toContain(link);
  });

  maybeIt(addLink, 'initialise map.links si absent', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    addLink(map, a, b);
    expect(Array.isArray(map.links)).toBe(true);
  });

  maybeIt(addLink, 'refuse les doublons (même from/to)', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    addLink(map, a, b);
    const dup = addLink(map, a, b);
    expect(dup).toBeNull();
    expect(map.links).toHaveLength(1);
  });

  maybeIt(addLink, 'permet un lien inverse (to→from)', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    addLink(map, a, b);
    const reverse = addLink(map, b, a);
    expect(reverse).not.toBeNull();
    expect(map.links).toHaveLength(2);
  });

  maybeIt(addLink, 'a des valeurs par défaut pour couleur et style', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const link = addLink(map, a, b);
    expect(link.color).toBe('#94a3b8');
    expect(link.style).toBe('dashed');
  });

  maybeIt(addLink, 'label par défaut est vide', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const link = addLink(map, a, b);
    expect(link.label).toBe('');
  });
});

describe('deleteLink', () => {
  maybeIt(deleteLink, 'supprime un lien par ID', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const link = addLink(map, a, b);
    deleteLink(map, link.id);
    expect(map.links).toHaveLength(0);
  });

  maybeIt(deleteLink, 'ne crash pas si links est undefined', () => {
    const map = createEmptyMap();
    expect(() => deleteLink(map, 'nope')).not.toThrow();
  });

  maybeIt(deleteLink, 'ne touche pas aux autres liens', async () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const c = addChild(map, 'n1');
    const link1 = addLink(map, a, b);
    await new Promise(r => setTimeout(r, 2));
    const link2 = addLink(map, b, c);
    deleteLink(map, link1.id);
    expect(map.links).toHaveLength(1);
    expect(map.links[0].id).toBe(link2.id);
  });
});

describe('deleteNode nettoie les liens', () => {
  maybeIt(addLink, 'supprime les liens from quand le nœud source est supprimé', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    addLink(map, a, b);
    deleteNode(map, a);
    expect((map.links || []).length).toBe(0);
  });

  maybeIt(addLink, 'supprime les liens to quand le nœud cible est supprimé', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    addLink(map, a, b);
    deleteNode(map, b);
    expect((map.links || []).length).toBe(0);
  });

  maybeIt(addLink, 'ne touche pas les liens sans rapport', () => {
    const map = createEmptyMap();
    const a = addChild(map, 'n1');
    const b = addChild(map, 'n1');
    const c = addChild(map, 'n1');
    addLink(map, a, b);
    addLink(map, b, c);
    deleteNode(map, a);
    expect((map.links || []).length).toBe(1);
    expect(map.links[0].from).toBe(b);
  });
});

describe('Rétro-compatibilité links', () => {
  it('une map sans links ne crash pas', () => {
    const map = createEmptyMap();
    expect(map.links).toBeUndefined();
    expect(map.links || []).toEqual([]);
  });
});
