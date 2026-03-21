import { describe, it, expect } from 'vitest';
import { createEmptyMap, addChild } from '../src/model.js';
import * as model from '../src/model.js';

const { addTask, toggleTask, deleteTask, getAllTasks } = model;
const maybeIt = (fn, name, testFn) => fn ? it(name, testFn) : it.skip(name, testFn);

describe('addTask', () => {
  maybeIt(addTask, 'adds a task to a node', () => {
    const map = createEmptyMap();
    const task = addTask(map, map.rootId, 'Ma tâche');
    expect(task).toBeDefined();
    expect(task.text).toBe('Ma tâche');
    expect(task.done).toBe(false);
    expect(map.nodes[map.rootId].tasks).toHaveLength(1);
  });

  maybeIt(addTask, 'returns null for unknown node', () => {
    const map = createEmptyMap();
    expect(addTask(map, 'nope', 'test')).toBeNull();
  });
});

describe('toggleTask', () => {
  maybeIt(toggleTask, 'toggles a task done state', () => {
    const map = createEmptyMap();
    const task = addTask(map, map.rootId, 'Task 1');
    expect(task.done).toBe(false);
    toggleTask(map, map.rootId, task.id);
    expect(map.nodes[map.rootId].tasks[0].done).toBe(true);
    toggleTask(map, map.rootId, task.id);
    expect(map.nodes[map.rootId].tasks[0].done).toBe(false);
  });
});

describe('deleteTask', () => {
  maybeIt(deleteTask, 'removes a task from a node', () => {
    const map = createEmptyMap();
    const t1 = addTask(map, map.rootId, 'A');
    addTask(map, map.rootId, 'B');
    expect(map.nodes[map.rootId].tasks).toHaveLength(2);
    deleteTask(map, map.rootId, t1.id);
    expect(map.nodes[map.rootId].tasks).toHaveLength(1);
    expect(map.nodes[map.rootId].tasks[0].text).toBe('B');
  });
});

describe('getAllTasks', () => {
  maybeIt(getAllTasks, 'collects tasks from all nodes', () => {
    const map = createEmptyMap();
    const childId = addChild(map, map.rootId);
    addTask(map, map.rootId, 'Root task');
    addTask(map, childId, 'Child task');
    const all = getAllTasks(map);
    expect(all).toHaveLength(2);
    expect(all[0].tasks).toHaveLength(1);
    expect(all[1].tasks).toHaveLength(1);
  });

  maybeIt(getAllTasks, 'returns empty for no tasks', () => {
    const map = createEmptyMap();
    expect(getAllTasks(map)).toHaveLength(0);
  });
});
