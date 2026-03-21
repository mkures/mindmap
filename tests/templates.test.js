import { describe, it, expect } from 'vitest';
import { getTemplates, buildFromTemplate } from '../src/templates.js';

describe('getTemplates', () => {
  it('retourne un tableau non vide', () => {
    const templates = getTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('chaque template a un nom, une icône et une fonction build', () => {
    getTemplates().forEach(tmpl => {
      expect(typeof tmpl.name).toBe('string');
      expect(typeof tmpl.icon).toBe('string');
      expect(typeof tmpl.build).toBe('function');
    });
  });

  it('le premier template est la carte vide', () => {
    const first = getTemplates()[0];
    expect(first.name).toBe('Carte vide');
    expect(first.build()).toBeNull();
  });
});

describe('buildFromTemplate', () => {
  it('retourne null pour la carte vide (index 0)', () => {
    expect(buildFromTemplate(0)).toBeNull();
  });

  it('retourne null pour un index invalide', () => {
    expect(buildFromTemplate(-1)).toBeNull();
    expect(buildFromTemplate(999)).toBeNull();
  });

  it('construit une map valide pour Brainstorming (index 1)', () => {
    const map = buildFromTemplate(1);
    expect(map).not.toBeNull();
    expect(map.id).toMatch(/^map-\d+$/);
    expect(map.title).toBe('Brainstorming');
    expect(map.rootId).toBe('n1');
    expect(map.nodes).toBeDefined();
    expect(map.nodes['n1']).toBeDefined();
    expect(map.createdAt).toBeGreaterThan(0);
    expect(map.version).toBe(1);
  });

  it('chaque template non-vide a un rootId et des nodes', () => {
    const templates = getTemplates();
    for (let i = 1; i < templates.length; i++) {
      const map = buildFromTemplate(i);
      expect(map).not.toBeNull();
      expect(map.rootId).toBeDefined();
      expect(map.nodes[map.rootId]).toBeDefined();
      expect(map.nodes[map.rootId].parentId).toBeNull();
    }
  });

  it('les enfants référencent correctement leur parent', () => {
    const map = buildFromTemplate(1); // Brainstorming
    Object.values(map.nodes).forEach(node => {
      if (node.parentId) {
        const parent = map.nodes[node.parentId];
        expect(parent).toBeDefined();
        expect(parent.children).toContain(node.id);
      }
    });
  });
});
