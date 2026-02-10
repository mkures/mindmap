import {
    createEmptyMap,
    addChild,
    addSibling,
    deleteNode,
    setNodeImage,
    ensureSettings,
    DEFAULTS,
    MIN_AUTOSAVE_DELAY,
    reparentNode,
    moveSibling,
    isDescendant,
    copySubtree,
    pasteSubtree,
    toggleCollapse,
    setNodeSide
} from './model.js';
import { layout } from './layout.js';
import { render, clearRenderCache } from './render.js';
import { exportMarkdown, exportImage, exportPdf } from './export.js';

const MAPS_ENDPOINT = '/api/maps';
let LAST_MAP_STORAGE_KEY = 'mindmap:lastMapId';

const viewport = document.getElementById('viewport');
const svgElement = document.getElementById('mindmap');
const appContainer = document.getElementById('appContainer');
const mapTitleInput = document.getElementById('mapTitleInput');
const saveStatusEl = document.getElementById('saveStatus');
const remoteLoadBtn = document.getElementById('remoteLoadBtn');
const remoteSaveBtn = document.getElementById('remoteSaveBtn');
const mapListModal = document.getElementById('mapListModal');
const mapListContainer = document.getElementById('mapListContainer');
const refreshMapListBtn = document.getElementById('refreshMapListBtn');
const closeMapListBtn = document.getElementById('closeMapListBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
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
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportImageBtn = document.getElementById('exportImageBtn');
const exportMdBtn = document.getElementById('exportMdBtn');
const configBtn = document.getElementById('configBtn');
const configModal = document.getElementById('configModal');
const configForm = document.getElementById('configForm');
const levelColorsContainer = document.getElementById('levelColorsContainer');
const addLevelColorBtn = document.getElementById('addLevelColorBtn');
const fontFamilyInput = document.getElementById('fontFamilyInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const autosaveDelayInput = document.getElementById('autosaveDelayInput');
const configCancelBtn = document.getElementById('configCancelBtn');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpCloseBtn = document.getElementById('helpCloseBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const breadcrumbEl = document.getElementById('breadcrumb');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');

let currentUser = null;

let map = null;
let selectedId = null;
let pan = { x: 0, y: 0, scale: 1 };
let needsCenterOnRoot = false;
let dragState = null;
let dropTargetId = null;
let suppressClick = false;
let editingInput = null;
let editingId = null;
let editingOriginalText = null;

let layoutDirty = true;
let pendingUpdate = false;

let remoteAvailable = true;
let remoteDisabledMessage = '';

let autosaveTimer = null;
let autosavePending = false;
let autosaveInFlight = false;
let lastSaveError = null;

let clipboard = null; // Stores copied subtree

let currentFolderId = null; // null = root
let currentFolderName = null;
let allFolders = [];
let viewingTrash = false;

init();

async function init() {
    await loadCurrentUser();
    updateSaveStatus();
    wireUI();
    updateRemoteUIState();
    showApp();
    await loadInitialMap();
}

async function loadCurrentUser() {
    try {
        const resp = await fetch('/api/auth/me');
        if (resp.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (resp.ok) {
            currentUser = await resp.json();
            LAST_MAP_STORAGE_KEY = `mindmap:lastMapId:${currentUser.id}`;
            if (currentUserDisplay) {
                currentUserDisplay.textContent = currentUser.displayName || currentUser.username;
            }
            if (adminBtn && currentUser.isAdmin) {
                adminBtn.classList.remove('hidden');
            }
        }
    } catch {
        // Network error, continue offline
    }
}

function wireUI() {
    if (mapTitleInput) {
        mapTitleInput.addEventListener('input', () => {
            if (!map) return;
            map.title = mapTitleInput.value.trim() || 'Sans titre';
            updateDocumentTitle();
            markMapChanged();
        });
    }

    if (remoteLoadBtn) {
        remoteLoadBtn.addEventListener('click', () => {
            if (!ensureRemoteEnabled()) return;
            openMapList();
        });
    }

    if (remoteSaveBtn) {
        remoteSaveBtn.addEventListener('click', () => {
            if (!ensureRemoteEnabled()) return;
            autosavePending = true;
            scheduleAutosave();
        });
    }

    if (refreshMapListBtn) {
        refreshMapListBtn.addEventListener('click', () => {
            if (!ensureRemoteEnabled()) return;
            refreshMapList();
        });
    }

    if (closeMapListBtn) {
        closeMapListBtn.addEventListener('click', () => {
            closeMapList();
        });
    }

    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', () => {
            closeConfig();
            closeMapList();
            closeHelp();
        });
    }

    if (addChildBtn) {
        addChildBtn.onclick = () => {
            if (!map) return;
            const id = addChild(map, selectedId);
            selectedId = id;
            needsCenterOnRoot = false;
            markLayoutDirty();
            update();
            markMapChanged();
            startEditing(id);
        };
    }

    if (addSiblingBtn) {
        addSiblingBtn.onclick = () => {
            if (!map) return;
            const id = addSibling(map, selectedId);
            if (id) {
                selectedId = id;
                needsCenterOnRoot = false;
                markLayoutDirty();
                update();
                markMapChanged();
                startEditing(id);
            }
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (!map) return;
            deleteNode(map, selectedId);
            selectedId = map.rootId;
            needsCenterOnRoot = false;
            markLayoutDirty();
            update();
            markMapChanged();
        };
    }

    if (newBtn) {
        newBtn.onclick = () => {
            const fresh = createEmptyMap();
            markLayoutDirty();
            setCurrentMap(fresh, { center: true, remember: false });
            markMapChanged();
            startEditing(selectedId);
        };
    }

    if (imageBtn) {
        imageBtn.onclick = () => {
            imageInput.value = '';
            imageInput.click();
        };
    }

    if (imageInput) {
        imageInput.addEventListener('change', e => {
            if (!map) return;
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
                    markLayoutDirty();
                    update();
                    markMapChanged();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            if (!map) return;
            const json = JSON.stringify(map, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${map.title || 'mindmap'}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        };
    }

    if (loadBtn) {
        loadBtn.onclick = () => {
            loadInput.value = '';
            loadInput.click();
        };
    }

    if (loadInput) {
        loadInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    ensureSettings(parsed);
                    setCurrentMap(parsed, { center: true });
                } catch (err) {
                    alert('Invalid JSON');
                }
            };
            reader.readAsText(file);
        });
    }

    if (fitBtn) {
        fitBtn.onclick = () => fitToScreen();
    }

    if (exportPdfBtn) {
        exportPdfBtn.onclick = () => {
            if (!map) return;
            exportPdf(svgElement, map, pan);
        };
    }

    if (exportImageBtn) {
        exportImageBtn.onclick = () => {
            if (!map) return;
            exportImage(svgElement, map, pan);
        };
    }

    if (exportMdBtn) {
        exportMdBtn.onclick = () => {
            if (!map) return;
            exportMarkdown(map);
        };
    }

    if (newFolderBtn) {
        newFolderBtn.onclick = createFolder;
    }

    if (configBtn) {
        configBtn.onclick = openConfig;
    }

    if (configCancelBtn) {
        configCancelBtn.addEventListener('click', closeConfig);
    }

    if (helpBtn) {
        helpBtn.onclick = () => {
            helpModal.classList.remove('hidden');
            modalBackdrop.classList.remove('hidden');
        };
    }
    if (helpCloseBtn) {
        helpCloseBtn.addEventListener('click', closeHelp);
    }

    if (addLevelColorBtn) {
        addLevelColorBtn.addEventListener('click', () => {
            const nextIndex = levelColorsContainer.querySelectorAll('input[type="color"]').length;
            addColorInput(nextIndex, DEFAULTS.levelColors[nextIndex % DEFAULTS.levelColors.length] || '#ffffff');
        });
    }

    if (configForm) {
        configForm.addEventListener('submit', e => {
            e.preventDefault();
            if (!map) return;
            const colorInputs = levelColorsContainer.querySelectorAll('input[type="color"]');
            const colors = Array.from(colorInputs).map(input => input.value);
            map.settings.levelColors = colors.length ? colors : [...DEFAULTS.levelColors];
            map.settings.fontFamily = fontFamilyInput.value || DEFAULTS.fontFamily;
            const parsed = parseInt(fontSizeInput.value, 10);
            map.settings.fontSize = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS.fontSize;
            if (autosaveDelayInput) {
                const autosaveParsed = parseInt(autosaveDelayInput.value, 10);
                map.settings.autosaveDelay = Number.isFinite(autosaveParsed) && autosaveParsed >= MIN_AUTOSAVE_DELAY
                    ? autosaveParsed
                    : DEFAULTS.autosaveDelay;
            }
            closeConfig();
            markLayoutDirty();
            update();
            markMapChanged();
        });
    }

    viewport.addEventListener('click', e => {
        if (!map) return;
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

    viewport.addEventListener('dblclick', e => {
        if (!map) return;
        const g = e.target.closest('.node');
        if (g) {
            startEditing(g.dataset.id);
        }
    });

    svgElement.addEventListener('mousedown', e => {
        if (!map) return;
        if (e.button !== 0) return;
        const node = e.target.closest('.node');
        if (node) {
            e.preventDefault();
            startNodeDrag(node, e);
            return;
        }
        isPanning = true;
        panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    });

    document.addEventListener('mousemove', e => {
        if (!map) return;
        if (dragState) {
            updateNodeDrag(e);
            return;
        }
        if (isPanning) {
            pan.x = e.clientX - panStart.x;
            pan.y = e.clientY - panStart.y;
            scheduleUpdate();
        }
    });

    document.addEventListener('mouseup', () => {
        if (dragState) {
            endNodeDrag();
        }
        isPanning = false;
    });

    svgElement.addEventListener('wheel', e => {
        if (!map) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        pan.scale = Math.min(2, Math.max(0.25, pan.scale + delta));
        scheduleUpdate();
    }, { passive: false });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch {}
            window.location.href = '/login';
        });
    }

    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            window.location.href = '/admin';
        });
    }

    window.addEventListener('keydown', e => {
        if (!map) return;
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            addChildBtn?.onclick();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addSiblingBtn?.onclick();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteBtn?.onclick();
        } else if (e.key === 'f' && e.ctrlKey) {
            e.preventDefault();
            fitToScreen();
        } else if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            if (selectedId) {
                clipboard = copySubtree(map, selectedId);
                console.log('Copied node:', selectedId);
            }
        } else if (e.key === 'v' && e.ctrlKey) {
            e.preventDefault();
            if (clipboard && selectedId) {
                const newId = pasteSubtree(map, clipboard, selectedId);
                if (newId) {
                    selectedId = newId;
                    markLayoutDirty();
                    update();
                    markMapChanged();
                }
            }
        } else if (e.key === 'F2') {
            e.preventDefault();
            startEditing(selectedId);
        } else if (e.key === ' ') {
            e.preventDefault();
            if (selectedId && toggleCollapse(map, selectedId)) {
                markLayoutDirty();
                update();
                markMapChanged();
            }
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.ctrlKey) {
            e.preventDefault();
            if (moveSibling(map, selectedId, e.key === 'ArrowUp' ? -1 : 1)) {
                markLayoutDirty();
                update();
                markMapChanged();
            }
        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.ctrlKey) {
            e.preventDefault();
            if (selectedId && map.nodes[selectedId]?.parentId === map.rootId) {
                const newSide = e.key === 'ArrowLeft' ? 'left' : 'right';
                if (setNodeSide(map, selectedId, newSide)) {
                    markLayoutDirty();
                    update();
                    markMapChanged();
                }
            }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            startEditing(selectedId, e.key);
            e.preventDefault();
        }
    });
}

