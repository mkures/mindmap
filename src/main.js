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
    setNodeSide,
    addFreeBubble,
    addLink,
    deleteLink,
    addTagDef,
    removeTagDef,
    toggleNodeTag,
    addFrame,
    deleteFrame,
    updateFrame,
    getNodesInFrame
} from './model.js';
import { layout } from './layout.js';
import { render, clearRenderCache, setSelectedLinkId, setSelectedFrameId } from './render.js';
import { exportMarkdown, exportImage, exportPdf } from './export.js';
import { initOutline, renderOutline } from './outline.js';
import { getTemplates, buildFromTemplate } from './templates.js';
import { initCommandPalette, openCommandPalette } from './command-palette.js';
import { openEmojiPicker, closeEmojiPicker } from './emoji-picker.js';

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
const shareBtn = document.getElementById('shareBtn');
const outlineBtn = document.getElementById('outlineBtn');
const outlineView = document.getElementById('outlineView');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const exportDropBtn = document.getElementById('exportDropBtn');
const exportDropMenu = document.getElementById('exportDropMenu');
const outlineContent = document.getElementById('outlineContent');

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
let selectedLinkId = null; // Currently selected free link
let linkPreviewEl = null; // Temporary SVG line during link creation

// Undo/Redo history
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

// Search state
let searchMatches = [];
let searchIndex = -1;
let activeTagFilter = null; // tag ID for filtering

// Multi-selection
let multiSelected = new Set();

const FRAME_COLORS = [
    { label: 'Bleu',   fill: '#dbeafe' },
    { label: 'Vert',   fill: '#dcfce7' },
    { label: 'Jaune',  fill: '#fef9c3' },
    { label: 'Rose',   fill: '#fce7f3' },
    { label: 'Violet', fill: '#ede9fe' },
    { label: 'Gris',   fill: '#f3f4f6' },
];
let selectedFrameId = null;

let currentFolderId = null; // null = root
let currentFolderName = null;
let allFolders = [];
let viewingTrash = false;
let outlineMode = false;
let focusRootId = null; // Focus mode: if set, only this subtree is visible

// ── Toast notification system ──
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast${type !== 'info' ? ' toast-' + type : ''}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2500);
}

// ── Zoom HUD updater ──
function updateHud() {
    const hud = document.getElementById('zoomHud');
    if (!hud || !map) return;
    const pct = Math.round(pan.scale * 100);
    const count = Object.keys(map.nodes).length;
    hud.textContent = `${pct}% · ${count} nœuds`;
}

init();

