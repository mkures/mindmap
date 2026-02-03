# MindMap Minimal

A minimal single-page mind map editor built from scratch with vanilla JavaScript and SVG.

## Features

- **Keyboard-driven editing**: Tab to add child, Enter to add sibling, F2 or double-click to edit any node (including root)
- **Drag & drop**: Reparent nodes by dragging them onto another node
- **Images**: Attach pictures to nodes (auto-resized, embedded as base64)
- **Pan & zoom**: Drag background to pan, scroll wheel to zoom, Ctrl+F to fit
- **Auto-layout**: Hierarchical layout with automatic branch coloring
- **Autosave**: Changes automatically saved to backend with configurable interval
- **Configuration**: Customize colors per depth level, font family/size, autosave delay

## Quick Start

### Local Development

```bash
cd server
pip install -r requirements.txt
python app.py
# Open http://localhost:5000 (default: admin/changeme)
```

### Deploy to Railway

1. Push to Git
2. Connect Railway to your repo
3. Add a **Volume** (Settings → Volumes): mount path `/data`
4. Set environment variables:
   - `BASIC_AUTH_USERNAME` - your username
   - `BASIC_AUTH_PASSWORD` - your password
   - `DB_PATH` = `/data/mindmap.db`
5. Deploy (auto-detected from Procfile)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Add child node |
| Enter | Add sibling node |
| Delete / Backspace | Delete selected node |
| F2 / Double-click | Edit node text |
| Shift + Arrow | Reorder siblings |
| Ctrl + F | Fit to screen |
| Start typing | Edit selected node |

## Architecture

```
Procfile              Railway deployment config
requirements.txt      Python dependencies
server/
  app.py              Flask backend with HTTP Basic Auth + SQLite

index.html            Main application
styles.css            Styling
src/
  main.js             App orchestration, events, autosave
  model.js            Data model and CRUD operations
  layout.js           Hierarchical layout algorithm
  render.js           SVG rendering with incremental diffing
```

## Performance

The editor is optimized for smooth 60fps interactions:

- **SVG diffing**: Only changed elements are updated (no full DOM rebuild)
- **requestAnimationFrame**: Pan/zoom batched to display refresh rate
- **Conditional layout**: Tree positions only recalculated when structure changes
- **Throttled drag detection**: Drop target lookup limited to 20/sec
- **GPU-accelerated drag preview**: CSS transforms instead of position updates

## API Contract

The Flask backend implements:

- `GET /api/maps?id=0` → List all maps
- `GET /api/maps?id=<id>` → Load a specific map
- `POST /api/maps` → Save/create map (`{id?, title, map}`)
- `DELETE /api/maps/<id>` → Delete a map

All endpoints require HTTP Basic Auth.

## Data Format

Maps are stored as JSON:

```json
{
  "id": "map-uuid",
  "title": "My Map",
  "rootId": "n1",
  "nodes": {
    "n1": {
      "id": "n1",
      "parentId": null,
      "text": "Central Idea",
      "children": ["n2", "n3"],
      "color": "#ff6f59"
    }
  },
  "settings": {
    "levelColors": ["#ffffff", "#ff6f59", ...],
    "fontFamily": "sans-serif",
    "fontSize": 14,
    "autosaveDelay": 1200
  }
}
```

## License

MIT