let isPanning = false;
let panStart = { x: 0, y: 0 };

function showApp() {
    appContainer?.classList.remove('hidden');
}

function ensureRemoteEnabled({ silent = false } = {}) {
    if (remoteAvailable) return true;
    if (!silent && remoteDisabledMessage) {
        alert(remoteDisabledMessage);
    }
    return false;
}

function disableRemote(message) {
    remoteAvailable = false;
    remoteDisabledMessage = message || 'Sauvegarde distante indisponible.';
    cancelAutosaveTimer();
    updateRemoteUIState();
    updateSaveStatus();
}

function enableRemote() {
    if (!remoteAvailable) {
        remoteAvailable = true;
        remoteDisabledMessage = '';
        updateRemoteUIState();
        updateSaveStatus();
    }
}

function updateRemoteUIState() {
    if (remoteLoadBtn) {
        remoteLoadBtn.disabled = !remoteAvailable;
        remoteLoadBtn.classList.toggle('disabled', !remoteAvailable);
        remoteLoadBtn.title = remoteAvailable ? '' : remoteDisabledMessage;
    }
    if (remoteSaveBtn) {
        remoteSaveBtn.disabled = !remoteAvailable;
    }
}

async function loadInitialMap() {
    const lastId = localStorage.getItem(LAST_MAP_STORAGE_KEY);
    if (lastId && await loadMapById(lastId, { silentError: true })) {
        return;
    }
    const summaries = await fetchMapSummaries();
    if (summaries && summaries.length) {
        const first = summaries.find(item => item.id) || summaries[0];
        if (first?.id) {
            if (await loadMapById(first.id, { silentError: true })) {
                return;
            }
        }
    }
    const fresh = createEmptyMap();
    setCurrentMap(fresh, { center: true, remember: false });
    markMapChanged();
}

