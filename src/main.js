import { createEmptyMap, addChild, addSibling, deleteNode } from './model.js';
import { layout } from './layout.js';
import { render } from './render.js';

let map = createEmptyMap();
let selectedId = map.rootId;
const viewport = document.getElementById('viewport');

let pan = {x:0, y:0, scale:1};

function update() {
    layout(map);
    render(map, viewport, selectedId);
    viewport.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${pan.scale})`);
}
update();

// selection handling
viewport.addEventListener('click', e => {
    const g = e.target.closest('.node');
    if (g) {
        selectedId = g.dataset.id;
        update();
    }
});

// toolbar actions
const addChildBtn = document.getElementById('addChildBtn');
const addSiblingBtn = document.getElementById('addSiblingBtn');
const deleteBtn = document.getElementById('deleteBtn');
const newBtn = document.getElementById('newBtn');
const fitBtn = document.getElementById('fitBtn');

addChildBtn.onclick = () => {
    const id = addChild(map, selectedId);
    selectedId = id;
    update();
};

addSiblingBtn.onclick = () => {
    const id = addSibling(map, selectedId);
    if (id) selectedId = id;
    update();
};

deleteBtn.onclick = () => {
    deleteNode(map, selectedId);
    selectedId = map.rootId;
    update();
};

newBtn.onclick = () => {
    map = createEmptyMap();
    selectedId = map.rootId;
    pan = {x:0,y:0,scale:1};
    update();
};

fitBtn.onclick = fitToScreen;

function fitToScreen() {
    const bbox = viewport.getBBox();
    const svg = document.getElementById('mindmap');
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const scale = Math.min(w / (bbox.width + 40), h / (bbox.height + 40));
    const tx = -bbox.x * scale + (w - bbox.width * scale) / 2;
    const ty = -bbox.y * scale + (h - bbox.height * scale) / 2;
    pan = { x: tx, y: ty, scale };
    update();
}

// pan and zoom
let isPanning = false;
let start = {x:0,y:0};

document.getElementById('mindmap').addEventListener('mousedown', e => {
    isPanning = true;
    start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
});

document.addEventListener('mousemove', e => {
    if (isPanning) {
        pan.x = e.clientX - start.x;
        pan.y = e.clientY - start.y;
        update();
    }
});

document.addEventListener('mouseup', () => {
    isPanning = false;
});

document.getElementById('mindmap').addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    pan.scale = Math.min(2, Math.max(0.25, pan.scale + delta));
    update();
});

// keyboard shortcuts
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Tab') {
        e.preventDefault();
        addChildBtn.onclick();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        addSiblingBtn.onclick();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteBtn.onclick();
    } else if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        fitToScreen();
    }
});