async function init() {
    await loadCurrentUser();
    updateSaveStatus();
    wireUI();
    updateRemoteUIState();
    updateUndoRedoButtons();
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
            closeNoteModal();
            closeNoteViewModal();
        });
    }

    if (addChildBtn) {
        addChildBtn.onclick = () => {
            if (!map) return;
            pushUndo();
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
            pushUndo();
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
            // Delete selected link first
            if (selectedLinkId) {
                deleteLink(map, selectedLinkId);
                selectLink(null);
                update();
                markMapChanged();
                return;
            }
            pushUndo();
            // Delete multi-selected nodes
            if (multiSelected.size > 0) {
                for (const id of multiSelected) deleteNode(map, id);
                multiSelected.clear();
            } else {
                deleteNode(map, selectedId);
            }
            selectedId = map.rootId;
            needsCenterOnRoot = false;
            markLayoutDirty();
            update();
            markMapChanged();
        };
    }

    if (newBtn) {
        newBtn.onclick = () => {
            showTemplatePicker();
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
                    if (w >= h && w > max) scale = max / w;
                    else if (h > w && h > max) scale = max / h;
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/png');
                    if (!selectedId) return;
                    setNodeImage(map, selectedId, {
                        kind: 'image',
                        dataUrl,
                        originalDataUrl: ev.target.result,
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

    // ── Clipboard paste image (Ctrl+V) ──
    document.addEventListener('paste', e => {
        if (!map) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target.isContentEditable) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    const img = new Image();
                    img.onload = () => {
                        const max = 128;
                        let w = img.width, h = img.height, scale = 1;
                        if (w >= h && w > max) scale = max / w;
                        else if (h > w && h > max) scale = max / h;
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        const dataUrl = canvas.toDataURL('image/png');

                        if (selectedId) {
                            // Paste onto selected node
                            pushUndo();
                            setNodeImage(map, selectedId, {
                                kind: 'image', dataUrl,
                                originalDataUrl: ev.target.result,
                                width: w, height: h,
                                naturalWidth: img.width, naturalHeight: img.height
                            });
                        } else {
                            // Create new free bubble with image
                            pushUndo();
                            const svgW = svgElement.clientWidth;
                            const svgH = svgElement.clientHeight;
                            const fx = (svgW / 2 - pan.x) / pan.scale;
                            const fy = (svgH / 2 - pan.y) / pan.scale;
                            const bubble = addFreeBubble(map, fx, fy);
                            if (bubble) {
                                setNodeImage(map, bubble.id || bubble, {
                                    kind: 'image', dataUrl,
                                    originalDataUrl: ev.target.result,
                                    width: w, height: h,
                                    naturalWidth: img.width, naturalHeight: img.height
                                });
                            }
                        }
                        markLayoutDirty();
                        update();
                        markMapChanged();
                        showToast('Image collée', 'success');
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
                return;
            }
        }
    });

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
                    showToast('Format JSON invalide', 'error');
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

    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.onclick = openHistory;
    }
    const historyCloseBtn = document.getElementById('historyCloseBtn');
    if (historyCloseBtn) {
        historyCloseBtn.onclick = () => {
            document.getElementById('historyModal')?.classList.add('hidden');
            const configHidden = document.getElementById('configModal')?.classList.contains('hidden') !== false;
            const helpHidden = document.getElementById('helpModal')?.classList.contains('hidden') !== false;
            const mapListHidden = document.getElementById('mapListModal')?.classList.contains('hidden') !== false;
            if (configHidden && helpHidden && mapListHidden) {
                modalBackdrop.classList.add('hidden');
            }
        };
    }

    // Undo / Redo buttons
    if (undoBtn) {
        undoBtn.onclick = () => undo();
    }
    if (redoBtn) {
        redoBtn.onclick = () => redo();
    }

    // Export dropdown
    if (exportDropBtn && exportDropMenu) {
        exportDropBtn.onclick = (e) => {
            e.stopPropagation();
            exportDropMenu.classList.toggle('open');
        };
        document.addEventListener('mousedown', (e) => {
            if (exportDropMenu.classList.contains('open') && !exportDropMenu.contains(e.target) && e.target !== exportDropBtn) {
                exportDropMenu.classList.remove('open');
            }
        });
        // Close dropdown after any export button click
        exportDropMenu.addEventListener('click', () => {
            exportDropMenu.classList.remove('open');
        });
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
            const clickedId = g.dataset.id;
            if (e.shiftKey) {
                // Multi-select toggle
                if (multiSelected.has(clickedId)) {
                    multiSelected.delete(clickedId);
                } else {
                    multiSelected.add(clickedId);
                }
                if (!multiSelected.has(selectedId) && selectedId) multiSelected.add(selectedId);
            } else {
                multiSelected.clear();
            }
            selectedId = clickedId;
            update();
        }
    });

    svgElement.addEventListener('dblclick', e => {
        if (!map) return;
        const g = e.target.closest('.node');
        if (g) {
            startEditing(g.dataset.id);
            return;
        }
        const frameEl = e.target.closest('.frame');
        if (frameEl) {
            startFrameTitleEdit(frameEl.dataset.frameId);
        }
    });

    // ── Node hover state (event delegation) ──
    let hoveredEl = null;
    svgElement.addEventListener('mouseover', e => {
        if (dragState) return;
        const nodeEl = e.target.closest('.node');
        if (nodeEl && nodeEl !== hoveredEl) {
            if (hoveredEl) hoveredEl.classList.remove('hovered');
            nodeEl.classList.add('hovered');
            hoveredEl = nodeEl;
        }
    });
    svgElement.addEventListener('mouseout', e => {
        const nodeEl = e.target.closest('.node');
        if (nodeEl && nodeEl === hoveredEl) {
            nodeEl.classList.remove('hovered');
            hoveredEl = null;
        }
    });

    svgElement.addEventListener('mousedown', e => {
        if (!map) return;
        if (e.button !== 0) return;

        // Check for free-link click (click on link hit area)
        const freeLinkEl = e.target.closest('.free-link');
        if (freeLinkEl) {
            e.preventDefault();
            const linkId = freeLinkEl.dataset.linkId;
            selectLink(linkId);
            selectedId = null;
            update();
            return;
        }

        // Click on collapse indicator → toggle collapse
        const collapseEl = e.target.closest('.collapse-indicator');
        if (collapseEl) {
            const nodeEl = collapseEl.closest('.node');
            if (nodeEl) {
                e.preventDefault();
                e.stopPropagation();
                const id = nodeEl.dataset.id;
                selectedId = id;
                if (toggleCollapse(map, id)) {
                    markLayoutDirty();
                    update();
                    markMapChanged();
                }
                return;
            }
        }

        const nodeEl = e.target.closest('.node');
        if (nodeEl) {
            // Clicking on a node deselects the link and frame
            if (selectedLinkId) {
                selectLink(null);
                update();
            }
            if (selectedFrameId) {
                selectFrame(null);
                update();
            }
            e.preventDefault();
            startNodeDrag(nodeEl, e);
            return;
        }

        // Frame click
        const frameEl = e.target.closest('.frame');
        if (frameEl) {
            const frameId = frameEl.dataset.frameId;
            selectFrame(frameId);
            selectedId = null;
            e.preventDefault();
            startFrameInteraction(frameId, e);
            update();
            return;
        }

        // Click on canvas background → deselect link and frame
        if (selectedLinkId) {
            selectLink(null);
            update();
        }
        if (selectedFrameId) {
            selectFrame(null);
            update();
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
        pan.scale = Math.min(5, Math.max(0.05, pan.scale + delta));
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

    if (shareBtn) {
        shareBtn.onclick = async () => {
            if (!map || !map.id) {
                showToast('Sauvegardez la carte avant de la partager.', 'error');
                return;
            }
            try {
                const resp = await fetch(`/api/maps/${map.id}/share`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                if (!resp.ok) { showToast('Impossible de générer le lien de partage.', 'error'); return; }
                const data = await resp.json();
                const url = `${location.origin}/s/${data.token}`;
                await navigator.clipboard.writeText(url).catch(() => {});
                showToast('Lien de partage copié !', 'success');
            } catch {
                showToast('Erreur lors de la génération du lien.', 'error');
            }
        };
    }

    if (outlineBtn) {
        outlineBtn.onclick = () => toggleOutline();
    }

    svgElement.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!map) return;
        const nodeEl = e.target.closest('.node');
        if (nodeEl) {
            showNodeContextMenu(e.clientX, e.clientY, nodeEl.dataset.id);
        } else {
            const frameEl = e.target.closest('.frame');
            if (frameEl) {
                const frameId = frameEl.dataset.frameId;
                selectFrame(frameId);
                update();
                showFrameContextMenu(e.clientX, e.clientY, frameId);
            } else {
                showCanvasContextMenu(e.clientX, e.clientY, e);
            }
        }
    });

    // Note modal wiring
    const noteCloseBtn = document.getElementById('noteCloseBtn');
    if (noteCloseBtn) noteCloseBtn.addEventListener('click', closeNoteModal);
    const noteSaveBtn = document.getElementById('noteSaveBtn');
    if (noteSaveBtn) noteSaveBtn.addEventListener('click', closeNoteModal);

    // Lightbox
    const lightboxModal = document.getElementById('lightboxModal');
    if (lightboxModal) {
        lightboxModal.addEventListener('click', closeLightbox);
    }
    // Note view modal
    const noteViewCloseBtn = document.getElementById('noteViewCloseBtn');
    if (noteViewCloseBtn) noteViewCloseBtn.addEventListener('click', closeNoteViewModal);

    document.addEventListener('mindmap:image-click', e => {
        openLightbox(e.detail.dataUrl);
    });

    const addTagDefBtn = document.getElementById('addTagDefBtn');
    if (addTagDefBtn) {
        addTagDefBtn.addEventListener('click', () => {
            if (!map) return;
            const nameInput = document.getElementById('newTagNameInput');
            const colorInput = document.getElementById('newTagColorInput');
            const name = nameInput?.value?.trim();
            if (!name) return;
            addTagDef(map, name, colorInput?.value || '#94a3b8');
            if (nameInput) nameInput.value = '';
            populateTagDefs();
            update();
            markMapChanged();
        });
    }

    // Auto-switch to outline on mobile
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) toggleOutline(true);
    mq.addEventListener('change', e => {
        if (e.matches && !outlineMode) toggleOutline(true);
        else if (!e.matches && outlineMode) toggleOutline(false);
    });

    // Search bar events
    const searchInput = document.getElementById('searchInput');
    const searchBar = document.getElementById('searchBar');
    if (searchInput) {
        searchInput.addEventListener('input', () => runSearch(searchInput.value));
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') { closeSearch(); e.preventDefault(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    searchIndex = searchMatches.length ? (searchIndex - 1 + searchMatches.length) % searchMatches.length : -1;
                } else {
                    searchIndex = searchMatches.length ? (searchIndex + 1) % searchMatches.length : -1;
                }
                updateSearchHighlights();
                navigateToSearchResult();
            }
        });
    }
    document.getElementById('searchClose')?.addEventListener('click', e => {
        e.stopPropagation();
        closeSearch();
    });
    document.getElementById('searchPrev')?.addEventListener('click', () => {
        if (searchMatches.length) {
            searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
            updateSearchHighlights();
            navigateToSearchResult();
        }
    });
    document.getElementById('searchNext')?.addEventListener('click', () => {
        if (searchMatches.length) {
            searchIndex = (searchIndex + 1) % searchMatches.length;
            updateSearchHighlights();
            navigateToSearchResult();
        }
    });

    window.addEventListener('keydown', e => {
        if (!map) return;
        // Command palette
        if (e.key === 'k' && e.ctrlKey) {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        // Allow Ctrl+F and Escape from search input
        if (e.key === 'f' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            openSearch();
            return;
        }
        // Focus mode: Ctrl+Shift+F to toggle, Escape to exit
        if (e.key === 'F' && e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            if (focusRootId) {
                exitFocusMode();
            } else if (selectedId) {
                enterFocusMode(selectedId);
            }
            return;
        }
        if (e.key === 'Escape' && focusRootId) {
            e.preventDefault();
            exitFocusMode();
            return;
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target.isContentEditable) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            addChildBtn?.onclick();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addSiblingBtn?.onclick();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            if (selectedLinkId) {
                pushUndo();
                deleteLink(map, selectedLinkId);
                selectLink(null);
                update();
                markMapChanged();
                return;
            }
            if (selectedFrameId) {
                pushUndo();
                deleteFrame(map, selectedFrameId);
                selectFrame(null);
                update();
                markMapChanged();
                return;
            }
            deleteBtn?.onclick();
        } else if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        } else if ((e.key === 'y' && e.ctrlKey) || (e.key === 'z' && e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            redo();
            return;
        } else if (e.key === 'd' && e.ctrlKey) {
            e.preventDefault();
            if (selectedId && selectedId !== map.rootId) {
                pushUndo();
                const subtree = copySubtree(map, selectedId);
                const parentId = map.nodes[selectedId]?.parentId;
                if (subtree && parentId) {
                    const newId = pasteSubtree(map, subtree, parentId);
                    if (newId) {
                        selectedId = newId;
                        markLayoutDirty();
                        update();
                        markMapChanged();
                    }
                }
            }
            return;
        } else if (e.key === 'a' && e.ctrlKey) {
            e.preventDefault();
            multiSelected.clear();
            Object.keys(map.nodes).forEach(id => { if (id !== map.rootId) multiSelected.add(id); });
            update();
            showToast(`${multiSelected.size} nœuds sélectionnés`);
        } else if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            if (multiSelected.size > 0) {
                clipboard = [];
                for (const id of multiSelected) clipboard.push(copySubtree(map, id));
                showToast(`${multiSelected.size} nœuds copiés`, 'success');
            } else if (selectedId) {
                clipboard = copySubtree(map, selectedId);
                showToast('Nœud copié', 'success');
            }
        } else if (e.key === 'v' && e.ctrlKey) {
            e.preventDefault();
            if (clipboard && selectedId) {
                pushUndo();
                if (Array.isArray(clipboard)) {
                    clipboard.forEach(sub => pasteSubtree(map, sub, selectedId));
                } else {
                    const newId = pasteSubtree(map, clipboard, selectedId);
                    if (newId) selectedId = newId;
                }
                markLayoutDirty();
                update();
                markMapChanged();
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
        // ── Arrow key tree navigation (bare, no modifier) ──
        } else if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            if (selectedId) {
                const node = map.nodes[selectedId];
                if (node?.parentId) {
                    selectedId = node.parentId;
                    update();
                    scrollToNode(selectedId);
                }
            }
        } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            if (selectedId) {
                const node = map.nodes[selectedId];
                if (node?.children?.length > 0) {
                    selectedId = node.children[0];
                    update();
                    scrollToNode(selectedId);
                }
            }
        } else if (e.key === 'ArrowUp' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            if (selectedId) {
                const node = map.nodes[selectedId];
                const parent = node?.parentId ? map.nodes[node.parentId] : null;
                if (parent?.children) {
                    const idx = parent.children.indexOf(selectedId);
                    if (idx > 0) {
                        selectedId = parent.children[idx - 1];
                        update();
                        scrollToNode(selectedId);
                    }
                }
            }
        } else if (e.key === 'ArrowDown' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            if (selectedId) {
                const node = map.nodes[selectedId];
                const parent = node?.parentId ? map.nodes[node.parentId] : null;
                if (parent?.children) {
                    const idx = parent.children.indexOf(selectedId);
                    if (idx < parent.children.length - 1) {
                        selectedId = parent.children[idx + 1];
                        update();
                        scrollToNode(selectedId);
                    }
                }
            }
        // ── Home = jump to root ──
        } else if (e.key === 'Home') {
            e.preventDefault();
            selectedId = map.rootId;
            centerOnRoot();
            update();
        // ── Zoom shortcuts ──
        } else if ((e.key === '=' || e.key === '+') && e.ctrlKey) {
            e.preventDefault();
            zoomBy(1.2);
        } else if (e.key === '-' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            zoomBy(1 / 1.2);
        } else if (e.key === '0' && e.ctrlKey) {
            e.preventDefault();
            pan.scale = 1;
            update();
        // ── N = open note ──
        } else if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (selectedId) openNoteModal(selectedId);
        // ── E = emoji picker ──
        } else if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (selectedId) {
                const nodeEl = svgElement.querySelector(`.node[data-id="${selectedId}"]`);
                if (nodeEl) {
                    const rect = nodeEl.getBoundingClientRect();
                    openEmojiPicker(rect.right + 8, rect.top, emoji => {
                        pushUndo();
                        map.nodes[selectedId].text = emoji + ' ' + (map.nodes[selectedId].text || '');
                        update();
                        markMapChanged();
                    });
                }
            }
        } else if (e.key === 'F' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const svgW = svgElement.clientWidth;
            const svgH = svgElement.clientHeight;
            const cx = (svgW / 2 - pan.x) / pan.scale;
            const cy = (svgH / 2 - pan.y) / pan.scale;
            const frame = addFrame(map, cx - 200, cy - 150, 400, 300);
            selectFrame(frame.id);
            update();
            markMapChanged();
            requestAnimationFrame(() => startFrameTitleEdit(frame.id));
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            startEditing(selectedId, e.key);
            e.preventDefault();
        }
    });

    // ── Command palette actions ──
    initCommandPalette([
        { label: 'Ajouter un enfant', shortcut: 'Tab', fn: () => addChildBtn?.onclick() },
        { label: 'Ajouter un frère', shortcut: 'Entrée', fn: () => addSiblingBtn?.onclick() },
        { label: 'Supprimer le nœud', shortcut: 'Suppr', fn: () => deleteBtn?.onclick() },
        { label: 'Modifier le texte', shortcut: 'F2', fn: () => startEditing(selectedId) },
        { label: 'Ouvrir / créer une note', shortcut: 'N', fn: () => { if (selectedId) openNoteModal(selectedId); } },
        { label: 'Plier / déplier', shortcut: 'Espace', fn: () => { if (selectedId && toggleCollapse(map, selectedId)) { markLayoutDirty(); update(); markMapChanged(); } } },
        { label: 'Aller à la racine', shortcut: 'Home', fn: () => { selectedId = map?.rootId; centerOnRoot(); update(); } },
        { label: 'Adapter à l\'écran', shortcut: '', fn: () => fitToScreen() },
        { label: 'Mode focus', shortcut: 'Ctrl+Shift+F', fn: () => { if (focusRootId) exitFocusMode(); else if (selectedId) enterFocusMode(selectedId); } },
        { label: 'Rechercher', shortcut: 'Ctrl+F', fn: () => openSearch() },
        { label: 'Annuler', shortcut: 'Ctrl+Z', fn: () => undo() },
        { label: 'Rétablir', shortcut: 'Ctrl+Y', fn: () => redo() },
        { label: 'Nouvelle carte', shortcut: '', fn: () => showTemplatePicker() },
        { label: 'Ouvrir une carte', shortcut: '', fn: () => loadBtn?.click() },
        { label: 'Exporter en Markdown', shortcut: '', fn: () => { if (map) exportMarkdown(map); } },
        { label: 'Exporter en PNG', shortcut: '', fn: () => { if (map) exportImage(map, viewport); } },
        { label: 'Exporter en PDF', shortcut: '', fn: () => { if (map) exportPdf(map, viewport); } },
        { label: 'Vue Plan / Outline', shortcut: '', fn: () => toggleOutline() },
        { label: 'Configuration', shortcut: '', fn: () => configBtn?.click() },
        { label: 'Zoom +', shortcut: 'Ctrl+=', fn: () => zoomBy(1.2) },
        { label: 'Zoom -', shortcut: 'Ctrl+-', fn: () => zoomBy(1/1.2) },
        { label: 'Zoom 100%', shortcut: 'Ctrl+0', fn: () => { pan.scale = 1; update(); } },
        { label: 'Insérer un emoji', shortcut: 'E', fn: () => {
            if (selectedId) {
                const nodeEl = svgElement.querySelector(`.node[data-id="${selectedId}"]`);
                if (nodeEl) {
                    const rect = nodeEl.getBoundingClientRect();
                    openEmojiPicker(rect.right + 8, rect.top, emoji => {
                        pushUndo();
                        map.nodes[selectedId].text = emoji + ' ' + (map.nodes[selectedId].text || '');
                        update();
                        markMapChanged();
                    });
                }
            }
        }},
        { label: 'Ajouter un cadre', shortcut: 'F', fn: () => { const svgW = svgElement.clientWidth; const svgH = svgElement.clientHeight; const cx = (svgW/2-pan.x)/pan.scale; const cy = (svgH/2-pan.y)/pan.scale; const frame = addFrame(map,cx-200,cy-150,400,300); selectFrame(frame.id); update(); markMapChanged(); } },
    ]);
}