function setCurrentMap(newMap, { center = true, remember = true } = {}) {
    const cloned = typeof structuredClone === 'function'
        ? structuredClone(newMap)
        : JSON.parse(JSON.stringify(newMap));
    map = ensureSettings(cloned);
    selectedId = map.rootId;
    pan = { x: 0, y: 0, scale: 1 };
    needsCenterOnRoot = center;
    layoutDirty = true;
    autosavePending = false;
    lastSaveError = null;
    clearRenderCache();
    if (remember && map?.id) {
        localStorage.setItem(LAST_MAP_STORAGE_KEY, map.id);
    }
    update();
    updateSaveStatus();
}

function update() {
    if (!map) return;
    ensureSettings(map);
    if (layoutDirty) {
        layout(map);
        layoutDirty = false;
    }
    if (needsCenterOnRoot) {
        centerOnRoot();
        needsCenterOnRoot = false;
    }
    render(map, viewport, selectedId);
    viewport.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${pan.scale})`);
    if (map.settings && map.settings.fontFamily) {
        document.body.style.fontFamily = map.settings.fontFamily;
    }
    if (mapTitleInput && document.activeElement !== mapTitleInput) {
        mapTitleInput.value = map.title || 'Sans titre';
    }
    updateDocumentTitle();
    if (editingInput && editingId) {
        const nodeEl = viewport.querySelector(`.node[data-id="${editingId}"]`);
        if (nodeEl) {
            positionEditor(nodeEl.getBoundingClientRect());
            if (map.settings) {
                if (map.settings.fontFamily) editingInput.style.fontFamily = map.settings.fontFamily;
                if (map.settings.fontSize) editingInput.style.fontSize = map.settings.fontSize + 'px';
            }
        }
    }
}

function scheduleUpdate() {
    if (pendingUpdate) return;
    pendingUpdate = true;
    requestAnimationFrame(() => {
        pendingUpdate = false;
        update();
    });
}

function markLayoutDirty() {
    layoutDirty = true;
}

function updateDocumentTitle() {
    if (!map) return;
    document.title = map.title ? `${map.title} – MindMap` : 'MindMap';
}

function centerOnRoot() {
    if (!svgElement || !map) return;
    const root = map.nodes[map.rootId];
    if (!root) return;
    pan.scale = 1;
    const centerX = root.x + root.w / 2;
    const centerY = root.y + root.h / 2;
    pan.x = svgElement.clientWidth / 2 - centerX;
    pan.y = svgElement.clientHeight / 2 - centerY;
}

function fitToScreen() {
    if (!map || !svgElement) return;
    const bbox = viewport.getBBox();
    const w = svgElement.clientWidth;
    const h = svgElement.clientHeight;
    const scale = Math.min(w / (bbox.width + 40), h / (bbox.height + 40));
    const tx = -bbox.x * scale + (w - bbox.width * scale) / 2;
    const ty = -bbox.y * scale + (h - bbox.height * scale) / 2;
    pan = { x: tx, y: ty, scale };
    update();
}

function startNodeDrag(nodeEl, event) {
    const id = nodeEl.dataset.id;
    if (!id || !map || id === map.rootId) return;
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

let lastDropTargetCheck = 0;
const DROP_TARGET_THROTTLE = 50;

function updateNodeDrag(event) {
    if (!dragState || !map) return;
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
    dragState.lastClientX = event.clientX;
    positionDragPreview(event.clientX, event.clientY);

    // Throttle drop target detection
    const now = performance.now();
    if (now - lastDropTargetCheck < DROP_TARGET_THROTTLE) return;
    lastDropTargetCheck = now;

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
    if (!dragState || !map) return;
    const { preview, originEl, id, hasMoved, lastClientX } = dragState;
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
        // If dropped on root, determine side from cursor position
        if (targetId === map.rootId) {
            const rootNode = map.nodes[map.rootId];
            const svgEl = document.getElementById('mindmap');
            const svgRect = svgEl.getBoundingClientRect();
            const rootCenterScreen = svgRect.left + svgRect.width / 2 + (rootNode.x + rootNode.w / 2) * pan.scale + pan.x;
            const side = (lastClientX || 0) < rootCenterScreen ? 'left' : 'right';
            setNodeSide(map, id, side);
        }
        selectedId = id;
        markLayoutDirty();
        update();
        markMapChanged();
    } else if (hasMoved) {
        update();
    }
    suppressClick = hasMoved;
}

function positionDragPreview(clientX, clientY) {
    if (!dragState || !dragState.preview) return;
    const x = clientX - dragState.offsetX;
    const y = clientY - dragState.offsetY;
    dragState.preview.style.transform = `translate(${x}px, ${y}px)`;
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
    if (!dragState || dragState.preview || !map) return;
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

function startEditing(id, initial) {
    if (editingInput || !map) return;
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
                const childId = addChild(map, currentId);
                if (childId) {
                    selectedId = childId;
                    markLayoutDirty();
                    update();
                    markMapChanged();
                    startEditing(childId);
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
    if (!editingInput || !map) return;
    map.nodes[editingId].text = editingInput.value;
    document.body.removeChild(editingInput);
    editingInput = null;
    editingId = null;
    editingOriginalText = null;
    markLayoutDirty();
    update();
    markMapChanged();
}

function openConfig() {
    if (!map) return;
    ensureSettings(map);
    populateColorInputs();
    fontFamilyInput.value = map.settings.fontFamily || DEFAULTS.fontFamily;
    fontSizeInput.value = map.settings.fontSize || DEFAULTS.fontSize;
    if (autosaveDelayInput) {
        autosaveDelayInput.value = map.settings.autosaveDelay || DEFAULTS.autosaveDelay;
        autosaveDelayInput.min = String(MIN_AUTOSAVE_DELAY);
    }
    configModal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
}

function closeConfig() {
    configModal.classList.add('hidden');
    if (mapListModal.classList.contains('hidden') && helpModal.classList.contains('hidden')) {
        modalBackdrop.classList.add('hidden');
    }
}

function closeHelp() {
    helpModal.classList.add('hidden');
    if (configModal.classList.contains('hidden') && mapListModal.classList.contains('hidden')) {
        modalBackdrop.classList.add('hidden');
    }
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

function openMapList() {
    if (!ensureRemoteEnabled()) return;
    currentFolderId = null;
    currentFolderName = null;
    viewingTrash = false;
    mapListModal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
    refreshMapList();
}

function closeMapList() {
    mapListModal.classList.add('hidden');
    if (configModal.classList.contains('hidden') && helpModal.classList.contains('hidden')) {
        modalBackdrop.classList.add('hidden');
    }
}

async function refreshMapList() {
    if (!ensureRemoteEnabled()) return;
    mapListContainer.innerHTML = '<div class="map-list-empty">Chargement…</div>';

    if (viewingTrash) {
        const trashedMaps = await fetchTrashedMaps();
        if (!remoteAvailable) {
            mapListContainer.innerHTML = `<div class="map-list-empty">${remoteDisabledMessage}</div>`;
            return;
        }
        updateBreadcrumb();
        renderTrashList(trashedMaps);
        return;
    }

    const [folders, maps] = await Promise.all([
        fetchFolders(),
        fetchMapSummaries(currentFolderId)
    ]);
    allFolders = folders;
    if (!remoteAvailable) {
        mapListContainer.innerHTML = `<div class="map-list-empty">${remoteDisabledMessage}</div>`;
        return;
    }
    updateBreadcrumb();
    renderMapList(folders, maps);
}

function updateBreadcrumb() {
    if (!breadcrumbEl) return;
    breadcrumbEl.innerHTML = '';
    const root = document.createElement('span');
    root.className = 'breadcrumb-item' + (!currentFolderId && !viewingTrash ? ' active' : '');
    root.textContent = 'Racine';
    if (currentFolderId || viewingTrash) {
        root.style.cursor = 'pointer';
        root.onclick = () => { viewingTrash = false; navigateToFolder(null, null); };
    }
    breadcrumbEl.appendChild(root);

    if (viewingTrash) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = ' > ';
        breadcrumbEl.appendChild(sep);

        const trash = document.createElement('span');
        trash.className = 'breadcrumb-item active';
        trash.textContent = 'Corbeille';
        breadcrumbEl.appendChild(trash);
    } else if (currentFolderId && currentFolderName) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = ' > ';
        breadcrumbEl.appendChild(sep);

        const folder = document.createElement('span');
        folder.className = 'breadcrumb-item active';
        folder.textContent = currentFolderName;
        breadcrumbEl.appendChild(folder);
    }
}

function navigateToFolder(folderId, folderName) {
    currentFolderId = folderId;
    currentFolderName = folderName;
    refreshMapList();
}

function renderMapList(folders, maps) {
    mapListContainer.innerHTML = '';

    // Show folders (only at root level)
    if (!currentFolderId && folders.length) {
        folders.forEach(folder => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'folder-item';

            const left = document.createElement('span');
            left.className = 'folder-label';
            left.textContent = folder.name || 'Sans nom';

            const right = document.createElement('span');
            right.className = 'folder-meta';
            right.textContent = `${folder.mapCount || 0} carte(s)`;

            btn.appendChild(left);
            btn.appendChild(right);

            btn.addEventListener('click', () => navigateToFolder(folder.id, folder.name));

            // Right-click for folder actions
            btn.addEventListener('contextmenu', e => {
                e.preventDefault();
                showFolderActions(folder, btn);
            });

            mapListContainer.appendChild(btn);
        });
    }

    // Show maps
    if (!maps.length && !folders.length) {
        mapListContainer.innerHTML = '<div class="map-list-empty">Aucune carte enregistrée pour le moment.</div>';
    } else if (!maps.length && currentFolderId) {
        const empty = document.createElement('div');
        empty.className = 'map-list-empty';
        empty.textContent = 'Ce dossier est vide.';
        mapListContainer.appendChild(empty);
    } else {
        maps.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';

            const left = document.createElement('div');
            left.className = 'map-info';

            const title = document.createElement('span');
            title.className = 'map-title';
            title.textContent = item.title || 'Sans titre';

            const meta = document.createElement('span');
            meta.className = 'map-meta';
            meta.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '';

            left.appendChild(title);
            left.appendChild(meta);
            btn.appendChild(left);

            // Action buttons
            const actions = document.createElement('div');
            actions.className = 'map-item-actions';

            const moveBtn = document.createElement('span');
            moveBtn.className = 'map-action-btn';
            moveBtn.textContent = 'Deplacer';
            moveBtn.addEventListener('click', e => {
                e.stopPropagation();
                showMoveDialog(item);
            });
            actions.appendChild(moveBtn);

            const trashBtn = document.createElement('span');
            trashBtn.className = 'map-action-btn trash-btn';
            trashBtn.textContent = 'Supprimer';
            trashBtn.addEventListener('click', async e => {
                e.stopPropagation();
                await fetch(`/api/maps/${item.id}/trash`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                refreshMapList();
            });
            actions.appendChild(trashBtn);

            btn.appendChild(actions);

            btn.addEventListener('click', async () => {
                if (await loadMapById(item.id)) {
                    closeMapList();
                }
            });
            mapListContainer.appendChild(btn);
        });
    }

    // Show Corbeille at bottom (only at root level)
    if (!currentFolderId) {
        const trashEntry = document.createElement('button');
        trashEntry.type = 'button';
        trashEntry.className = 'folder-item trash-folder';

        const label = document.createElement('span');
        label.className = 'folder-label trash-label';
        label.textContent = 'Corbeille';

        trashEntry.appendChild(label);
        trashEntry.addEventListener('click', () => {
            viewingTrash = true;
            refreshMapList();
        });
        mapListContainer.appendChild(trashEntry);
    }
}

async function fetchTrashedMaps() {
    if (!ensureRemoteEnabled({ silent: true })) return [];
    try {
        const resp = await fetch(`${MAPS_ENDPOINT}?id=0&trashed=1`, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        return Array.isArray(data) ? data : (data?.maps || []);
    } catch {
        return [];
    }
}

function renderTrashList(maps) {
    mapListContainer.innerHTML = '';

    if (!maps.length) {
        mapListContainer.innerHTML = '<div class="map-list-empty">La corbeille est vide.</div>';
        return;
    }

    maps.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';

        const left = document.createElement('div');
        left.className = 'map-info';

        const title = document.createElement('span');
        title.className = 'map-title';
        title.textContent = item.title || 'Sans titre';

        const meta = document.createElement('span');
        meta.className = 'map-meta';
        meta.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '';

        left.appendChild(title);
        left.appendChild(meta);
        btn.appendChild(left);

        const actions = document.createElement('div');
        actions.className = 'map-item-actions';

        const restoreBtn = document.createElement('span');
        restoreBtn.className = 'map-action-btn';
        restoreBtn.textContent = 'Restaurer';
        restoreBtn.addEventListener('click', async e => {
            e.stopPropagation();
            await fetch(`/api/maps/${item.id}/restore`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include'
            });
            refreshMapList();
        });
        actions.appendChild(restoreBtn);

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'map-action-btn trash-btn';
        deleteBtn.textContent = 'Supprimer';
        deleteBtn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm(`Supprimer definitivement "${item.title}" ?`)) return;
            await fetch(`/api/maps/${item.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
                credentials: 'include'
            });
            refreshMapList();
        });
        actions.appendChild(deleteBtn);

        btn.appendChild(actions);
        mapListContainer.appendChild(btn);
    });
}

