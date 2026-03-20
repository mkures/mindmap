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
            ('maps', 'share_token', 'ALTER TABLE maps ADD COLUMN share_token TEXT'),
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


def _try_basic_auth():
    """Try HTTP Basic Auth, return user dict or None."""
    auth = request.authorization
    if not auth or not auth.username or not auth.password:
        return None
    conn = get_db()
    cursor = conn.execute(
        'SELECT id, username, display_name, password_hash, is_admin FROM users WHERE username = ?',
        (auth.username,)
    )
    row = cursor.fetchone()
    conn.close()
    if not row or not check_password_hash(row['password_hash'], auth.password):
        return None
    return dict(row)


def requires_api_auth(f):
    """Decorator accepting session-based login OR HTTP Basic Auth."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            user = _try_basic_auth()
        if not user:
            return jsonify({'error': 'Non authentifié'}), 401
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


@app.route('/api/admin/backup', methods=['GET'])
@requires_admin
def backup_db():
    """Download the SQLite database file."""
    import shutil
    import tempfile
    db_path = os.path.abspath(DB_PATH)
    # Copy to temp file to avoid locking issues
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    tmp.close()
    conn = get_db()
    conn.execute('BEGIN IMMEDIATE')
    shutil.copy2(db_path, tmp.name)
    conn.rollback()
    conn.close()
    from flask import send_file
    timestamp = time.strftime('%Y%m%d-%H%M%S')
    return send_file(
        tmp.name,
        mimetype='application/x-sqlite3',
        as_attachment=True,
        download_name=f'mindmap-backup-{timestamp}.db'
    )


@app.route('/api/admin/backup', methods=['POST'])
@requires_admin
def backup_to_r2():
    """Upload SQLite backup to Cloudflare R2."""
    import shutil
    import tempfile
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        return jsonify({'error': 'boto3 non installé'}), 500

    r2_endpoint = os.environ.get('R2_ENDPOINT_URL')
    r2_access_key = os.environ.get('R2_ACCESS_KEY_ID')
    r2_secret_key = os.environ.get('R2_SECRET_ACCESS_KEY')
    r2_bucket = os.environ.get('R2_BUCKET_NAME', 'mindmap-backups')
    r2_key = os.environ.get('R2_BACKUP_KEY', 'mindmap.db')

    if not r2_endpoint or not r2_access_key or not r2_secret_key:
        return jsonify({'error': 'Variables R2 manquantes (R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)'}), 400

    try:
        db_path = os.path.abspath(DB_PATH)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        tmp.close()

        # Atomic copy using SQLite backup API (VACUUM INTO if available, else shutil.copy)
        try:
            src_conn = sqlite3.connect(db_path)
            dst_conn = sqlite3.connect(tmp.name)
            src_conn.backup(dst_conn)
            src_conn.close()
            dst_conn.close()
        except Exception:
            import shutil
            shutil.copy2(db_path, tmp.name)

        # Upload to R2
        s3 = boto3.client(
            's3',
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )
        timestamp = time.strftime('%Y%m%d-%H%M%S')
        base = r2_key[:-3] if r2_key.endswith('.db') else r2_key
        key = f'{base}-{timestamp}.db'
        s3.upload_file(tmp.name, r2_bucket, key)
        os.unlink(tmp.name)
        return jsonify({'success': True, 'key': key, 'bucket': r2_bucket})
    except Exception as e:
        print(f'[R2 BACKUP] Error: {e}', flush=True)
        return jsonify({'error': str(e)}), 500


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
# SHARE ROUTES
# =============================================================================

@app.route('/api/maps/<map_id>/share', methods=['POST'])
@requires_login
def share_map(map_id):
    """Generate or get a share token for a map."""
    user = request.current_user
    conn = get_db()
    row = conn.execute('SELECT user_id, share_token FROM maps WHERE id = ?', (map_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Carte introuvable'}), 404
    if row['user_id'] != user['id'] and not user.get('is_admin'):
        conn.close()
        return jsonify({'error': 'Accès refusé'}), 403
    token = row['share_token']
    if not token:
        token = secrets.token_urlsafe(20)
        conn.execute('UPDATE maps SET share_token = ? WHERE id = ?', (token, map_id))
        conn.commit()
    conn.close()
    return jsonify({'token': token})


@app.route('/api/maps/<map_id>/share', methods=['DELETE'])
@requires_login
def unshare_map(map_id):
    """Remove share token (revoke sharing)."""
    user = request.current_user
    conn = get_db()
    row = conn.execute('SELECT user_id FROM maps WHERE id = ?', (map_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Carte introuvable'}), 404
    if row['user_id'] != user['id'] and not user.get('is_admin'):
        conn.close()
        return jsonify({'error': 'Accès refusé'}), 403
    conn.execute('UPDATE maps SET share_token = NULL WHERE id = ?', (map_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/shared/<token>', methods=['GET'])
def get_shared_map(token):
    """Get a shared map by token (no auth required)."""
    conn = get_db()
    row = conn.execute('SELECT data, title FROM maps WHERE share_token = ? AND (trashed IS NULL OR trashed = 0)', (token,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Carte introuvable ou partage désactivé'}), 404
    map_data = json.loads(row['data'])
    return jsonify({'map': map_data, 'title': row['title']})


@app.route('/s/<token>')
def shared_view(token):
    """Serve shared map viewer page."""
    return send_from_directory(app.static_folder, 'shared.html')


# =============================================================================
# INJECT / OUTLINE API (for AI and external tools)
# =============================================================================

def _generate_node_id(map_data):
    """Generate a unique node ID that doesn't collide with existing nodes."""
    counter = len(map_data.get('nodes', {})) + 1
    node_id = f'n{counter}'
    while node_id in map_data.get('nodes', {}):
        counter += 1
        node_id = f'n{counter}'
    return node_id


