# MindMap Minimal

This project is a minimal single-page mind map editor implemented from scratch.
Open `index.html` in a modern browser to run it. Click nodes to select them.
Press **Tab** to add a child or **Enter** to add a sibling. Double-click or hit
**F2** to edit the selected node, or simply start typing when a node is
selected. Use the **Image** button to attach a picture to the selected node.
Click **Save JSON** to download the map with images embedded and **Load JSON**
to restore a saved file. Drag the background to pan and use the mouse wheel to
zoom. Branches from the root are automatically colored and children are laid
out above and below their parent for readability.

## Cloudflare Access & API configuration

Place the application behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/)
or any other authentication proxy. The editor no longer displays a custom login
overlay—the page is immediately visible and relies on Cloudflare to block
anonymous visitors before it loads.

If your persistence API expects an additional bearer token, expose it to the
front-end through one of the supported injection points:

* `window.MINDMAP_API_TOKEN` – define a global variable in an inline script.
* `window.__ENV.MINDMAP_API_TOKEN` – helpful when Cloudflare Pages injects a
  JSON blob of environment variables.
* `<meta name="mindmap-api-token" content="...">` – add the token to the head.
* `<body data-mindmap-api-token="...">` – attach it as a data attribute.
* `<script id="mindmapConfig" type="application/json">{"apiToken":"..."}</script>` –
  embed JSON configuration.

Any of these methods keep the secret available only to authenticated users, and
the client will include the token as a `Bearer` header when calling the API.

## Realtime persistence API

All changes are automatically persisted to MongoDB through a REST API. The
front-end expects the following contract; adapt the implementation language to
your stack of choice:

### `GET /api/maps?id=0`

Returns the list of stored maps. Respond with either an array or an object with
the `maps` property. Each entry should include at least:

```json
[
  {
    "id": "unique-id",
    "title": "Ma carte",
    "description": "Optionnel",
    "updatedAt": 1681406400000
  }
]
```

### `GET /api/maps?id=<mapId>`

Returns the full JSON of a map and its metadata. The client understands either
`{ "map": { ... } }`, `{ "data": { ... } }` or the map object directly. The
`map` payload is the same structure that the front-end uses internally (root id
plus the `nodes` dictionary, `settings`, etc.).

### `POST /api/maps`

Persists the provided map. The client sends the body:

```json
{
  "id": "optional-id",
  "title": "Titre saisi dans l'UI",
  "map": { "...": "structure complète" }
}
```

Store the JSON verbatim in MongoDB. Return HTTP 200 with `{ "id": "assigned-id",
"updatedAt": <timestamp>, "title": "Titre" }`. The `id` is stored locally so
subsequent updates overwrite the same document.

## MongoDB schema suggestion

A minimal collection document looks like:

```json
{
  "_id": ObjectId,
  "mapId": "assigned-id",
  "title": "MindMap",
  "owner": "you@example.com",
  "updatedAt": ISODate,
  "payload": { /* map JSON returned to the client */ }
}
```

Index `mapId` and `owner` (or whichever partition key you prefer) to fetch and
update quickly. Since every change is saved, don't worry about payload size;
MongoDB handles large JSON documents comfortably for personal projects.