async function fetchFolders() {
    if (!ensureRemoteEnabled({ silent: true })) return [];
    try {
        const resp = await fetch('/api/folders', {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        if (!resp.ok) return [];
        return await resp.json();
    } catch {
        return [];
    }
}

async function createFolder() {
    const name = prompt('Nom du dossier:');
    if (!name || !name.trim()) return;
    try {
        const resp = await fetch('/api/folders', {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ name: name.trim() })
        });
        if (resp.ok) refreshMapList();
    } catch (err) {
        console.error('Failed to create folder:', err);
    }
}

function showFolderActions(folder, btnEl) {
    // Remove existing menu
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const renameOption = document.createElement('button');
    renameOption.textContent = 'Renommer';
    renameOption.onclick = async () => {
        menu.remove();
        const newName = prompt('Nouveau nom:', folder.name);
        if (!newName || !newName.trim()) return;
        await fetch(`/api/folders/${folder.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ name: newName.trim() })
        });
        refreshMapList();
    };

    const deleteOption = document.createElement('button');
    deleteOption.textContent = 'Supprimer';
    deleteOption.onclick = async () => {
        menu.remove();
        if (!confirm(`Supprimer le dossier "${folder.name}" ? Les cartes seront deplacees a la racine.`)) return;
        await fetch(`/api/folders/${folder.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        refreshMapList();
    };

    menu.appendChild(renameOption);
    menu.appendChild(deleteOption);

    // Position near button
    const rect = btnEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = rect.bottom + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function close() {
            menu.remove();
            document.removeEventListener('click', close);
        }, { once: true });
    }, 0);
}

