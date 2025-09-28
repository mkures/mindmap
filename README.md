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

## Authentication & Cloudflare Access

The UI now requires authentication before the editor is displayed. When served
behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/)
configure an application that enforces Google Workspace (or personal Gmail)
logins. Cloudflare will inject an `CF-Access-Jwt-Assertion` header for
authenticated requests. The backend described below should validate that token
and return a signed session payload via `GET /api/auth/session`.

For local development (or while your backend is not yet wired to Cloudflare)
use the fallback password form exposed in the overlay. Implement
`POST /api/auth/login` to accept a password, create a session cookie and return
the same JSON payload as the session endpoint.

## Realtime persistence API

All changes are automatically persisted to MongoDB through a REST API. The
front-end expects the following contract; adapt the implementation language to
your stack of choice:

### `GET /api/auth/session`

* Validates the current Cloudflare Access token (or any other auth cookie) and
  returns HTTP 200 with:

  ```json
  {
    "token": "<bearer token forwarded by the client>",
    "user": { "email": "you@example.com", "name": "Your Name" },
    "loginUrl": "https://<your-domain>/.well-known/cfaccess/..."
  }
  ```

* When the user is not authenticated, respond with **401** and optionally the
  `loginUrl` for the Cloudflare Access flow:

  ```json
  { "loginUrl": "https://<domain>/cdn-cgi/access/login" }
  ```

The `token` value is forwarded as a Bearer token on every subsequent request to
`/api/maps`.

### `POST /api/auth/login`

This endpoint is only used for the fallback password flow. Validate the posted
password, create a session (cookie or JWT) and return the same JSON shape as
`GET /api/auth/session`.

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