let isPanning = false;
let panStart = { x: 0, y: 0 };

function showApp() {
    appContainer?.classList.remove('hidden');
}

function ensureRemoteEnabled({ silent = false } = {}) {
    if (remoteAvailable) return true;
    if (!silent && remoteDisabledMessage) {
        showToast(remoteDisabledMessage, 'error');
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
    selectLink(null);
    selectFrame(null);
    clearRenderCache();
    undoStack = [];
    redoStack = [];
    multiSelected.clear();
    activeTagFilter = null;
    closeSearch();
    if (remember && map?.id) {
        localStorage.setItem(LAST_MAP_STORAGE_KEY, map.id);
    }
    update();
    updateSaveStatus();
}

// ── Undo / Redo ─────────────────────────────────────────────
function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function pushUndo() {
    if (!map) return;
    const snapshot = JSON.parse(JSON.stringify(map));
    // Strip large image data from undo snapshots
    Object.values(snapshot.nodes || {}).forEach(n => {
        if (n.media?.originalDataUrl) delete n.media.originalDataUrl;
    });
    undoStack.push(JSON.stringify(snapshot));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (!undoStack.length || !map) return;
    redoStack.push(JSON.stringify(map));
    const prev = JSON.parse(undoStack.pop());
    const mapId = map.id;
    map = ensureSettings(prev);
    map.id = mapId; // preserve ID
    selectedId = map.rootId;
    multiSelected.clear();
    layoutDirty = true;
    clearRenderCache();
    update();
    markMapChanged();
    updateUndoRedoButtons();
}

function redo() {
    if (!redoStack.length || !map) return;
    undoStack.push(JSON.stringify(map));
    const next = JSON.parse(redoStack.pop());
    const mapId = map.id;
    map = ensureSettings(next);
    map.id = mapId;
    selectedId = map.rootId;
    multiSelected.clear();
    layoutDirty = true;
    clearRenderCache();
    update();
    markMapChanged();
    updateUndoRedoButtons();
}

// ── Search ──────────────────────────────────────────────────
function openSearch() {
    const bar = document.getElementById('searchBar');
    const input = document.getElementById('searchInput');
    bar?.classList.remove('hidden');
    input.value = '';
    input?.focus();
    searchMatches = [];
    searchIndex = -1;
    updateSearchHighlights();
}

function closeSearch() {
    const bar = document.getElementById('searchBar');
    bar?.classList.add('hidden');
    searchMatches = [];
    searchIndex = -1;
    clearSearchHighlights();
}

function runSearch(query) {
    if (!map || !query.trim()) {
        searchMatches = [];
        searchIndex = -1;
        updateSearchHighlights();
        return;
    }
    const q = query.toLowerCase();
    searchMatches = Object.values(map.nodes).filter(n =>
        (n.text || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q)
    ).map(n => n.id);
    searchIndex = searchMatches.length > 0 ? 0 : -1;
    updateSearchHighlights();
    navigateToSearchResult();
}

function navigateToSearchResult() {
    if (searchIndex < 0 || !searchMatches.length) return;
    const nodeId = searchMatches[searchIndex];
    const node = map.nodes[nodeId];
    if (!node) return;

    // Uncollapse ancestors so the node is visible
    let current = map.nodes[node.parentId];
    let needsLayout = false;
    while (current) {
        if (current.collapsed) { current.collapsed = false; needsLayout = true; }
        current = map.nodes[current.parentId];
    }
    if (needsLayout) { markLayoutDirty(); update(); }

    selectedId = nodeId;
    // Center on the node
    const svgW = svgElement.clientWidth;
    const svgH = svgElement.clientHeight;
    const nx = (node.fx ?? node.x ?? 0) + (node.w || 80) / 2;
    const ny = (node.fy ?? node.y ?? 0) + (node.h || 40) / 2;
    pan.x = svgW / 2 - nx * pan.scale;
    pan.y = svgH / 2 - ny * pan.scale;
    update();
}

function updateSearchHighlights() {
    const countEl = document.getElementById('searchCount');
    if (countEl) {
        countEl.textContent = searchMatches.length > 0
            ? `${searchIndex + 1}/${searchMatches.length}`
            : '';
    }
    // Apply CSS classes to SVG nodes
    document.querySelectorAll('.node.search-match, .node.search-current, .node.search-dimmed').forEach(el => {
        el.classList.remove('search-match', 'search-current', 'search-dimmed');
    });
    if (!searchMatches.length) return;
    const matchSet = new Set(searchMatches);
    document.querySelectorAll('.node[data-id]').forEach(el => {
        const id = el.dataset.id;
        if (id === searchMatches[searchIndex]) {
            el.classList.add('search-current');
        } else if (matchSet.has(id)) {
            el.classList.add('search-match');
        } else {
            el.classList.add('search-dimmed');
        }
    });
}

function clearSearchHighlights() {
    document.querySelectorAll('.node.search-match, .node.search-current, .node.search-dimmed').forEach(el => {
        el.classList.remove('search-match', 'search-current', 'search-dimmed');
    });
}

// ── Expand / Collapse all children ──────────────────────────
function setCollapseAll(nodeId, collapsed) {
    if (!map) return;
    const node = map.nodes[nodeId];
    if (!node) return;
    function walk(id) {
        const n = map.nodes[id];
        if (!n || !n.children || !n.children.length) return;
        n.collapsed = collapsed;
        n.children.forEach(walk);
    }
    walk(nodeId);
    markLayoutDirty();
    update();
    markMapChanged();
}

// ── Tag filter ──────────────────────────────────────────────
function applyTagFilter(tagId) {
    if (activeTagFilter === tagId) {
        activeTagFilter = null; // toggle off
    } else {
        activeTagFilter = tagId;
    }
    update();
    updateTagFilterHighlights();
}

function updateTagFilterHighlights() {
    if (!activeTagFilter) {
        document.querySelectorAll('.node.search-dimmed').forEach(el => el.classList.remove('search-dimmed'));
        return;
    }
    document.querySelectorAll('.node[data-id]').forEach(el => {
        const id = el.dataset.id;
        const node = map?.nodes[id];
        if (node && node.tags && node.tags.includes(activeTagFilter)) {
            el.classList.remove('search-dimmed');
        } else {
            el.classList.add('search-dimmed');
        }
    });
}

// ── Focus mode ──
function enterFocusMode(nodeId) {
    if (!map || !map.nodes[nodeId]) return;
    focusRootId = nodeId;
    applyFocusMode();
    fitToScreen();
    showToast('Mode focus activé (Escape pour quitter)');
}

function exitFocusMode() {
    focusRootId = null;
    // Remove dimming from all nodes
    document.querySelectorAll('.node.focus-dimmed').forEach(el => el.classList.remove('focus-dimmed'));
    document.querySelectorAll('.link.focus-dimmed').forEach(el => el.classList.remove('focus-dimmed'));
    update();
    showToast('Mode focus désactivé');
}

function applyFocusMode() {
    if (!focusRootId || !map) return;
    // Collect all descendant IDs
    const visible = new Set();
    function collect(id) {
        visible.add(id);
        const n = map.nodes[id];
        if (n?.children) n.children.forEach(collect);
    }
    collect(focusRootId);
    // Dim non-visible nodes
    document.querySelectorAll('.node[data-id]').forEach(el => {
        el.classList.toggle('focus-dimmed', !visible.has(el.dataset.id));
    });
    // Dim non-visible links
    document.querySelectorAll('.link').forEach(el => {
        const fromId = el.dataset?.from;
        const toId = el.dataset?.to;
        el.classList.toggle('focus-dimmed', !(fromId && visible.has(fromId) && toId && visible.has(toId)));
    });
}

// ── Minimap ──
function updateMinimap() {
    const canvas = document.getElementById('minimap');
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Filter to nodes with valid computed positions
    const nodes = Object.values(map.nodes).filter(n =>
        (n.x != null || n.fx != null) && n.w > 0 && n.h > 0
    );
    if (nodes.length === 0) return;

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        const nx = n.x ?? n.fx;
        const ny = n.y ?? n.fy;
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx + n.w > maxX) maxX = nx + n.w;
        if (ny + n.h > maxY) maxY = ny + n.h;
    });

    if (!isFinite(minX)) return;

    const padding = 20;
    const bw = maxX - minX + padding * 2;
    const bh = maxY - minY + padding * 2;
    const scale = Math.min(cw / bw, ch / bh);

    const ox = (cw - bw * scale) / 2 - (minX - padding) * scale;
    const oy = (ch - bh * scale) / 2 - (minY - padding) * scale;

    // Draw nodes as small rects
    nodes.forEach(n => {
        const nx = (n.x ?? n.fx) * scale + ox;
        const ny = (n.y ?? n.fy) * scale + oy;
        const nw = Math.max(2, n.w * scale);
        const nh = Math.max(2, n.h * scale);
        ctx.fillStyle = n.id === selectedId ? '#d4873f' : (n.color || '#ccc');
        ctx.globalAlpha = focusRootId && !isDescendantOf(n.id, focusRootId) ? 0.15 : 0.7;
        ctx.fillRect(nx, ny, nw, nh);
    });
    ctx.globalAlpha = 1;

    // Draw viewport rectangle
    if (svgElement) {
        const vw = svgElement.clientWidth;
        const vh = svgElement.clientHeight;
        const vx = (-pan.x / pan.scale) * scale + ox;
        const vy = (-pan.y / pan.scale) * scale + oy;
        const vw2 = (vw / pan.scale) * scale;
        const vh2 = (vh / pan.scale) * scale;
        ctx.strokeStyle = 'rgba(212,135,63,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, vw2, vh2);
    }

    // Store transform for click-to-navigate
    canvas._minimapTransform = { scale, ox, oy, minX, minY, padding };
}