def _delete_node_recursive(map_data, node_id):
    """Delete a node and all its descendants from map_data."""
    node = map_data['nodes'].get(node_id)
    if not node:
        return
    # Remove from parent's children
    parent = map_data['nodes'].get(node.get('parentId'))
    if parent and 'children' in parent:
        parent['children'] = [c for c in parent['children'] if c != node_id]
    # Recursively delete children
    for child_id in list(node.get('children', [])):
        _delete_node_recursive(map_data, child_id)
    del map_data['nodes'][node_id]


def _load_map_data(raw_data):
    """Load map data from DB, handling both dict and double-encoded string formats."""
    data = json.loads(raw_data)
    if isinstance(data, str):
        data = json.loads(data)
    return data


def _save_map_data(map_data, original_raw):
    """Serialize map data for DB storage, preserving original encoding format."""
    # Detect if original was double-encoded (string inside JSON)
    decoded_once = json.loads(original_raw)
    if isinstance(decoded_once, str):
        # Was double-encoded: re-encode the same way
        return json.dumps(json.dumps(map_data))
    return json.dumps(map_data)


@app.route('/api/maps/<map_id>/inject', methods=['POST'])
@requires_api_auth
def inject_operations(map_id):
    """Batch operations on a map (for AI injection)."""
    user = request.current_user
    conn = get_db()
    row = conn.execute('SELECT data, user_id FROM maps WHERE id = ?', (map_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Map not found'}), 404

    if row['user_id'] != user['id'] and not user.get('is_admin'):
        conn.close()
        return jsonify({'error': 'Accès refusé'}), 403

    raw_data = row['data']
    map_data = _load_map_data(raw_data)
    operations = request.get_json().get('operations', [])

    applied = 0
    skipped = 0
    errors = []
    node_ids = {}

    for i, op_data in enumerate(operations):
        try:
            op = op_data.get('op')

            if op == 'add_child':
                parent_id = op_data['parent']
                if parent_id not in map_data.get('nodes', {}):
                    raise ValueError(f"Parent '{parent_id}' not found")
                node_id = op_data.get('id') or _generate_node_id(map_data)
                if node_id in map_data['nodes']:
                    skipped += 1
                    continue
                map_data['nodes'][node_id] = {
                    'id': node_id,
                    'parentId': parent_id,
                    'text': op_data.get('text', 'Node'),
                    'children': [],
                    'color': op_data.get('color'),
                    'tags': op_data.get('tags', [])
                }
                map_data['nodes'][parent_id]['children'].append(node_id)
                node_ids[node_id] = node_id

            elif op == 'add_sibling':
                ref_id = op_data['sibling_of']
                ref_node = map_data['nodes'].get(ref_id)
                if not ref_node or not ref_node.get('parentId'):
                    raise ValueError(f"Node '{ref_id}' not found or is root")
                parent_id = ref_node['parentId']
                node_id = op_data.get('id') or _generate_node_id(map_data)
                if node_id in map_data['nodes']:
                    skipped += 1
                    continue
                map_data['nodes'][node_id] = {
                    'id': node_id,
                    'parentId': parent_id,
                    'text': op_data.get('text', 'Node'),
                    'children': [],
                    'color': op_data.get('color'),
                    'tags': op_data.get('tags', [])
                }
                siblings = map_data['nodes'][parent_id]['children']
                idx = siblings.index(ref_id) + 1 if ref_id in siblings else len(siblings)
                siblings.insert(idx, node_id)
                node_ids[node_id] = node_id

            elif op == 'add_free_bubble':
                node_id = op_data.get('id') or _generate_node_id(map_data)
                if node_id in map_data.get('nodes', {}):
                    skipped += 1
                    continue
                map_data['nodes'][node_id] = {
                    'id': node_id,
                    'parentId': None,
                    'text': op_data.get('text', 'Note'),
                    'children': [],
                    'nodeType': 'bubble',
                    'placement': 'free',
                    'fx': op_data.get('fx', 0),
                    'fy': op_data.get('fy', 0),
                    'color': op_data.get('color', '#fef3c7'),
                    'tags': op_data.get('tags', [])
                }
                node_ids[node_id] = node_id

            elif op == 'add_card':
                node_id = op_data.get('id') or _generate_node_id(map_data)
                if node_id in map_data.get('nodes', {}):
                    skipped += 1
                    continue
                map_data['nodes'][node_id] = {
                    'id': node_id,
                    'parentId': None,
                    'text': op_data.get('text', 'Sans titre'),
                    'children': [],
                    'nodeType': 'card',
                    'placement': 'free',
                    'fx': op_data.get('fx', 0),
                    'fy': op_data.get('fy', 0),
                    'color': op_data.get('color', '#ffffff'),
                    'body': op_data.get('body', ''),
                    'cardWidth': op_data.get('cardWidth', 280),
                    'cardExpanded': bool(op_data.get('cardExpanded', False)),
                    'tags': op_data.get('tags', [])
                }
                node_ids[node_id] = node_id

            elif op == 'add_link':
                if 'links' not in map_data:
                    map_data['links'] = []
                from_id = op_data['from']
                to_id = op_data['to']
                if any(l['from'] == from_id and l['to'] == to_id for l in map_data['links']):
                    skipped += 1
                    continue
                link_id = f'l{int(time.time() * 1000)}{i}'
                map_data['links'].append({
                    'id': link_id,
                    'from': from_id,
                    'to': to_id,
                    'label': op_data.get('label', ''),
                    'color': op_data.get('color', '#94a3b8'),
                    'style': op_data.get('style', 'dashed')
                })

            elif op == 'add_frame':
                if 'frames' not in map_data:
                    map_data['frames'] = []
                frame_id = op_data.get('id') or f'f{int(time.time() * 1000)}'
                if any(f['id'] == frame_id for f in map_data['frames']):
                    skipped += 1
                    continue
                map_data['frames'].append({
                    'id': frame_id,
                    'title': op_data.get('title', 'Zone'),
                    'color': op_data.get('color', '#dbeafe'),
                    'x': op_data.get('x', 0),
                    'y': op_data.get('y', 0),
                    'w': op_data.get('w', 400),
                    'h': op_data.get('h', 300)
                })

            elif op == 'add_tag':
                map_data.setdefault('settings', {}).setdefault('tags', [])
                tag_id = op_data['id']
                if any(t['id'] == tag_id for t in map_data['settings']['tags']):
                    skipped += 1
                    continue
                map_data['settings']['tags'].append({
                    'id': tag_id,
                    'name': op_data.get('label', ''),
                    'color': op_data.get('color', '#94a3b8')
                })

            elif op == 'update_node':
                node_id = op_data['id']
                node = map_data['nodes'].get(node_id)
                if not node:
                    raise ValueError(f"Node '{node_id}' not found")
                for key in ('text', 'body', 'tags', 'color'):
                    if key in op_data:
                        node[key] = op_data[key]

            elif op == 'delete_node':
                node_id = op_data['id']
                if node_id not in map_data.get('nodes', {}) or node_id == map_data.get('rootId'):
                    skipped += 1
                    continue
                _delete_node_recursive(map_data, node_id)
                if 'links' in map_data:
                    map_data['links'] = [l for l in map_data['links']
                                         if l['from'] != node_id and l['to'] != node_id]

            else:
                raise ValueError(f"Unknown operation '{op}'")

            applied += 1

        except Exception as e:
            skipped += 1
            errors.append({'index': i, 'op': op_data.get('op'), 'error': str(e)})

    # Save
    map_data['updatedAt'] = int(time.time() * 1000)
    serialized = _save_map_data(map_data, raw_data)
    conn.execute('UPDATE maps SET data = ?, updated_at = ? WHERE id = ?',
                 (serialized, map_data['updatedAt'], map_id))
    conn.commit()
    conn.close()

    result = {
        'ok': True,
        'map_id': map_id,
        'operations_applied': applied,
        'operations_skipped': skipped,
        'node_ids': node_ids
    }
    if errors:
        result['errors'] = errors
    return jsonify(result)


@app.route('/api/maps/<map_id>/outline', methods=['GET'])
@requires_api_auth
def map_outline(map_id):
    """Return a simplified outline view of a map (for AI context)."""
    user = request.current_user
    conn = get_db()
    row = conn.execute('SELECT data, title, user_id FROM maps WHERE id = ?', (map_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Map not found'}), 404

    if row['user_id'] != user['id'] and not user.get('is_admin'):
        conn.close()
        return jsonify({'error': 'Accès refusé'}), 403

    conn.close()
    map_data = _load_map_data(row['data'])
    nodes = map_data.get('nodes', {})

    # Build indented tree outline
    def build_tree(node_id, indent=0):
        node = nodes.get(node_id)
        if not node:
            return ''
        prefix = '  ' * indent + '- '
        line = f"{prefix}[{node_id}] {node.get('text', '')}\n"
        for child_id in node.get('children', []):
            line += build_tree(child_id, indent + 1)
        return line

    root_id = map_data.get('rootId', '')
    tree_text = build_tree(root_id).strip()

    # Collect free bubbles and cards
    free_bubbles = []
    cards = []
    for nid, node in nodes.items():
        if node.get('placement') != 'free':
            continue
        entry = {
            'id': nid,
            'text': node.get('text', ''),
            'fx': node.get('fx'),
            'fy': node.get('fy'),
            'tags': node.get('tags', [])
        }
        if node.get('nodeType') == 'card':
            entry['body'] = node.get('body', '')
            cards.append(entry)
        else:
            free_bubbles.append(entry)

    return jsonify({
        'map_id': map_id,
        'title': row['title'],
        'tree': tree_text,
        'free_bubbles': free_bubbles,
        'cards': cards,
        'frames': map_data.get('frames', []),
        'tags': map_data.get('settings', {}).get('tags', [])
    })


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
    if path in ('login.html', 'admin.html', 'shared.html'):
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