function showMoveDialog(mapItem) {
    // Remove existing menu
    document.querySelectorAll('.context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu move-menu';

    const header = document.createElement('div');
    header.className = 'move-menu-header';
    header.textContent = 'Deplacer vers:';
    menu.appendChild(header);

    // Root option
    const rootBtn = document.createElement('button');
    rootBtn.textContent = 'Racine';
    rootBtn.onclick = async () => {
        menu.remove();
        await fetch(`/api/maps/${mapItem.id}/move`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ folderId: null })
        });
        refreshMapList();
    };
    if (!mapItem.folderId) rootBtn.disabled = true;
    menu.appendChild(rootBtn);

    // Folder options
    allFolders.forEach(folder => {
        const btn = document.createElement('button');
        btn.textContent = folder.name;
        btn.onclick = async () => {
            menu.remove();
            await fetch(`/api/maps/${mapItem.id}/move`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ folderId: folder.id })
            });
            refreshMapList();
        };
        if (mapItem.folderId === folder.id) btn.disabled = true;
        menu.appendChild(btn);
    });

    menu.style.position = 'fixed';
    menu.style.top = '50%';
    menu.style.left = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 0);
}

async function loadMapById(id, { silentError = false } = {}) {
    if (!id) return false;
    if (!ensureRemoteEnabled({ silent: silentError })) return false;
    try {
        const resp = await fetch(`${MAPS_ENDPOINT}?id=${encodeURIComponent(id)}`, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        if (resp.status === 401) {
            window.location.href = '/login';
            return false;
        }
        if (resp.status === 403) {
            // Map belongs to another user, just skip
            return false;
        }
        if (resp.status === 404) {
            return false;
        }
        if (!resp.ok) {
            throw new Error(`Chargement impossible (${resp.status})`);
        }
        enableRemote();
        const data = await resp.json();
        const loadedMap = data?.map || data?.data || data;
        if (!loadedMap || !loadedMap.nodes) {
            throw new Error('Format de carte invalide');
        }
        ensureSettings(loadedMap);
        setCurrentMap(loadedMap, { center: true, remember: true });
        return true;
    } catch (err) {
        console.error(err);
        if (!silentError) {
            alert(err.message || 'Impossible de charger la carte.');
        }
        if (isNetworkError(err)) {
            disableRemote('Impossible de contacter l\'API distante.');
        }
        return false;
    }
}

async function fetchMapSummaries(folderId) {
    if (!ensureRemoteEnabled({ silent: true })) return [];
    try {
        let url = `${MAPS_ENDPOINT}?id=0`;
        if (folderId) {
            url += `&folder_id=${encodeURIComponent(folderId)}`;
        } else if (folderId === null) {
            url += '&folder_id=root';
        }
        const resp = await fetch(url, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        if (resp.status === 401) {
            window.location.href = '/login';
            return [];
        }
        if (resp.status === 403) {
            disableRemote('Acces refuse.');
            return [];
        }
        if (resp.status === 404) {
            disableRemote('Endpoint distant introuvable.');
            return [];
        }
        if (!resp.ok) return [];
        enableRemote();
        const data = await resp.json();
        return Array.isArray(data) ? data : (data?.maps || []);
    } catch (err) {
        console.error(err);
        if (isNetworkError(err)) {
            disableRemote('Impossible de contacter l\'API distante.');
        }
        return [];
    }
}

function getAuthHeaders() {
    return { 'Content-Type': 'application/json' };
}

function markMapChanged() {
    if (!map) return;
    map.updatedAt = Date.now();
    autosavePending = true;
    if (remoteAvailable) {
        scheduleAutosave();
    }
    updateSaveStatus();
}

function scheduleAutosave() {
    if (!remoteAvailable) return;
    if (autosaveInFlight) return;
    cancelAutosaveTimer();
    autosaveTimer = setTimeout(runAutosave, getAutosaveDelay());
}

function cancelAutosaveTimer() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
}

async function runAutosave() {
    if (!map || !remoteAvailable) {
        cancelAutosaveTimer();
        return;
    }
    if (autosaveInFlight) return;
    if (!autosavePending) {
        cancelAutosaveTimer();
        return;
    }
    cancelAutosaveTimer();
    autosaveInFlight = true;
    autosavePending = false;
    lastSaveError = null;
    updateSaveStatus();
    try {
        const payload = {
            id: map.id || null,
            title: map.title,
            map
        };
        const resp = await fetch(MAPS_ENDPOINT, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        if (resp.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (resp.status === 403) {
            disableRemote('Acces refuse.');
            throw new Error('Acces refuse.');
        }
        if (resp.status === 404) {
            disableRemote('Endpoint distant introuvable.');
            throw new Error('API distante introuvable.');
        }
        if (!resp.ok) {
            throw new Error(`Sauvegarde impossible (${resp.status})`);
        }
        enableRemote();
        const data = await resp.json().catch(() => ({}));
        if (data?.id) {
            map.id = data.id;
            localStorage.setItem(LAST_MAP_STORAGE_KEY, data.id);
        }
        if (data?.title) {
            map.title = data.title;
        }
        if (data?.updatedAt) {
            map.updatedAt = data.updatedAt;
        }
        update();
    } catch (err) {
        console.error(err);
        lastSaveError = err;
        autosavePending = true;
        if (isNetworkError(err)) {
            disableRemote('Impossible de contacter l\'API distante.');
        }
    } finally {
        autosaveInFlight = false;
        updateSaveStatus();
        if (autosavePending && remoteAvailable) {
            scheduleAutosave();
        }
    }
}

function getAutosaveDelay() {
    if (!map) return DEFAULTS.autosaveDelay;
    const delay = Number(map.settings?.autosaveDelay);
    if (Number.isFinite(delay) && delay >= MIN_AUTOSAVE_DELAY) {
        return delay;
    }
    return DEFAULTS.autosaveDelay;
}

function updateSaveStatus() {
    if (!saveStatusEl) return;
    saveStatusEl.classList.remove('saving', 'error');
    if (!remoteAvailable) {
        saveStatusEl.textContent = remoteDisabledMessage || 'Sauvegarde automatique indisponible';
        saveStatusEl.classList.add('error');
        return;
    }
    if (autosaveInFlight) {
        saveStatusEl.textContent = 'Sauvegarde en cours…';
        saveStatusEl.classList.add('saving');
        return;
    }
    if (lastSaveError) {
        saveStatusEl.textContent = 'Erreur de sauvegarde. Nouvelle tentative…';
        saveStatusEl.classList.add('error');
        return;
    }
    if (autosavePending) {
        saveStatusEl.textContent = 'Sauvegarde en attente…';
        return;
    }
    saveStatusEl.textContent = 'Toutes les modifications sont sauvegardées';
}

function isNetworkError(err) {
    return err && err.name === 'TypeError';
}