function isDescendantOf(nodeId, ancestorId) {
    if (nodeId === ancestorId) return true;
    const node = map?.nodes[nodeId];
    if (!node?.parentId) return false;
    return isDescendantOf(node.parentId, ancestorId);
}

// Minimap click-to-navigate
document.getElementById('minimap')?.addEventListener('click', e => {
    const canvas = e.target;
    const t = canvas._minimapTransform;
    if (!t || !svgElement) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Convert minimap coords to map coords
    const mapX = (cx - t.ox) / t.scale;
    const mapY = (cy - t.oy) / t.scale;
    // Center viewport on this point
    pan.x = svgElement.clientWidth / 2 - mapX * pan.scale;
    pan.y = svgElement.clientHeight / 2 - mapY * pan.scale;
    update();
});

function scrollToNode(id) {
    if (!map || !svgElement) return;
    const node = map.nodes[id];
    if (!node) return;
    const cx = (node.x + (node.w || 0) / 2) * pan.scale + pan.x;
    const cy = (node.y + (node.h || 0) / 2) * pan.scale + pan.y;
    const vw = svgElement.clientWidth;
    const vh = svgElement.clientHeight;
    const margin = 80;
    if (cx < margin || cx > vw - margin || cy < margin || cy > vh - margin) {
        pan.x = vw / 2 - (node.x + (node.w || 0) / 2) * pan.scale;
        pan.y = vh / 2 - (node.y + (node.h || 0) / 2) * pan.scale;
    }
}

