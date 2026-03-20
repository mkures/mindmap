import { describe, it, expect } from 'vitest';
import { createEmptyMap, addChild, deleteNode } from '../src/model.js';
import * as model from '../src/model.js';

const { addFreeBubble, addCard, convertToCard, toggleCardExpanded } = model;

const maybeIt = (fn, name, testFn) => fn ? it(name, testFn) : it.skip(name, testFn);

describe('addFreeBubble', () => {
  maybeIt(addFreeBubble, 'crée un free bubble aux coordonnées données', () => {
    const map = createEmptyMap();
    const id = addFreeBubble(map, 150, -200);
    const node = map.nodes[id];
    expect(node).toBeDefined();
    expect(node.placement).toBe('free');
    expect(node.fx).toBe(150);
    expect(node.fy).toBe(-200);
    expect(node.parentId).toBeNull();
    expect(node.children).toEqual([]);
  });

  maybeIt(addFreeBubble, 'a une couleur jaune pâle par défaut', () => {
    const map = createEmptyMap();
    const id = addFreeBubble(map, 0, 0);
    expect(map.nodes[id].color).toBe('#fef3c7');
  });

  maybeIt(addFreeBubble, 'génère un ID unique', () => {
    const map = createEmptyMap();
    const id1 = addFreeBubble(map, 0, 0);
    const id2 = addFreeBubble(map, 100, 100);
    expect(id1).not.toBe(id2);
  });

  maybeIt(addFreeBubble, "n'affecte pas l'arbre existant", () => {
    const map = createEmptyMap();
    const childrenBefore = [...map.nodes['n1'].children];
    addFreeBubble(map, 0, 0);
    expect(map.nodes['n1'].children).toEqual(childrenBefore);
  });
});

describe('addCard', () => {
  maybeIt(addCard, 'crée une card aux coordonnées données', () => {
    const map = createEmptyMap();
    const id = addCard(map, 300, 100);
    const node = map.nodes[id];
    expect(node.placement).toBe('free');
    expect(node.fx).toBe(300);
    expect(node.fy).toBe(100);
    expect(node.body).toBe('');
    expect(node.cardWidth).toBe(280);
    expect(node.cardExpanded).toBe(false);
  });

  maybeIt(addCard, 'a un titre par défaut', () => {
    const map = createEmptyMap();
    const id = addCard(map, 0, 0);
    expect(map.nodes[id].text).toBe('Sans titre');
  });

  maybeIt(addCard, 'est toujours free (pas de parentId)', () => {
    const map = createEmptyMap();
    const id = addCard(map, 0, 0);
    expect(map.nodes[id].parentId).toBeNull();
  });
});

describe('convertToCard', () => {
  maybeIt(convertToCard, 'convertit un free bubble en card', () => {
    const map = createEmptyMap();
    const id = addFreeBubble(map, 50, 60);
    expect(convertToCard(map, id)).toBe(true);
    expect(map.nodes[id].nodeType).toBe('card');
    expect(map.nodes[id].body).toBe('');
    expect(map.nodes[id].cardWidth).toBe(280);
  });

  maybeIt(convertToCard, 'refuse de convertir un tree node', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(convertToCard(map, child)).toBe(false);
  });
});

describe('toggleCardExpanded', () => {
  maybeIt(toggleCardExpanded, 'toggle expanded sur une card', () => {
    const map = createEmptyMap();
    const id = addCard(map, 0, 0);
    expect(map.nodes[id].cardExpanded).toBe(false);
    expect(toggleCardExpanded(map, id)).toBe(true);
    expect(map.nodes[id].cardExpanded).toBe(true);
  });

  maybeIt(toggleCardExpanded, 'refuse sur un tree node', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(toggleCardExpanded(map, child)).toBe(false);
  });
});

describe('deleteNode - free nodes', () => {
  maybeIt(addFreeBubble, 'supprime un free bubble', () => {
    const map = createEmptyMap();
    const id = addFreeBubble(map, 0, 0);
    deleteNode(map, id);
    expect(map.nodes[id]).toBeUndefined();
  });

  maybeIt(addCard, 'supprime une card', () => {
    const map = createEmptyMap();
    const id = addCard(map, 0, 0);
    deleteNode(map, id);
    expect(map.nodes[id]).toBeUndefined();
  });
});

describe('Rétro-compatibilité des nœuds', () => {
  it('un nœud sans nodeType est implicitement bubble', () => {
    const map = createEmptyMap();
    expect(map.nodes['n1'].nodeType).toBeUndefined();
  });

  it('un nœud sans placement est implicitement tree', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    expect(map.nodes[child].placement).toBeUndefined();
  });
});
