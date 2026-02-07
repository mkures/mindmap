import os
import sys
import json
import sqlite3
import uuid
import time
import secrets
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, Response, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

# Force unbuffered output for Railway logs
print("=== Starting MindMap Server ===", flush=True)

# Get the project root (parent of server/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = Flask(__name__, static_folder=PROJECT_ROOT, static_url_path='')

# Configuration
DB_PATH = os.environ.get('DB_PATH', 'mindmap.db')
ADMIN_USERNAME = os.environ.get('BASIC_AUTH_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('BASIC_AUTH_PASSWORD', 'changeme')
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

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
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Initialize database schema."""
    print(f"[DB] Initializing database at {DB_PATH}", flush=True)
    try:
        conn = get_db()

        # Users table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                is_admin INTEGER DEFAULT 0,
                created_at INTEGER,
                updated_at INTEGER
            )
        ''')

        # Maps table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY,
                title TEXT,
                data TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )
        ''')

        # Folders table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )
        ''')

        # Add columns if they don't exist (migration-safe)
        migrations = [
            ('maps', 'folder_id', 'ALTER TABLE maps ADD COLUMN folder_id TEXT'),
            ('maps', 'trashed', 'ALTER TABLE maps ADD COLUMN trashed INTEGER DEFAULT 0'),
            ('maps', 'user_id', 'ALTER TABLE maps ADD COLUMN user_id TEXT'),
            ('folders', 'user_id', 'ALTER TABLE folders ADD COLUMN user_id TEXT'),
        ]
        for table, col, sql in migrations:
            try:
                conn.execute(sql)
                print(f"[DB] Added column {table}.{col}", flush=True)
            except sqlite3.OperationalError:
                pass  # Column already exists

        conn.commit()

        # Create or update admin user from env
        cursor = conn.execute('SELECT id, password_hash FROM users WHERE username = ?', (ADMIN_USERNAME,))
        admin = cursor.fetchone()
        now = int(time.time() * 1000)

        if not admin:
            admin_id = f'user-{uuid.uuid4().hex[:12]}'
            conn.execute(
                'INSERT INTO users (id, username, password_hash, display_name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
                (admin_id, ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), 'Administrateur', now, now)
            )
            print(f"[DB] Created admin user: {ADMIN_USERNAME}", flush=True)
        else:
            admin_id = admin['id']
            # Update admin password if it changed
            if not check_password_hash(admin['password_hash'], ADMIN_PASSWORD):
                conn.execute(
                    'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
                    (generate_password_hash(ADMIN_PASSWORD), now, admin_id)
                )
                print(f"[DB] Updated admin password", flush=True)

        # Assign orphan maps (no user_id) to admin
        conn.execute('UPDATE maps SET user_id = ? WHERE user_id IS NULL', (admin_id,))
        conn.execute('UPDATE folders SET user_id = ? WHERE user_id IS NULL', (admin_id,))

        conn.commit()
        conn.close()
        print(f"[DB] Database initialized successfully", flush=True)
    except Exception as e:
        print(f"[DB] ERROR initializing database: {e}", flush=True)


def get_current_user():
    """Get the current logged-in user from session."""
    user_id = session.get('user_id')
    if not user_id:
        return None
    conn = get_db()
    cursor = conn.execute('SELECT id, username, display_name, is_admin FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None


def requires_login(f):
    """Decorator requiring session-based login."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            # API calls get 401, page requests get redirected
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Non authentifié'}), 401
            return redirect('/login')
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


def requires_admin(f):
    """Decorator requiring admin privileges."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Non authentifié'}), 401
            return redirect('/login')
        if not user.get('is_admin'):
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Accès refusé'}), 403
            return redirect('/')
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


# =============================================================================
# AUTH ROUTES
# =============================================================================

@app.route('/login', methods=['GET'])
def login_page():
    """Serve login page."""
    if get_current_user():
        return redirect('/')
    return send_from_directory(app.static_folder, 'login.html')


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """Authenticate user and create session."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données invalides'}), 400

    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'error': 'Nom d\'utilisateur et mot de passe requis'}), 400

    conn = get_db()
    cursor = conn.execute('SELECT id, username, display_name, password_hash, is_admin FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Identifiants incorrects'}), 401

    session['user_id'] = user['id']
    session.permanent = True
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'displayName': user['display_name'],
        'isAdmin': bool(user['is_admin'])
    })