function zoomBy(factor) {
    if (!svgElement) return;
    const cx = svgElement.clientWidth / 2;
    const cy = svgElement.clientHeight / 2;
    const newScale = Math.min(5, Math.max(0.1, pan.scale * factor));
    pan.x = cx - (cx - pan.x) * (newScale / pan.scale);
    pan.y = cy - (cy - pan.y) * (newScale / pan.scale);
    pan.scale = newScale;
    update();
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
    const dotGrid = document.getElementById('dotGrid');
    if (dotGrid) dotGrid.setAttribute('patternTransform', `translate(${pan.x},${pan.y}) scale(${pan.scale})`);
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
    // Apply tag filter highlights after render
    if (activeTagFilter) updateTagFilterHighlights();
    // Apply multi-selection highlights
    if (multiSelected.size > 0) {
        document.querySelectorAll('.node[data-id]').forEach(el => {
            el.classList.toggle('multi-selected', multiSelected.has(el.dataset.id));
        });
    }
    updateHud();
    updateMinimap();
    if (focusRootId) applyFocusMode();
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
    if (!id || !map) return;
    if (editingInput) return;

    const node = map.nodes[id];
    if (!node) return;

    const svgRect = svgElement.getBoundingClientRect();

    // Shift+drag from ANY node → link creation mode
    if (event.shiftKey) {
        dragState = {
            id,
            mode: 'link',
            startX: event.clientX,
            startY: event.clientY,
            hasMoved: false
        };
        return;
    }

    // Free nodes (bubbles) and root node — drag by updating fx/fy
    if (node.placement === 'free' || id === map.rootId) {
        const clickSvgX = (event.clientX - svgRect.left - pan.x) / pan.scale;
        const clickSvgY = (event.clientY - svgRect.top - pan.y) / pan.scale;
        dragState = {
            id,
            mode: 'free',
            svgOffsetX: clickSvgX - (node.fx ?? node.x ?? 0),
            svgOffsetY: clickSvgY - (node.fy ?? node.y ?? 0),
            startX: event.clientX,
            startY: event.clientY,
            hasMoved: false,
            originEl: nodeEl
        };
        return;
    }
    const rect = nodeEl.getBoundingClientRect();
    dragState = {
        id,
        mode: 'reparent',
        originEl: nodeEl,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false,
        preview: null
    };
}

function startFrameInteraction(frameId, event) {
    if (!map) return;
    const frame = (map.frames || []).find(f => f.id === frameId);
    if (!frame) return;

    const svgRect = svgElement.getBoundingClientRect();
    const svgX = (event.clientX - svgRect.left - pan.x) / pan.scale;
    const svgY = (event.clientY - svgRect.top - pan.y) / pan.scale;

    // Detect resize handle click
    if (event.target.classList.contains('frame-resize-handle')) {
        dragState = {
            mode: 'frameresize',
            id: frameId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startW: frame.w,
            startH: frame.h,
            startX: event.clientX,
            startY: event.clientY,
            hasMoved: false,
        };
        return;
    }

    // Move mode — capture contained nodes (free bubbles + root) and their offsets
    const containedNodes = getNodesInFrame(map, frameId).map(node => ({
        id: node.id,
        dx: (node.fx ?? node.x ?? 0) - frame.x,
        dy: (node.fy ?? node.y ?? 0) - frame.y,
    }));
    dragState = {
        mode: 'framemove',
        id: frameId,
        svgOffsetX: svgX - frame.x,
        svgOffsetY: svgY - frame.y,
        startX: event.clientX,
        startY: event.clientY,
        containedNodes,
        hasMoved: false,
    };
}

function startFrameTitleEdit(frameId) {
    if (!map) return;
    const frame = (map.frames || []).find(f => f.id === frameId);
    if (!frame) return;
    const frameEl = viewport.querySelector(`#frame-overlays .frame[data-frame-id="${frameId}"]`);
    if (!frameEl) return;
    const titleEl = frameEl.querySelector('.frame-title');
    if (!titleEl) return;

    const bbox = titleEl.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = frame.title || 'Zone';
    input.style.left = bbox.left + 'px';
    input.style.top = bbox.top + 'px';
    input.style.width = Math.max(bbox.width + 40, 140) + 'px';
    input.style.fontSize = '13px';
    input.style.fontWeight = '600';
    document.body.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        const newTitle = input.value.trim() || 'Zone';
        updateFrame(map, frameId, { title: newTitle });
        input.remove();
        update();
        markMapChanged();
    }
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(); }
    });
    input.addEventListener('blur', finish);
}

let lastDropTargetCheck = 0;
const DROP_TARGET_THROTTLE = 50;

function updateNodeDrag(event) {
    if (!dragState || !map) return;
    const { mode } = dragState;

    if (!dragState.hasMoved) {
        const dx = Math.abs(event.clientX - dragState.startX);
        const dy = Math.abs(event.clientY - dragState.startY);
        if (dx > 3 || dy > 3) {
            dragState.hasMoved = true;
            if (mode === 'reparent') ensureDragPreview();
        }
    }
    if (!dragState.hasMoved) return;
    event.preventDefault();

    if (mode === 'framemove') {
        const svgRect = svgElement.getBoundingClientRect();
        const svgX = (event.clientX - svgRect.left - pan.x) / pan.scale;
        const svgY = (event.clientY - svgRect.top - pan.y) / pan.scale;
        const frame = (map.frames || []).find(f => f.id === dragState.id);
        if (frame) {
            frame.x = svgX - dragState.svgOffsetX;
            frame.y = svgY - dragState.svgOffsetY;
            // Move all contained nodes (free bubbles + root) with the frame
            dragState.containedNodes.forEach(({ id, dx, dy }) => {
                const node = map.nodes[id];
                if (node) { node.fx = frame.x + dx; node.fy = frame.y + dy; }
            });
        }
        markLayoutDirty();
        scheduleUpdate();
        return;
    }

    if (mode === 'frameresize') {
        const dx = (event.clientX - dragState.startClientX) / pan.scale;
        const dy = (event.clientY - dragState.startClientY) / pan.scale;
        const frame = (map.frames || []).find(f => f.id === dragState.id);
        if (frame) {
            frame.w = Math.max(100, dragState.startW + dx);
            frame.h = Math.max(60, dragState.startH + dy);
        }
        scheduleUpdate();
        return;
    }

    if (mode === 'free') {
        const svgRect = svgElement.getBoundingClientRect();
        const svgX = (event.clientX - svgRect.left - pan.x) / pan.scale;
        const svgY = (event.clientY - svgRect.top - pan.y) / pan.scale;
        const node = map.nodes[dragState.id];
        if (node) {
            node.fx = svgX - dragState.svgOffsetX;
            node.fy = svgY - dragState.svgOffsetY;
        }
        markLayoutDirty();
        scheduleUpdate();
        return;
    }

    if (mode === 'resize') {
        const dx = event.clientX - dragState.startClientX;
        const newWidth = Math.max(200, dragState.startCardWidth + dx / pan.scale);
        const node = map.nodes[dragState.id];
        if (node) {
            node.cardWidth = newWidth;
            node.w = newWidth;
        }
        markLayoutDirty();
        scheduleUpdate();
        return;
    }

    if (mode === 'link') {
        updateLinkPreview(event);
        dragState.lastClientX = event.clientX;
        dragState.lastClientY = event.clientY;
        return;
    }

    // Reparent mode (existing behavior)
    dragState.lastClientX = event.clientX;
    positionDragPreview(event.clientX, event.clientY);

    const now = performance.now();
    if (now - lastDropTargetCheck < DROP_TARGET_THROTTLE) return;
    lastDropTargetCheck = now;

    const el = document.elementFromPoint(event.clientX, event.clientY);
    const nodeEl = el ? el.closest('.node') : null;
    if (!nodeEl) {
        clearDropTarget();
        return;
    }
    const targetId = nodeEl.dataset.id;
    if (!targetId || targetId === dragState.id) {
        clearDropTarget();
        return;
    }
    // Can reparent to tree nodes and free bubbles (not cards)
    const targetNode = map.nodes[targetId];
    if (targetNode?.placement === 'free' && targetNode?.nodeType === 'card') {
        clearDropTarget();
        return;
    }
    if (isDescendant(map, dragState.id, targetId)) {
        clearDropTarget();
        return;
    }
    setDropTarget(nodeEl, targetId);
}

