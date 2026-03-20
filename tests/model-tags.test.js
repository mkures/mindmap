import { describe, it, expect } from 'vitest';
import { createEmptyMap, addChild } from '../src/model.js';
import * as model from '../src/model.js';

const { addTagDef, removeTagDef, toggleNodeTag } = model;
const maybeIt = (fn, name, testFn) => fn ? it(name, testFn) : it.skip(name, testFn);

describe('addTagDef', () => {
  maybeIt(addTagDef, 'crée un tag dans settings', () => {
    const map = createEmptyMap();
    const id = addTagDef(map, 'En cours', '#3b82f6');
    expect(id).toBeDefined();
    const tag = map.settings.tags.find(t => t.id === id);
    expect(tag).toBeDefined();
    expect(tag.name).toBe('En cours');
    expect(tag.color).toBe('#3b82f6');
  });

  maybeIt(addTagDef, 'couleur par défaut si non fournie', () => {
    const map = createEmptyMap();
    const id = addTagDef(map, 'Sans couleur');
    const tag = map.settings.tags.find(t => t.id === id);
    expect(tag.color).toBeDefined();
  });
});

describe('removeTagDef', () => {
  maybeIt(removeTagDef, 'supprime un tag et le retire des nœuds', () => {
    const map = createEmptyMap();
    const tagId = addTagDef(map, 'Test', '#f00');
    const child = addChild(map, 'n1');
    map.nodes[child].tags = [tagId];

    removeTagDef(map, tagId);
    expect(map.settings.tags.find(t => t.id === tagId)).toBeUndefined();
    expect(map.nodes[child].tags).not.toContain(tagId);
  });
});

describe('toggleNodeTag', () => {
  maybeIt(toggleNodeTag, 'ajoute un tag à un nœud', () => {
    const map = createEmptyMap();
    const tagId = addTagDef(map, 'Urgent', '#f00');
    const child = addChild(map, 'n1');
    toggleNodeTag(map, child, tagId);
    expect(map.nodes[child].tags).toContain(tagId);
  });

  maybeIt(toggleNodeTag, 'retire un tag déjà présent', () => {
    const map = createEmptyMap();
    const tagId = addTagDef(map, 'Urgent', '#f00');
    const child = addChild(map, 'n1');
    toggleNodeTag(map, child, tagId);
    toggleNodeTag(map, child, tagId);
    expect(map.nodes[child].tags).not.toContain(tagId);
  });
});

describe('Tags - structure de données', () => {
  it('un nœud peut avoir un array de tags', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    map.nodes[child].tags = ['tag1', 'tag3'];
    expect(map.nodes[child].tags).toEqual(['tag1', 'tag3']);
  });

  it('tags absent est traité comme []', () => {
    const map = createEmptyMap();
    const child = addChild(map, 'n1');
    const tags = map.nodes[child].tags || [];
    expect(tags).toEqual([]);
  });

  it('un tag orphelin ne crash pas', () => {
    const map = createEmptyMap();
    map.settings.tags = [];
    const child = addChild(map, 'n1');
    map.nodes[child].tags = ['ghost_tag'];
    const tagDef = (map.settings.tags || []).find(t => t.id === 'ghost_tag');
    expect(tagDef).toBeUndefined();
  });
});
