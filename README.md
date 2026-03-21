# MindMap Minimal

A minimal single-page mind map editor built from scratch with vanilla JavaScript and SVG.

## Features

- **Keyboard-driven editing**: Tab/Enter/Delete for tree operations, arrow keys for navigation, F2 to edit
- **Drag & drop**: Reparent nodes by dragging them onto another node
- **Free bubbles & cards**: Create floating nodes and rich-text cards on the canvas
- **Frames**: Group nodes visually with resizable colored frames
- **Cross-branch links**: Shift+drag between nodes to draw relationship arrows
- **Rich notes**: Attach rich-text notes to any node (N key), visible in outline view
- **Emoji picker**: Insert emojis into nodes via picker (E key) or context menu
- **Images**: Attach pictures to nodes (auto-resized, embedded as base64)
- **Tags**: Define and assign color-coded tags to nodes for categorization
- **Pan & zoom**: Drag background to pan, scroll wheel or Ctrl+=/- to zoom
- **Minimap**: Always-visible overview with click-to-navigate
- **Command palette**: Ctrl+K to fuzzy-search all available actions
- **Focus mode**: Isolate a subtree for distraction-free editing (Ctrl+Shift+F)
- **Search**: Find nodes by text (Ctrl+F)
- **Outline view**: Tree-structured plan view with note previews and MD export
- **Templates**: Start from pre-built structures (Brainstorming, SWOT, Project, etc.)
- **Auto-layout**: Bidirectional hierarchical layout with automatic branch coloring
- **Undo/Redo**: Full history with Ctrl+Z / Ctrl+Y
- **Autosave**: Changes automatically saved to backend with configurable interval
- **Multi-user auth**: Session-based authentication with admin panel
- **Share tokens**: Generate read-only links to share maps
- **Export**: Markdown, PNG, PDF, JSON
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
| F2 / Start typing | Edit node text |
| Arrow keys | Navigate between nodes |
| Ctrl + Arrow | Reorder siblings |
| Space | Collapse/expand branch |
| N | Open/create note |
| E | Emoji picker |
| F | Add frame |
| Home | Jump to root |
| Ctrl + K | Command palette |
| Ctrl + F | Search nodes |
| Ctrl + Shift + F | Focus mode |
| Ctrl + Z / Ctrl + Y | Undo / Redo |
| Ctrl + C / Ctrl + V | Copy / Paste subtree |
| Ctrl + D | Duplicate node |
| Ctrl + = / Ctrl + - | Zoom in / out |
| Ctrl + 0 | Reset zoom to 100% |
| Shift + drag | Draw cross-branch link |
| Shift + click | Multi-select |

## Architecture

```
Procfile              Railway deployment config
requirements.txt      Python dependencies
server/
  app.py              Flask backend with session auth + SQLite + admin panel

index.html            Main application
styles.css            All styling (Warm Atelier theme)
src/
  main.js             App orchestration, events, autosave, keyboard shortcuts
  model.js            Data model and CRUD operations
  layout.js           Bidirectional hierarchical layout algorithm
  render.js           SVG rendering with incremental diffing
  outline.js          Outline/plan view with note previews
  export.js           Export (Markdown, PNG, PDF)
  templates.js        Map templates (Brainstorming, SWOT, etc.)
  command-palette.js  Ctrl+K fuzzy command search
  emoji-picker.js     Emoji picker with categories and search
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