function endNodeDrag() {
    if (!dragState || !map) return;
    const { mode, id, hasMoved } = dragState;

    if (mode === 'framemove' || mode === 'frameresize') {
        dragState = null;
        if (hasMoved) {
            markMapChanged();
            update();
        }
        suppressClick = hasMoved;
        return;
    }

    if (mode === 'free') {
        const { originEl } = dragState;
        if (originEl?.classList) originEl.classList.remove('drag-origin');
        dragState = null;
        if (hasMoved) {
            markMapChanged();
            update();
        }
        suppressClick = hasMoved;
        return;
    }

    if (mode === 'resize') {
        dragState = null;
        if (hasMoved) {
            markMapChanged();
            update();
        }
        suppressClick = hasMoved;
        return;
    }

    if (mode === 'link') {
        removeLinkPreview();
        const lastX = dragState.lastClientX;
        const lastY = dragState.lastClientY;
        dragState = null;
        if (hasMoved && lastX != null && lastY != null) {
            const el = document.elementFromPoint(lastX, lastY);
            const targetNodeEl = el?.closest('.node');
            const targetId = targetNodeEl?.dataset?.id;
            if (targetId && targetId !== id) {
                const link = addLink(map, id, targetId);
                if (link) {
                    selectLink(link.id);
                    update();
                    markMapChanged();
                }
            }
        }
        suppressClick = hasMoved;
        return;
    }

    // Reparent mode (existing behavior)
    const { preview, originEl, lastClientX } = dragState;
    if (preview?.parentNode) preview.parentNode.removeChild(preview);
    if (originEl?.classList) originEl.classList.remove('drag-origin');
    document.body.classList.remove('dragging-node');
    const targetId = dropTargetId;
    clearDropTarget();
    dragState = null;
    if (targetId) pushUndo();
    if (targetId && reparentNode(map, id, targetId)) {
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

function selectLink(linkId) {
    selectedLinkId = linkId;
    setSelectedLinkId(linkId);
}

function selectFrame(id) {
    selectedFrameId = id;
    setSelectedFrameId(id);
    if (id !== null) {
        selectedId = null;
        selectLink(null);
    }
}

function updateLinkPreview(event) {
    if (!dragState) return;
    const sourceNode = map.nodes[dragState.id];
    if (!sourceNode || !isFinite(sourceNode.x)) return;

    const svgRect = svgElement.getBoundingClientRect();
    const svgX = (event.clientX - svgRect.left - pan.x) / pan.scale;
    const svgY = (event.clientY - svgRect.top - pan.y) / pan.scale;

    const x1 = sourceNode.x + sourceNode.w / 2;
    const y1 = sourceNode.y + sourceNode.h / 2;

    if (!linkPreviewEl) {
        linkPreviewEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        linkPreviewEl.setAttribute('stroke', '#94a3b8');
        linkPreviewEl.setAttribute('stroke-width', '2');
        linkPreviewEl.setAttribute('stroke-dasharray', '6 3');
        linkPreviewEl.setAttribute('fill', 'none');
        linkPreviewEl.setAttribute('pointer-events', 'none');
        viewport.appendChild(linkPreviewEl);
    }
    linkPreviewEl.setAttribute('d', `M${x1},${y1} L${svgX},${svgY}`);
}

function removeLinkPreview() {
    if (linkPreviewEl) {
        linkPreviewEl.remove();
        linkPreviewEl = null;
    }
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
    if (!map.nodes[id]) return;
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
    const inp = editingInput;
    const id = editingId;
    editingInput = null;
    editingId = null;
    editingOriginalText = null;
    inp.removeEventListener('blur', finishEditing);
    if (map.nodes[id]) map.nodes[id].text = inp.value;
    if (document.body.contains(inp)) document.body.removeChild(inp);
    markLayoutDirty();
    update();
    markMapChanged();
}

async function openHistory() {
    if (!map || !map.id) return;
    const modal = document.getElementById('historyModal');
    const list = document.getElementById('historyList');
    if (!modal || !list) return;
    list.innerHTML = '<div class="admin-list-empty">Chargement...</div>';
    modal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
    try {
        const resp = await fetch(`/api/maps/${map.id}/versions`);
        if (!resp.ok) { list.innerHTML = '<div class="admin-list-empty">Erreur</div>'; return; }
        const versions = await resp.json();
        if (!versions.length) {
            list.innerHTML = '<div class="admin-list-empty">Aucun historique</div>';
            return;
        }
        list.innerHTML = '';
        versions.forEach(v => {
            const row = document.createElement('div');
            row.className = 'admin-list-item';
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;';
            const date = new Date(v.createdAt);
            const dateStr = date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR');
            const label = document.createElement('span');
            label.textContent = dateStr;
            label.style.fontSize = '13px';
            const restoreBtn = document.createElement('button');
            restoreBtn.textContent = 'Restaurer';
            restoreBtn.className = 'secondary';
            restoreBtn.style.fontSize = '12px';
            restoreBtn.onclick = async () => {
                if (!confirm(`Restaurer la version du ${dateStr} ?`)) return;
                const r = await fetch(`/api/maps/${map.id}/versions/${v.id}`);
                if (!r.ok) { showToast('Erreur', 'error'); return; }
                const data = await r.json();
                pushUndo();
                const restored = data.map;
                restored.id = map.id; // keep same map ID
                restored.title = map.title;
                setCurrentMap(restored, { center: true, remember: false });
                markMapChanged();
                modal.classList.add('hidden');
                modalBackdrop.classList.add('hidden');
            };
            row.appendChild(label);
            row.appendChild(restoreBtn);
            list.appendChild(row);
        });
    } catch { list.innerHTML = '<div class="admin-list-empty">Erreur réseau</div>'; }
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
    populateTagDefs();
    configModal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
}

function closeConfig() {
    configModal.classList.add('hidden');
    const noteModal = document.getElementById('noteModal');
    const noteViewModal = document.getElementById('noteViewModal');
    if (mapListModal.classList.contains('hidden') && helpModal.classList.contains('hidden') &&
        (!noteModal || noteModal.classList.contains('hidden')) &&
        (!noteViewModal || noteViewModal.classList.contains('hidden'))) {
        modalBackdrop.classList.add('hidden');
    }
}

function closeHelp() {
    helpModal.classList.add('hidden');
    const noteModal = document.getElementById('noteModal');
    const noteViewModal = document.getElementById('noteViewModal');
    if (configModal.classList.contains('hidden') && mapListModal.classList.contains('hidden') &&
        (!noteModal || noteModal.classList.contains('hidden')) &&
        (!noteViewModal || noteViewModal.classList.contains('hidden'))) {
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

function populateTagDefs() {
    const container = document.getElementById('tagDefsContainer');
    if (!container || !map) return;
    const tags = (map.settings && map.settings.tags) || [];
    container.innerHTML = '';
    tags.forEach(tag => {
        const row = document.createElement('div');
        row.className = 'config-row';
        const info = document.createElement('div');
        info.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
        const dot = document.createElement('span');
        dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${tag.color};flex-shrink:0;`;
        const name = document.createElement('span');
        name.style.fontSize = '13px';
        name.textContent = tag.name;
        info.appendChild(dot);
        info.appendChild(name);
        const filterBtn = document.createElement('button');
        filterBtn.type = 'button';
        filterBtn.className = 'secondary';
        filterBtn.textContent = activeTagFilter === tag.id ? '⊘' : '⊙';
        filterBtn.title = activeTagFilter === tag.id ? 'Retirer le filtre' : 'Filtrer par ce tag';
        filterBtn.style.cssText = 'width:28px;height:28px;padding:0;font-size:14px;line-height:1;';
        filterBtn.onclick = () => {
            applyTagFilter(tag.id);
            populateTagDefs();
        };
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'secondary';
        del.textContent = '×';
        del.style.cssText = 'width:28px;height:28px;padding:0;font-size:16px;line-height:1;';
        del.onclick = () => {
            if (activeTagFilter === tag.id) activeTagFilter = null;
            removeTagDef(map, tag.id);
            populateTagDefs();
            update();
            markMapChanged();
        };
        row.appendChild(info);
        row.appendChild(filterBtn);
        row.appendChild(del);
        container.appendChild(row);
    });
}

function showCanvasContextMenu(x, y, mouseEvent) {
    document.querySelectorAll('.node-context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu node-context-menu';

    const addBubbleBtn = document.createElement('button');
    addBubbleBtn.textContent = '+ Nouvelle bulle';
    addBubbleBtn.onclick = () => {
        menu.remove();
        const svgRect = svgElement.getBoundingClientRect();
        const svgX = (mouseEvent.clientX - svgRect.left - pan.x) / pan.scale;
        const svgY = (mouseEvent.clientY - svgRect.top - pan.y) / pan.scale;
        const id = addFreeBubble(map, svgX - 50, svgY - 20);
        selectedId = id;
        selectLink(null);
        markLayoutDirty();
        update();
        markMapChanged();
        startEditing(id);
    };
    menu.appendChild(addBubbleBtn);

    const addFrameBtn = document.createElement('button');
    addFrameBtn.textContent = '⬜ Nouveau cadre';
    addFrameBtn.onclick = () => {
        menu.remove();
        const svgRect = svgElement.getBoundingClientRect();
        const svgX = (mouseEvent.clientX - svgRect.left - pan.x) / pan.scale;
        const svgY = (mouseEvent.clientY - svgRect.top - pan.y) / pan.scale;
        const frame = addFrame(map, svgX - 200, svgY - 150, 400, 300);
        selectFrame(frame.id);
        update();
        markMapChanged();
        requestAnimationFrame(() => startFrameTitleEdit(frame.id));
    };
    menu.appendChild(addFrameBtn);

    const fitBtn2 = document.createElement('button');
    fitBtn2.textContent = '⊡ Centrer la vue';
    fitBtn2.onclick = () => { menu.remove(); fitToScreen(); };
    menu.appendChild(fitBtn2);

    menu.style.position = 'fixed';
    menu.style.top = Math.min(y, window.innerHeight - 100) + 'px';
    menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', function close() {
            menu.remove();
            document.removeEventListener('click', close);
        }, { once: true });
    }, 0);
}

function showFrameContextMenu(x, y, frameId) {
    document.querySelectorAll('.node-context-menu').forEach(m => m.remove());
    const frame = (map.frames || []).find(f => f.id === frameId);
    if (!frame) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu node-context-menu';

    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✏ Renommer';
    renameBtn.onclick = () => { menu.remove(); startFrameTitleEdit(frameId); };
    menu.appendChild(renameBtn);

    const sep = document.createElement('div');
    sep.className = 'context-menu-sep';
    menu.appendChild(sep);

    const header = document.createElement('div');
    header.className = 'move-menu-header';
    header.textContent = 'Couleur de fond';
    menu.appendChild(header);

    const palette = document.createElement('div');
    palette.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;';
    FRAME_COLORS.forEach(({ label, fill }) => {
        const swatch = document.createElement('button');
        swatch.title = label;
        const isActive = fill === frame.color;
        swatch.style.cssText = `width:24px;height:24px;border-radius:5px;background:${fill};border:2.5px solid ${isActive ? '#3b82f6' : 'transparent'};cursor:pointer;padding:0;min-width:unset;flex-shrink:0;`;
        swatch.onclick = () => {
            menu.remove();
            updateFrame(map, frameId, { color: fill });
            update();
            markMapChanged();
        };
        palette.appendChild(swatch);
    });
    menu.appendChild(palette);

    const sep2 = document.createElement('div');
    sep2.className = 'context-menu-sep';
    menu.appendChild(sep2);

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑 Supprimer le cadre';
    delBtn.style.color = 'var(--danger, #ef4444)';
    delBtn.onclick = () => {
        menu.remove();
        deleteFrame(map, frameId);
        if (selectedFrameId === frameId) selectFrame(null);
        update();
        markMapChanged();
    };
    menu.appendChild(delBtn);

    menu.style.position = 'fixed';
    menu.style.top = Math.min(y, window.innerHeight - 320) + 'px';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', function close() {
            menu.remove();
            document.removeEventListener('click', close);
        }, { once: true });
    }, 0);
}

function showTemplatePicker() {
    document.querySelectorAll('.template-picker').forEach(m => m.remove());
    const picker = document.createElement('div');
    picker.className = 'context-menu template-picker';
    const header = document.createElement('div');
    header.className = 'move-menu-header';
    header.textContent = 'Nouvelle carte';
    picker.appendChild(header);
    getTemplates().forEach((tmpl, i) => {
        const btn = document.createElement('button');
        btn.textContent = `${tmpl.icon} ${tmpl.name}`;
        btn.onclick = () => {
            picker.remove();
            const built = buildFromTemplate(i);
            const fresh = built || createEmptyMap();
            ensureSettings(fresh);
            markLayoutDirty();
            setCurrentMap(fresh, { center: true, remember: false });
            markMapChanged();
            startEditing(selectedId);
        };
        picker.appendChild(btn);
    });
    // Position under the "Nouveau" button
    const btnRect = newBtn.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top = (btnRect.bottom + 4) + 'px';
    picker.style.left = btnRect.left + 'px';
    document.body.appendChild(picker);
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 0);
}

function showNodeContextMenu(x, y, nodeId) {
    document.querySelectorAll('.node-context-menu').forEach(m => m.remove());
    const node = map.nodes[nodeId];
    if (!node) return;
    const tags = (map.settings && map.settings.tags) || [];
    const nodeTags = node.tags || [];

    const menu = document.createElement('div');
    menu.className = 'context-menu node-context-menu';

    // Note section
    if (node.body) {
        const viewNoteBtn = document.createElement('button');
        viewNoteBtn.innerHTML = '✎ Voir la note';
        viewNoteBtn.onclick = () => { menu.remove(); openNoteViewModal(nodeId); };
        menu.appendChild(viewNoteBtn);

        const editNoteBtn = document.createElement('button');
        editNoteBtn.innerHTML = '✏ Modifier la note';
        editNoteBtn.onclick = () => { menu.remove(); openNoteModal(nodeId); };
        menu.appendChild(editNoteBtn);
    } else {
        const noteBtn = document.createElement('button');
        noteBtn.innerHTML = '✎ Ajouter une note';
        noteBtn.onclick = () => { menu.remove(); openNoteModal(nodeId); };
        menu.appendChild(noteBtn);
    }

    // Image section
    const imgBtn = document.createElement('button');
    imgBtn.innerHTML = '🖼 Ajouter une image';
    imgBtn.onclick = () => {
        menu.remove();
        selectedId = nodeId;
        imageInput.click();
    };
    menu.appendChild(imgBtn);

    // Emoji button
    const emojiBtn = document.createElement('button');
    emojiBtn.innerHTML = '😀 Insérer un emoji';
    emojiBtn.onclick = () => {
        menu.remove();
        openEmojiPicker(x, y, emoji => {
            pushUndo();
            map.nodes[nodeId].text = emoji + ' ' + (map.nodes[nodeId].text || '');
            update();
            markMapChanged();
        });
    };
    menu.appendChild(emojiBtn);

    // Color swatches
    const colorSep = document.createElement('div');
    colorSep.className = 'context-menu-sep';
    menu.appendChild(colorSep);
    const colorHeader = document.createElement('div');
    colorHeader.className = 'move-menu-header';
    colorHeader.textContent = 'Couleur';
    menu.appendChild(colorHeader);
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;gap:4px;padding:4px 8px;flex-wrap:wrap;';
    const nodeColors = ['#fef3c7','#fed7aa','#fecaca','#ddd6fe','#bfdbfe','#bbf7d0','#e5e7eb','#fde68a','#c4b5fd','#a5f3fc'];
    nodeColors.forEach(color => {
        const swatch = document.createElement('span');
        swatch.style.cssText = `display:inline-block;width:20px;height:20px;border-radius:4px;cursor:pointer;border:2px solid ${node.color === color ? 'var(--accent)' : 'transparent'};background:${color};`;
        swatch.addEventListener('click', () => {
            menu.remove();
            pushUndo();
            map.nodes[nodeId].color = color;
            update();
            markMapChanged();
        });
        colorRow.appendChild(swatch);
    });
    menu.appendChild(colorRow);

    // Expand/collapse children (only if node has children)
    if (node.children && node.children.length > 0) {
        const sepCollapse = document.createElement('div');
        sepCollapse.className = 'context-menu-sep';
        menu.appendChild(sepCollapse);

        const expandBtn = document.createElement('button');
        expandBtn.textContent = '▸ Déplier tous les enfants';
        expandBtn.onclick = () => { menu.remove(); pushUndo(); setCollapseAll(nodeId, false); };
        menu.appendChild(expandBtn);

        const collapseBtn = document.createElement('button');
        collapseBtn.textContent = '▾ Replier tous les enfants';
        collapseBtn.onclick = () => { menu.remove(); pushUndo(); setCollapseAll(nodeId, true); };
        menu.appendChild(collapseBtn);
    }

    // Tags section (only if tags exist)
    if (tags.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-sep';
        menu.appendChild(sep);

        const header = document.createElement('div');
        header.className = 'move-menu-header';
        header.textContent = 'Étiquettes';
        menu.appendChild(header);

        tags.forEach(tag => {
            const btn = document.createElement('button');
            const isActive = nodeTags.includes(tag.id);
            const dot = document.createElement('span');
            dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle;';
            dot.style.background = tag.color;
            btn.appendChild(dot);
            btn.appendChild(document.createTextNode(tag.name + (isActive ? ' ✓' : '')));
            btn.onclick = () => {
                menu.remove();
                toggleNodeTag(map, nodeId, tag.id);
                update();
                markMapChanged();
            };
            menu.appendChild(btn);
        });
    }

    menu.style.position = 'fixed';
    menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', function close() {
            menu.remove();
            document.removeEventListener('click', close);
        }, { once: true });
    }, 0);
}

let _noteEditor = null;

function openNoteModal(nodeId) {
    if (!map) return;
    const node = map.nodes[nodeId];
    if (!node) return;
    const modal = document.getElementById('noteModal');
    const titleEl = document.getElementById('noteModalTitle');
    const container = document.getElementById('noteEditorContainer');
    if (!modal || !titleEl || !container) return;

    titleEl.textContent = node.text || 'Sans titre';
    modal.dataset.nodeId = nodeId;
    modal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');

    // Destroy previous instance if any
    if (_noteEditor) {
        _noteEditor.destroy();
        _noteEditor = null;
    }
    container.innerHTML = '';

    // Defer editor init until after the browser has painted the modal (container has real dimensions)
    const initialValue = node.body || '';
    requestAnimationFrame(() => {
        if (modal.classList.contains('hidden')) return; // modal closed before paint
        if (window.toastui && window.toastui.Editor) {
            _noteEditor = new window.toastui.Editor({
                el: container,
                height: '380px',
                initialEditType: 'wysiwyg',
                previewStyle: 'tab',
                initialValue,
                toolbarItems: [
                    ['heading', 'bold', 'italic', 'strike'],
                    ['hr', 'quote'],
                    ['ul', 'ol', 'task'],
                    ['table', 'link'],
                    ['code', 'codeblock'],
                ],
            });
        } else {
            // Fallback: plain textarea
            const ta = document.createElement('textarea');
            ta.id = 'noteModalBody';
            ta.value = initialValue;
            ta.placeholder = 'Écrivez votre note en Markdown…';
            ta.style.cssText = 'width:100%;min-height:380px;resize:vertical;font-family:monospace;font-size:13px;line-height:1.6;border:1px solid var(--border);border-radius:var(--radius);padding:12px;box-sizing:border-box;';
            container.appendChild(ta);
        }
    });
}

function closeNoteModal() {
    const modal = document.getElementById('noteModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const nodeId = modal.dataset.nodeId;
    if (nodeId && map && map.nodes[nodeId]) {
        let newBody = '';
        if (_noteEditor) {
            newBody = _noteEditor.getMarkdown();
        } else {
            const ta = document.getElementById('noteModalBody');
            newBody = ta ? ta.value : '';
        }
        if (newBody !== (map.nodes[nodeId].body || '')) {
            map.nodes[nodeId].body = newBody;
            update();
            markMapChanged();
        }
    }
    if (_noteEditor) {
        _noteEditor.destroy();
        _noteEditor = null;
    }
    modal.classList.add('hidden');
    const noteViewModal = document.getElementById('noteViewModal');
    if (document.getElementById('mapListModal').classList.contains('hidden') &&
        document.getElementById('configModal').classList.contains('hidden') &&
        document.getElementById('helpModal').classList.contains('hidden') &&
        (!noteViewModal || noteViewModal.classList.contains('hidden'))) {
        modalBackdrop.classList.add('hidden');
    }
}

function openLightbox(dataUrl) {
    let lb = document.getElementById('lightboxModal');
    if (!lb) return;
    lb.querySelector('img').src = dataUrl;
    lb.classList.remove('hidden');
    // No backdrop needed, lightbox has its own overlay
}

function closeLightbox() {
    const lb = document.getElementById('lightboxModal');
    if (lb) lb.classList.add('hidden');
}

function openNoteViewModal(nodeId) {
    if (!map) return;
    const node = map.nodes[nodeId];
    if (!node || !node.body) return;
    const modal = document.getElementById('noteViewModal');
    const titleEl = document.getElementById('noteViewTitle');
    const viewerEl = document.getElementById('noteViewerContainer');
    const editBtn = document.getElementById('noteViewEditBtn');
    if (!modal || !titleEl || !viewerEl) return;
    titleEl.textContent = node.text || 'Sans titre';
    modal.dataset.nodeId = nodeId;
    viewerEl.innerHTML = typeof marked !== 'undefined'
        ? marked.parse(node.body, { breaks: true, gfm: true, sanitize: false })
        : '';
    if (typeof marked === 'undefined') {
        const pre = document.createElement('pre');
        pre.textContent = node.body;
        viewerEl.appendChild(pre);
    }
    if (editBtn) editBtn.onclick = () => { closeNoteViewModal(); openNoteModal(nodeId); };
    modal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
}

function closeNoteViewModal() {
    const modal = document.getElementById('noteViewModal');
    if (!modal) return;
    modal.classList.add('hidden');
    if (document.getElementById('mapListModal').classList.contains('hidden') &&
        document.getElementById('configModal').classList.contains('hidden') &&
        document.getElementById('helpModal').classList.contains('hidden') &&
        document.getElementById('noteModal').classList.contains('hidden')) {
        modalBackdrop.classList.add('hidden');
    }
}

function toggleOutline(force) {
    outlineMode = force !== undefined ? force : !outlineMode;
    if (outlineMode) {
        svgElement.style.display = 'none';
        if (outlineView) outlineView.classList.remove('hidden');
        if (outlineBtn) outlineBtn.classList.add('active');
        if (map) {
            initOutline(map, outlineContent, {
                onSelectNode: (id) => {
                    selectedId = id;
                    outlineMode = false;
                    toggleOutline(false);
                    update();
                },
                onAddChild: (parentId, text) => {
                    const id = addChild(map, parentId);
                    if (id) {
                        map.nodes[id].text = text;
                        markLayoutDirty();
                        update();
                        markMapChanged();
                        renderOutline(map);
                    }
                },
                onExportMd: () => {
                    if (map) exportMarkdown(map);
                }
            });
        }
    } else {
        svgElement.style.display = '';
        if (outlineView) outlineView.classList.add('hidden');
        if (outlineBtn) outlineBtn.classList.remove('active');
        update();
    }
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
    if (configModal.classList.contains('hidden') && helpModal.classList.contains('hidden')
        && document.getElementById('noteModal')?.classList.contains('hidden') !== false
        && document.getElementById('noteViewModal')?.classList.contains('hidden') !== false
        && document.getElementById('historyModal')?.classList.contains('hidden') !== false) {
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
            showToast(err.message || 'Impossible de charger la carte.', 'error');
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
    const savingMap = map;
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
        if (data?.id && map === savingMap) {
            map.id = data.id;
            localStorage.setItem(LAST_MAP_STORAGE_KEY, data.id);
        }
        if (data?.title && map === savingMap) {
            map.title = data.title;
        }
        if (data?.updatedAt && map === savingMap) {
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
    saveStatusEl.classList.remove('save-confirmed');
    void saveStatusEl.offsetWidth; // force reflow
    saveStatusEl.classList.add('save-confirmed');
}

function isNetworkError(err) {
    return err && err.name === 'TypeError';
}
