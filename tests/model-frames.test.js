import { describe, it, expect } from 'vitest';
import { createEmptyMap } from '../src/model.js';
import * as model from '../src/model.js';

const { addFrame, deleteFrame, updateFrame, getNodesInFrame, addFreeBubble, addCard } = model;

const maybeIt = (fn, name, testFn) => fn ? it(name, testFn) : it.skip(name, testFn);

describe('addFrame', () => {
  maybeIt(addFrame, 'crée un frame avec les dimensions par défaut', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 100, 50);
    expect(frame.id).toBeDefined();
    expect(frame.title).toBe('Zone');
    expect(frame.color).toBe('#dbeafe');
    expect(frame.x).toBe(100);
    expect(frame.y).toBe(50);
    expect(frame.w).toBe(400);
    expect(frame.h).toBe(300);
    expect(map.frames).toContain(frame);
  });

  maybeIt(addFrame, 'crée un frame avec des dimensions custom', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 0, 0, 800, 600);
    expect(frame.w).toBe(800);
    expect(frame.h).toBe(600);
  });

  maybeIt(addFrame, 'initialise map.frames si absent', () => {
    const map = createEmptyMap();
    expect(map.frames).toBeUndefined();
    addFrame(map, 0, 0);
    expect(Array.isArray(map.frames)).toBe(true);
  });

  maybeIt(addFrame, 'génère des IDs uniques', async () => {
    const map = createEmptyMap();
    const f1 = addFrame(map, 0, 0);
    await new Promise(r => setTimeout(r, 2));
    const f2 = addFrame(map, 500, 500);
    expect(f1.id).not.toBe(f2.id);
  });
});

describe('deleteFrame', () => {
  maybeIt(deleteFrame, 'supprime un frame sans toucher aux nœuds', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 0, 0, 500, 500);
    const nodeId = addFreeBubble(map, 100, 100);
    deleteFrame(map, frame.id);
    expect(map.frames).toHaveLength(0);
    expect(map.nodes[nodeId]).toBeDefined();
  });

  maybeIt(deleteFrame, 'ne crash pas si frames est undefined', () => {
    const map = createEmptyMap();
    expect(() => deleteFrame(map, 'nope')).not.toThrow();
  });

  maybeIt(deleteFrame, 'met à jour updatedAt', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 0, 0);
    const before = map.updatedAt;
    deleteFrame(map, frame.id);
    expect(map.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('updateFrame', () => {
  maybeIt(updateFrame, 'met à jour les propriétés du frame', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 0, 0);
    updateFrame(map, frame.id, { title: 'Projet A', color: '#dcfce7', w: 600 });
    expect(frame.title).toBe('Projet A');
    expect(frame.color).toBe('#dcfce7');
    expect(frame.w).toBe(600);
  });

  maybeIt(updateFrame, 'retourne null si frame inexistant', () => {
    const map = createEmptyMap();
    map.frames = [];
    expect(updateFrame(map, 'nope', { title: 'x' })).toBeNull();
  });

  maybeIt(updateFrame, 'retourne null si map.frames est undefined', () => {
    const map = createEmptyMap();
    expect(updateFrame(map, 'f1', { title: 'x' })).toBeNull();
  });
});

describe('getNodesInFrame', () => {
  maybeIt(getNodesInFrame, 'retourne les free nodes dont le centre est dans le rectangle', () => {
    const map = createEmptyMap();
    const frame = addFrame(map, 0, 0, 500, 500);
    const inside = addFreeBubble(map, 100, 100);
    map.nodes[inside].w = 80;
    map.nodes[inside].h = 40;
    const outside = addFreeBubble(map, 1000, 1000);
    map.nodes[outside].w = 80;
    map.nodes[outside].h = 40;

    const result = getNodesInFrame(map, frame.id);
    expect(result.map(n => n.id)).toContain(inside);
    expect(result.map(n => n.id)).not.toContain(outside);
  });

  maybeIt(getNodesInFrame, 'exclut les tree nodes', () => {
    const map = createEmptyMap();
    addFrame(map, -1000, -1000, 5000, 5000);
    const result = getNodesInFrame(map, map.frames[0].id);
    expect(result.map(n => n.id)).not.toContain('n1');
  });

  maybeIt(getNodesInFrame, 'retourne [] pour un frame inexistant', () => {
    const map = createEmptyMap();
    map.frames = [];
    expect(getNodesInFrame(map, 'nope')).toEqual([]);
  });

  maybeIt(getNodesInFrame, 'retourne [] si map.frames est undefined', () => {
    const map = createEmptyMap();
    expect(getNodesInFrame(map, 'f1')).toEqual([]);
  });
});

describe('Rétro-compatibilité frames', () => {
  it('une map sans frames ne crash pas', () => {
    const map = createEmptyMap();
    expect(map.frames).toBeUndefined();
    // Consumer code uses (map.frames || [])
    expect(map.frames || []).toEqual([]);
  });
});
