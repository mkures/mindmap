import {
    createEmptyMap,
    addChild,
    addSibling,
    deleteNode,
    setNodeImage,
    ensureSettings,
    DEFAULTS,
    reparentNode,
    moveSibling,
    isDescendant
} from './model.js';
import { layout } from './layout.js';
import { render } from './render.js';

let map = createEmptyMap();
let selectedId = map.rootId;
const viewport = document.getElementById('viewport');
const svgElement = document.getElementById('mindmap');

let pan = {x:0, y:0, scale:1};
let needsCenterOnRoot = true;
let dragState = null;
let dropTargetId = null;
let suppressClick = false;

function update() {
    ensureSettings(map);
    layout(map);
    if (needsCenterOnRoot) {
        centerOnRoot();
        needsCenterOnRoot = false;
    }
    render(map, viewport, selectedId);
    viewport.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${pan.scale})`);
    if (map.settings && map.settings.fontFamily) {
        document.body.style.fontFamily = map.settings.fontFamily;
    }
}
update();

function centerOnRoot() {
    if (!svgElement) return;
    const root = map.nodes[map.rootId];
    if (!root) return;
    pan.scale = 1;
    const centerX = root.x + root.w / 2;
    const centerY = root.y + root.h / 2;
    pan.x = svgElement.clientWidth / 2 - centerX;
    pan.y = svgElement.clientHeight / 2 - centerY;
}

// selection handling
viewport.addEventListener('click', e => {
    if (suppressClick) {
        suppressClick = false;
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
const configBtn = document.getElementById('configBtn');
const configModal = document.getElementById('configModal');
const configBackdrop = document.getElementById('modalBackdrop');
const configForm = document.getElementById('configForm');
const levelColorsContainer = document.getElementById('levelColorsContainer');
const addLevelColorBtn = document.getElementById('addLevelColorBtn');
const fontFamilyInput = document.getElementById('fontFamilyInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const configCancelBtn = document.getElementById('configCancelBtn');

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
    needsCenterOnRoot = true;
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
            const max = 128;
            let w = img.width;
            let h = img.height;
            let scale = 1;
            if (w > h && w > max) scale = max / w;
            else if (h > w && h > max) scale = max / h;
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/png');
            setNodeImage(map, selectedId, {
                kind: 'image',
                dataUrl,
                width: w,
                height: h,
                naturalWidth: img.width,
                naturalHeight: img.height
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
            ensureSettings(map);
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
configBtn.onclick = openConfig;

function openConfig() {
    ensureSettings(map);
    populateColorInputs();
    fontFamilyInput.value = map.settings.fontFamily || DEFAULTS.fontFamily;
    fontSizeInput.value = map.settings.fontSize || DEFAULTS.fontSize;
    configModal.classList.remove('hidden');
    configBackdrop.classList.remove('hidden');
}

function closeConfig() {
    configModal.classList.add('hidden');
    configBackdrop.classList.add('hidden');
}

function populateColorInputs() {
    levelColorsContainer.innerHTML = '';
    map.settings.levelColors.forEach((color, index) => {
        addColorInput(index, color);
    });
    if (!map.settings.levelColors.length) {
        addColorInput(0, DEFAULTS.levelColors[0]);
    }
}

function addColorInput(index, value) {
    const row = document.createElement('div');
    row.className = 'config-row';
    const label = document.createElement('label');
    label.textContent = `Niveau ${index}`;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value || '#ffffff';
    input.dataset.index = index;
    row.appendChild(label);
    row.appendChild(input);
    levelColorsContainer.appendChild(row);
}

addLevelColorBtn.addEventListener('click', () => {
    const nextIndex = levelColorsContainer.querySelectorAll('input[type="color"]').length;
    addColorInput(nextIndex, DEFAULTS.levelColors[nextIndex % DEFAULTS.levelColors.length] || '#ffffff');
});

configBackdrop.addEventListener('click', closeConfig);
configCancelBtn.addEventListener('click', closeConfig);

configForm.addEventListener('submit', e => {
    e.preventDefault();
    const colorInputs = levelColorsContainer.querySelectorAll('input[type="color"]');
    const colors = Array.from(colorInputs).map(input => input.value);
    map.settings.levelColors = colors.length ? colors : [...DEFAULTS.levelColors];
    map.settings.fontFamily = fontFamilyInput.value || DEFAULTS.fontFamily;
    const parsed = parseInt(fontSizeInput.value, 10);
    map.settings.fontSize = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS.fontSize;
    closeConfig();
    update();
});

function fitToScreen() {
    const bbox = viewport.getBBox();
    if (!svgElement) return;
    const w = svgElement.clientWidth;
    const h = svgElement.clientHeight;
    const scale = Math.min(w / (bbox.width + 40), h / (bbox.height + 40));
    const tx = -bbox.x * scale + (w - bbox.width * scale) / 2;
    const ty = -bbox.y * scale + (h - bbox.height * scale) / 2;
    pan = { x: tx, y: ty, scale };
    update();
}

// pan and zoom
let isPanning = false;
let start = {x:0,y:0};

svgElement.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const node = e.target.closest('.node');
    if (node) {
        e.preventDefault();
        startNodeDrag(node, e);
        return;
    }
    isPanning = true;
    start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
});

document.addEventListener('mousemove', e => {
    if (dragState) {
        updateNodeDrag(e);
        return;
    }
    if (isPanning) {
        pan.x = e.clientX - start.x;
        pan.y = e.clientY - start.y;
        update();
    }
});

document.addEventListener('mouseup', e => {
    if (dragState) {
        endNodeDrag(e);
    }
    isPanning = false;
});

svgElement.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    pan.scale = Math.min(2, Math.max(0.25, pan.scale + delta));
    update();
});

function startNodeDrag(nodeEl, event) {
    const id = nodeEl.dataset.id;
    if (!id || id === map.rootId) return;
    if (editingInput) return;
    const rect = nodeEl.getBoundingClientRect();
    dragState = {
        id,
        originEl: nodeEl,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false,
        preview: null
    };
}

function updateNodeDrag(event) {
    if (!dragState) return;
    if (!dragState.hasMoved) {
        const dx = Math.abs(event.clientX - dragState.startX);
        const dy = Math.abs(event.clientY - dragState.startY);
        if (dx > 3 || dy > 3) {
            dragState.hasMoved = true;
            ensureDragPreview();
        }
    }
    if (!dragState.hasMoved) return;
    event.preventDefault();
    positionDragPreview(event.clientX, event.clientY);
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const node = el ? el.closest('.node') : null;
    if (!node) {
        clearDropTarget();
        return;
    }
    const targetId = node.dataset.id;
    if (!targetId || targetId === dragState.id) {
        clearDropTarget();
        return;
    }
    if (isDescendant(map, dragState.id, targetId)) {
        clearDropTarget();
        return;
    }
    setDropTarget(node, targetId);
}

function endNodeDrag() {
    if (!dragState) return;
    const { preview, originEl, id, hasMoved } = dragState;
    if (preview && preview.parentNode) {
        preview.parentNode.removeChild(preview);
    }
    if (originEl && originEl.classList) {
        originEl.classList.remove('drag-origin');
    }
    document.body.classList.remove('dragging-node');
    const targetId = dropTargetId;
    clearDropTarget();
    dragState = null;
    if (targetId && reparentNode(map, id, targetId)) {
        selectedId = id;
        update();
    } else if (hasMoved) {
        update();
    }
    suppressClick = hasMoved;
}

function positionDragPreview(clientX, clientY) {
    if (!dragState || !dragState.preview) return;
    const x = clientX - dragState.offsetX;
    const y = clientY - dragState.offsetY;
    dragState.preview.style.left = `${x}px`;
    dragState.preview.style.top = `${y}px`;
}

function clearDropTarget() {
    if (!dropTargetId) return;
    const prev = viewport.querySelector(`.node[data-id="${dropTargetId}"]`);
    if (prev) {
        prev.classList.remove('drop-target');
    }
    dropTargetId = null;
}

function setDropTarget(nodeEl, id) {
    if (dropTargetId === id) return;
    clearDropTarget();
    dropTargetId = id;
    if (nodeEl) {
        nodeEl.classList.add('drop-target');
    }
}

function ensureDragPreview() {
    if (!dragState || dragState.preview) return;
    const { originEl, id, startX, startY } = dragState;
    const rect = originEl.getBoundingClientRect();
    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.style.width = rect.width + 'px';
    preview.style.height = rect.height + 'px';
    preview.style.backgroundColor = map.nodes[id].color || '#ffffff';
    preview.style.fontFamily = map.settings?.fontFamily || DEFAULTS.fontFamily;
    preview.style.fontSize = (map.settings?.fontSize || DEFAULTS.fontSize) + 'px';
    preview.textContent = map.nodes[id].text;
    dragState.preview = preview;
    document.body.appendChild(preview);
    originEl.classList.add('drag-origin');
    document.body.classList.add('dragging-node');
    positionDragPreview(startX, startY);
}

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
    } else if (e.key === 'F2') {
        e.preventDefault();
        startEditing(selectedId);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
        e.preventDefault();
        if (moveSibling(map, selectedId, e.key === 'ArrowUp' ? -1 : 1)) {
            update();
        }
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
let editingOriginalText = null;

function startEditing(id, initial) {
    if (editingInput) return;
    editingId = id;
    const nodeEl = viewport.querySelector(`.node[data-id="${id}"]`);
    if (!nodeEl) return;
    const bbox = nodeEl.getBoundingClientRect();
    editingInput = document.createElement('input');
    editingInput.type = 'text';
    editingInput.className = 'edit-input';
    editingOriginalText = map.nodes[id].text;
    editingInput.value = initial !== undefined ? initial : editingOriginalText;
    if (map.settings) {
        if (map.settings.fontFamily) editingInput.style.fontFamily = map.settings.fontFamily;
        if (map.settings.fontSize) editingInput.style.fontSize = map.settings.fontSize + 'px';
    }
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
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const currentId = editingId;
            finishEditing();
            if (currentId) {
                selectedId = currentId;
                const id = addChild(map, currentId);
                if (id) {
                    selectedId = id;
                    update();
                    startEditing(id);
                }
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (editingOriginalText !== null) {
                editingInput.value = editingOriginalText;
            }
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
    editingOriginalText = null;
    update();
}

// reposition editor on update
const originalUpdate = update;
update = function() {
    originalUpdate();
    if (editingInput && editingId) {
        const nodeEl = viewport.querySelector(`.node[data-id="${editingId}"]`);
        if (map.settings) {
            if (map.settings.fontFamily) editingInput.style.fontFamily = map.settings.fontFamily;
            if (map.settings.fontSize) editingInput.style.fontSize = map.settings.fontSize + 'px';
        }
        if (nodeEl) positionEditor(nodeEl.getBoundingClientRect());
    }
};