@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    """Clear session."""
    session.clear()
    return jsonify({'success': True})


@app.route('/api/auth/me', methods=['GET'])
@requires_login
def api_me():
    """Get current user info."""
    user = request.current_user
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'displayName': user['display_name'],
        'isAdmin': bool(user['is_admin'])
    })


# =============================================================================
# ADMIN ROUTES
# =============================================================================

@app.route('/admin')
@requires_admin
def admin_page():
    """Serve admin page."""
    return send_from_directory(app.static_folder, 'admin.html')


@app.route('/api/admin/users', methods=['GET'])
@requires_admin
def list_users():
    """List all users."""
    conn = get_db()
    cursor = conn.execute('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at')
    users = []
    for row in cursor:
        map_count = conn.execute('SELECT COUNT(*) FROM maps WHERE user_id = ? AND (trashed IS NULL OR trashed = 0)', (row['id'],)).fetchone()[0]
        users.append({
            'id': row['id'],
            'username': row['username'],
            'displayName': row['display_name'],
            'isAdmin': bool(row['is_admin']),
            'createdAt': row['created_at'],
            'mapCount': map_count
        })
    conn.close()
    return jsonify(users)


@app.route('/api/admin/users', methods=['POST'])
@requires_admin
def create_user():
    """Create a new user."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données invalides'}), 400

    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    display_name = (data.get('displayName') or '').strip() or username

    if not username or not password:
        return jsonify({'error': 'Nom d\'utilisateur et mot de passe requis'}), 400

    if len(password) < 4:
        return jsonify({'error': 'Le mot de passe doit faire au moins 4 caractères'}), 400

    conn = get_db()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Ce nom d\'utilisateur existe déjà'}), 409

    now = int(time.time() * 1000)
    user_id = f'user-{uuid.uuid4().hex[:12]}'
    conn.execute(
        'INSERT INTO users (id, username, password_hash, display_name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        (user_id, username, generate_password_hash(password), display_name, now, now)
    )
    conn.commit()
    conn.close()

    return jsonify({
        'id': user_id,
        'username': username,
        'displayName': display_name,
        'isAdmin': False,
        'createdAt': now
    })


@app.route('/api/admin/users/<user_id>', methods=['PUT'])
@requires_admin
def update_user(user_id):
    """Update a user (password, display name)."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données invalides'}), 400

    conn = get_db()
    user = conn.execute('SELECT id, is_admin FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    now = int(time.time() * 1000)
    updates = []
    params = []

    display_name = data.get('displayName')
    if display_name is not None:
        updates.append('display_name = ?')
        params.append(display_name.strip())

    password = data.get('password')
    if password:
        if len(password) < 4:
            conn.close()
            return jsonify({'error': 'Le mot de passe doit faire au moins 4 caractères'}), 400
        updates.append('password_hash = ?')
        params.append(generate_password_hash(password))

    if updates:
        updates.append('updated_at = ?')
        params.append(now)
        params.append(user_id)
        conn.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()

    conn.close()
    return jsonify({'success': True})


@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@requires_admin
def delete_user(user_id):
    """Delete a user and all their data."""
    conn = get_db()
    user = conn.execute('SELECT id, is_admin FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    if user['is_admin']:
        conn.close()
        return jsonify({'error': 'Impossible de supprimer un administrateur'}), 400

    # Delete user's maps and folders
    conn.execute('DELETE FROM maps WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM folders WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# =============================================================================
# MAP API ROUTES
# =============================================================================

@app.route('/api/maps', methods=['GET'])
@requires_login
def get_maps():
    """Get map list or single map."""
    user = request.current_user
    map_id = request.args.get('id')
    print(f"[API] GET /api/maps?id={map_id} user={user['username']}", flush=True)
    conn = get_db()

    if map_id == '0' or map_id is None:
        folder_id = request.args.get('folder_id')
        trashed = request.args.get('trashed')
        if trashed == '1':
            cursor = conn.execute(
                'SELECT id, title, updated_at, folder_id FROM maps WHERE user_id = ? AND trashed = 1 ORDER BY updated_at DESC',
                (user['id'],)
            )
        elif folder_id == 'root':
            cursor = conn.execute(
                'SELECT id, title, updated_at, folder_id FROM maps WHERE user_id = ? AND folder_id IS NULL AND (trashed IS NULL OR trashed = 0) ORDER BY updated_at DESC',
                (user['id'],)
            )
        elif folder_id:
            cursor = conn.execute(
                'SELECT id, title, updated_at, folder_id FROM maps WHERE user_id = ? AND folder_id = ? AND (trashed IS NULL OR trashed = 0) ORDER BY updated_at DESC',
                (user['id'], folder_id)
            )
        else:
            cursor = conn.execute(
                'SELECT id, title, updated_at, folder_id FROM maps WHERE user_id = ? AND (trashed IS NULL OR trashed = 0) ORDER BY updated_at DESC',
                (user['id'],)
            )
        maps = []
        for row in cursor:
            maps.append({
                'id': row['id'],
                'title': row['title'],
                'updatedAt': row['updated_at'],
                'folderId': row['folder_id']
            })
        conn.close()
        return jsonify(maps)
    else:
        cursor = conn.execute(
            'SELECT id, title, data, created_at, updated_at, user_id FROM maps WHERE id = ?',
            (map_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row is None:
            return jsonify({'error': 'Map not found'}), 404

        # Users can only access their own maps
        if row['user_id'] != user['id'] and not user.get('is_admin'):
            return jsonify({'error': 'Accès refusé'}), 403

        map_data = json.loads(row['data'])
        return jsonify({'map': map_data})


@app.route('/api/maps', methods=['POST'])
@requires_login
def save_map():
    """Save or update a map."""
    user = request.current_user
    print(f"[API] POST /api/maps user={user['username']}", flush=True)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400

    map_id = data.get('id')
    title = data.get('title', 'Sans titre')
    map_content = data.get('map', {})
    now = int(time.time() * 1000)

    conn = get_db()

    if map_id:
        cursor = conn.execute('SELECT id, user_id FROM maps WHERE id = ?', (map_id,))
        existing = cursor.fetchone()

        if existing:
            # Only allow updating own maps
            if existing['user_id'] != user['id'] and not user.get('is_admin'):
                conn.close()
                return jsonify({'error': 'Accès refusé'}), 403
            conn.execute(
                'UPDATE maps SET title = ?, data = ?, updated_at = ? WHERE id = ?',
                (title, json.dumps(map_content), now, map_id)
            )
        else:
            conn.execute(
                'INSERT INTO maps (id, title, data, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)',
                (map_id, title, json.dumps(map_content), now, now, user['id'])
            )
    else:
        map_id = f'map-{uuid.uuid4().hex[:12]}'
        conn.execute(
            'INSERT INTO maps (id, title, data, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)',
            (map_id, title, json.dumps(map_content), now, now, user['id'])
        )

    conn.commit()
    conn.close()

    return jsonify({
        'id': map_id,
        'title': title,
        'updatedAt': now
    })


@app.route('/api/maps/<map_id>', methods=['DELETE'])
@requires_login
def delete_map(map_id):
    """Permanently delete a map."""
    user = request.current_user
    conn = get_db()
    row = conn.execute('SELECT user_id FROM maps WHERE id = ?', (map_id,)).fetchone()
    if row and row['user_id'] != user['id'] and not user.get('is_admin'):
        conn.close()
        return jsonify({'error': 'Accès refusé'}), 403
    conn.execute('DELETE FROM maps WHERE id = ?', (map_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/maps/<map_id>/trash', methods=['PUT'])
@requires_login
def trash_map(map_id):
    """Move a map to trash (soft delete)."""
    user = request.current_user
    conn = get_db()
    conn.execute('UPDATE maps SET trashed = 1 WHERE id = ? AND user_id = ?', (map_id, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/maps/<map_id>/restore', methods=['PUT'])
@requires_login
def restore_map(map_id):
    """Restore a map from trash."""
    user = request.current_user
    conn = get_db()
    conn.execute('UPDATE maps SET trashed = 0 WHERE id = ? AND user_id = ?', (map_id, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/maps/<map_id>/move', methods=['PUT'])
@requires_login
def move_map(map_id):
    """Move a map to a folder."""
    user = request.current_user
    data = request.get_json()
    folder_id = data.get('folderId')
    conn = get_db()
    conn.execute('UPDATE maps SET folder_id = ? WHERE id = ? AND user_id = ?', (folder_id, map_id, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# =============================================================================
# FOLDER API ROUTES
# =============================================================================

@app.route('/api/folders', methods=['GET'])
@requires_login
def get_folders():
    """List user's folders."""
    user = request.current_user
    conn = get_db()
    cursor = conn.execute('SELECT id, name, created_at, updated_at FROM folders WHERE user_id = ? ORDER BY name', (user['id'],))
    folders = []
    for row in cursor:
        count = conn.execute(
            'SELECT COUNT(*) FROM maps WHERE folder_id = ? AND user_id = ? AND (trashed IS NULL OR trashed = 0)',
            (row['id'], user['id'])
        ).fetchone()[0]
        folders.append({
            'id': row['id'],
            'name': row['name'],
            'mapCount': count,
            'createdAt': row['created_at'],
            'updatedAt': row['updated_at']
        })
    conn.close()
    return jsonify(folders)


@app.route('/api/folders', methods=['POST'])
@requires_login
def create_folder():
    """Create a new folder."""
    user = request.current_user
    data = request.get_json()
    name = data.get('name', 'Nouveau dossier')
    now = int(time.time() * 1000)
    folder_id = f'folder-{uuid.uuid4().hex[:12]}'
    conn = get_db()
    conn.execute(
        'INSERT INTO folders (id, name, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?)',
        (folder_id, name, now, now, user['id'])
    )
    conn.commit()
    conn.close()
    return jsonify({'id': folder_id, 'name': name, 'createdAt': now, 'updatedAt': now})


@app.route('/api/folders/<folder_id>', methods=['PUT'])
@requires_login
def rename_folder(folder_id):
    """Rename a folder."""
    user = request.current_user
    data = request.get_json()
    name = data.get('name', '')
    now = int(time.time() * 1000)
    conn = get_db()
    conn.execute('UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?', (name, now, folder_id, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/folders/<folder_id>', methods=['DELETE'])
@requires_login
def delete_folder(folder_id):
    """Delete a folder. Maps in the folder are moved to root."""
    user = request.current_user
    conn = get_db()
    conn.execute('UPDATE maps SET folder_id = NULL WHERE folder_id = ? AND user_id = ?', (folder_id, user['id']))
    conn.execute('DELETE FROM folders WHERE id = ? AND user_id = ?', (folder_id, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# =============================================================================
# STATIC FILE ROUTES (catch-all, must be AFTER API routes)
# =============================================================================

@app.route('/')
@requires_login
def index():
    """Serve the main application."""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    """Serve static files (JS, CSS, etc.)."""
    # Don't serve files from api/ path
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    # Login page and its assets are public
    if path in ('login.html', 'admin.html'):
        return send_from_directory(app.static_folder, path)
    # Static assets (CSS, JS, fonts) are always accessible
    if path.startswith('src/') or path.endswith('.css') or path.endswith('.js') or path.endswith('.ico'):
        return send_from_directory(app.static_folder, path)
    # Everything else requires login
    user = get_current_user()
    if not user:
        return redirect('/login')
    return send_from_directory(app.static_folder, path)


# Initialize database on startup
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
