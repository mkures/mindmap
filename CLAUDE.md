# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A minimal single-page mind map editor built with vanilla JavaScript and SVG, served by a Flask backend for persistence and authentication.

## Development

**Running locally with Flask:**
```bash
cd server
pip install -r requirements.txt
python app.py
# Open http://localhost:5000 (credentials: admin/changeme by default)
```

**Environment variables:**
- `BASIC_AUTH_USERNAME` - HTTP Basic Auth username (default: admin)
- `BASIC_AUTH_PASSWORD` - HTTP Basic Auth password (default: changeme)
- `PORT` - Server port (default: 5000)

## Architecture

```
server/
  app.py              Flask backend - serves static files + REST API
  requirements.txt    Python dependencies (flask, gunicorn)
  Procfile           Railway/Heroku deployment config
  mindmap.db         SQLite database (created at runtime)

index.html          Entry point with UI structure
styles.css          All styling
src/
  main.js           Orchestrator - UI events, pan/zoom/drag, autosave
                    Uses requestAnimationFrame + layoutDirty for performance
  model.js          Data model and CRUD operations
  layout.js         Hierarchical layout algorithm (only runs when structure changes)
  render.js         SVG rendering with incremental diffing (no full rebuild)
```

**Data flow:** User action → model update → `markLayoutDirty()` → `layout()` (if dirty) → `render()` (diff-based) → `markMapChanged()` → autosave

**Performance optimizations:**
- SVG diffing: only creates/updates/removes changed elements
- `requestAnimationFrame` batching for pan/zoom
- Layout only recalculated when tree structure changes
- Drop target detection throttled (50ms)
- CSS transforms for drag preview (GPU-accelerated)

## API Endpoints

- `GET /api/maps?id=0` - List all maps
- `GET /api/maps?id=<id>` - Load single map
- `POST /api/maps` - Save/create map (body: `{id?, title, map}`)
- `DELETE /api/maps/<id>` - Delete map

All endpoints require HTTP Basic Auth.

## Data Model

```javascript
MindMap {
  id, title, rootId, nodes: Record<string, MindNode>,
  settings: { levelColors[], fontFamily, fontSize, autosaveDelay }
}

MindNode {
  id, parentId, text, children[], color,
  x, y, w, h,  // computed by layout
  media?: { kind: 'image', dataUrl, width, height }
}
```

## Deployment (Railway)

1. Push to Git
2. Connect Railway to repo
3. Set environment variables: `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`
4. Railway auto-detects Python + Procfile

## Key Keyboard Shortcuts

- **Tab**: Add child node
- **Enter**: Add sibling node
- **Delete/Backspace**: Delete selected node
- **F2** or start typing: Edit node text
- **Shift+Arrow**: Reorder siblings
- **Ctrl+F**: Fit to screen
- Drag nodes to reparent; drag background to pan; scroll to zoom
