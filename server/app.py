import os
import sys
import json
import sqlite3
import uuid
import time
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, Response

# Force unbuffered output for Railway logs
print("=== Starting MindMap Server ===", flush=True)

# Get the project root (parent of server/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = Flask(__name__, static_folder=PROJECT_ROOT, static_url_path='')

# Configuration
DB_PATH = os.environ.get('DB_PATH', 'mindmap.db')
BASIC_AUTH_USERNAME = os.environ.get('BASIC_AUTH_USERNAME', 'admin')
BASIC_AUTH_PASSWORD = os.environ.get('BASIC_AUTH_PASSWORD', 'changeme')

print(f"[CONFIG] DB_PATH={DB_PATH}", flush=True)
print(f"[CONFIG] PROJECT_ROOT={PROJECT_ROOT}", flush=True)


@app.before_request
def log_request():
    """Log all incoming requests."""
    print(f"[REQUEST] {request.method} {request.path}", flush=True)


def get_db():
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database schema."""
    print(f"[DB] Initializing database at {DB_PATH}", flush=True)
    try:
        conn = get_db()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY,
                title TEXT,
                data TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )
        ''')
        conn.commit()
        conn.close()
        print(f"[DB] Database initialized successfully", flush=True)
    except Exception as e:
        print(f"[DB] ERROR initializing database: {e}", flush=True)


def check_auth(username, password):
    """Verify credentials."""
    return username == BASIC_AUTH_USERNAME and password == BASIC_AUTH_PASSWORD


def authenticate():
    """Send 401 response to trigger browser login dialog."""
    return Response(
        'Authentication required',
        401,
        {'WWW-Authenticate': 'Basic realm="MindMap"'}
    )


def requires_auth(f):
    """Decorator for HTTP Basic Auth."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated


# =============================================================================
# API ROUTES (must be defined BEFORE catch-all static route)
# =============================================================================

@app.route('/api/maps', methods=['GET'])
@requires_auth
def get_maps():
    """Get map list or single map."""
    map_id = request.args.get('id')
    print(f"[API] GET /api/maps?id={map_id}", flush=True)
    conn = get_db()

    if map_id == '0' or map_id is None:
        # Return list of all maps
        cursor = conn.execute(
            'SELECT id, title, updated_at FROM maps ORDER BY updated_at DESC'
        )
        maps = []
        for row in cursor:
            maps.append({
                'id': row['id'],
                'title': row['title'],
                'updatedAt': row['updated_at']
            })
        conn.close()
        return jsonify(maps)
    else:
        # Return single map
        cursor = conn.execute(
            'SELECT id, title, data, created_at, updated_at FROM maps WHERE id = ?',
            (map_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row is None:
            return jsonify({'error': 'Map not found'}), 404

        map_data = json.loads(row['data'])
        return jsonify({'map': map_data})


@app.route('/api/maps', methods=['POST'])
@requires_auth
def save_map():
    """Save or update a map."""
    print(f"[API] POST /api/maps", flush=True)
    data = request.get_json()
    if not data:
        print(f"[API] ERROR: Invalid JSON", flush=True)
        return jsonify({'error': 'Invalid JSON'}), 400
    print(f"[API] Saving map: id={data.get('id')}, title={data.get('title')}", flush=True)

    map_id = data.get('id')
    title = data.get('title', 'Sans titre')
    map_content = data.get('map', {})
    now = int(time.time() * 1000)

    conn = get_db()

    if map_id:
        # Check if map exists
        cursor = conn.execute('SELECT id FROM maps WHERE id = ?', (map_id,))
        exists = cursor.fetchone() is not None

        if exists:
            # Update existing map
            conn.execute(
                'UPDATE maps SET title = ?, data = ?, updated_at = ? WHERE id = ?',
                (title, json.dumps(map_content), now, map_id)
            )
        else:
            # Create with provided ID
            conn.execute(
                'INSERT INTO maps (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                (map_id, title, json.dumps(map_content), now, now)
            )
    else:
        # Create new map with generated ID
        map_id = f'map-{uuid.uuid4().hex[:12]}'
        conn.execute(
            'INSERT INTO maps (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            (map_id, title, json.dumps(map_content), now, now)
        )

    conn.commit()
    conn.close()
    print(f"[API] Map saved successfully: id={map_id}", flush=True)

    return jsonify({
        'id': map_id,
        'title': title,
        'updatedAt': now
    })


@app.route('/api/maps/<map_id>', methods=['DELETE'])
@requires_auth
def delete_map(map_id):
    """Delete a map."""
    conn = get_db()
    conn.execute('DELETE FROM maps WHERE id = ?', (map_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# =============================================================================
# STATIC FILE ROUTES (catch-all, must be AFTER API routes)
# =============================================================================

@app.route('/')
@requires_auth
def index():
    """Serve the main application."""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
@requires_auth
def static_files(path):
    """Serve static files (JS, CSS, etc.)."""
    # Don't serve files from api/ path
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(app.static_folder, path)


# Initialize database on startup
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
