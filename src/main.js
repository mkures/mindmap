import { createEmptyMap, addChild, addSibling, deleteNode, setNodeImage } from './model.js';
import { layout } from './layout.js';
import { render } from './render.js';

let map = createEmptyMap();
let selectedId = map.rootId;
const viewport = document.getElementById('viewport');
const overlay = document.getElementById('imageOverlay');
const overlayImg = document.getElementById('overlayImg');

let pan = {x:0, y:0, scale:1};

function update() {
    layout(map);
    render(map, viewport, selectedId);
    viewport.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${pan.scale})`);
}
update();

// selection handling
viewport.addEventListener('click', e => {
    const img = e.target.closest('.node-image');
    if (img) {
        overlayImg.src = img.dataset.url;
        overlayImg.style.width = img.dataset.nw + 'px';
        overlayImg.style.height = img.dataset.nh + 'px';
        overlay.style.display = 'flex';
        return;
    }
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
const imageBtn = document.getElementById('imageBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const imageInput = document.getElementById('imageInput');
const loadInput = document.getElementById('loadInput');
overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlayImg.src = '';
    overlayImg.style.width = '';
    overlayImg.style.height = '';
});

addChildBtn.onclick = () => {
    const id = addChild(map, selectedId);
    selectedId = id;
    update();
    startEditing(id);
};

addSiblingBtn.onclick = () => {
    const id = addSibling(map, selectedId);
    if (id) {
        selectedId = id;
        update();
        startEditing(id);
    }
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
    startEditing(selectedId);
};

imageBtn.onclick = () => {
    imageInput.value = '';
    imageInput.click();
};

imageInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const storeMax = 256;
            let w = img.width;
            let h = img.height;
            let scale = 1;
            const longest = Math.max(w, h);
            if (longest > storeMax) scale = storeMax / longest;
            const storeW = Math.round(w * scale);
            const storeH = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = storeW;
            canvas.height = storeH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, storeW, storeH);
            const dataUrl = canvas.toDataURL('image/png');

            // size inside the node
            const displayMax = 96;
            let dScale = 1;
            const longestDisp = Math.max(storeW, storeH);
            if (longestDisp > displayMax) dScale = displayMax / longestDisp;
            const dispW = Math.round(storeW * dScale);
            const dispH = Math.round(storeH * dScale);

            setNodeImage(map, selectedId, {
                kind: 'image',
                dataUrl,
                width: dispW,
                height: dispH,
                naturalWidth: storeW,
                naturalHeight: storeH
            });
            update();
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

saveBtn.onclick = () => {
    const json = JSON.stringify(map, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${map.title}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
};

loadBtn.onclick = () => {
    loadInput.value = '';
    loadInput.click();
};

loadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            map = JSON.parse(ev.target.result);
            selectedId = map.rootId;
            pan = {x:0,y:0,scale:1};
            update();
        } catch (err) {
            alert('Invalid JSON');
        }
    };
    reader.readAsText(file);
});

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
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
        overlay.click();
    } else if (e.key === 'Tab') {
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
    } else if (e.key === 'F2') {
        e.preventDefault();
        startEditing(selectedId);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        startEditing(selectedId, e.key);
        e.preventDefault();
    }
});

// double click to edit
viewport.addEventListener('dblclick', e => {
    const g = e.target.closest('.node');
    if (g) {
        startEditing(g.dataset.id);
    }
});

let editingInput = null;
let editingId = null;

function startEditing(id, initial) {
    if (editingInput) return;
    editingId = id;
    const nodeEl = viewport.querySelector(`.node[data-id="${id}"]`);
    if (!nodeEl) return;
    const bbox = nodeEl.getBoundingClientRect();
    editingInput = document.createElement('input');
    editingInput.type = 'text';
    editingInput.className = 'edit-input';
    editingInput.value = initial !== undefined ? initial : map.nodes[id].text;
    positionEditor(bbox);
    document.body.appendChild(editingInput);
    editingInput.focus();
    if (initial === undefined) {
        editingInput.select();
    } else {
        editingInput.setSelectionRange(editingInput.value.length, editingInput.value.length);
    }
    editingInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            finishEditing();
        }
    });
    editingInput.addEventListener('blur', finishEditing);
}

function positionEditor(bbox) {
    if (!editingInput) return;
    editingInput.style.left = bbox.x + 'px';
    editingInput.style.top = bbox.y + 'px';
    editingInput.style.width = bbox.width + 'px';
    editingInput.style.height = bbox.height + 'px';
}

function finishEditing() {
    if (!editingInput) return;
    map.nodes[editingId].text = editingInput.value;
    document.body.removeChild(editingInput);
    editingInput = null;
    editingId = null;
    update();
}

// reposition editor on update
const originalUpdate = update;
update = function() {
    originalUpdate();
    if (editingInput && editingId) {
        const nodeEl = viewport.querySelector(`.node[data-id="${editingId}"]`);
        if (nodeEl) positionEditor(nodeEl.getBoundingClientRect());
    }
};
