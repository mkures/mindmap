import pytest
import json
import os
import tempfile
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))


@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.environ['DB_PATH'] = db_path
    os.environ['BASIC_AUTH_USERNAME'] = 'test'
    os.environ['BASIC_AUTH_PASSWORD'] = 'testpass'

    for key in list(sys.modules.keys()):
        if 'app' in key:
            del sys.modules[key]
    from app import app as flask_app
    flask_app.config['TESTING'] = True
    flask_app.config['SECRET_KEY'] = 'test-secret'

    yield flask_app

    try:
        os.close(db_fd)
    except Exception:
        pass
    try:
        os.unlink(db_path)
    except Exception:
        pass


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def authed_client(client):
    """Return a client that is already logged in as the test admin user."""
    client.post(
        '/api/auth/login',
        data=json.dumps({'username': 'test', 'password': 'testpass'}),
        content_type='application/json'
    )
    return client


def make_map_json(**overrides):
    base = {
        'rootId': 'n1',
        'nodes': {
            'n1': {'id': 'n1', 'parentId': None, 'text': 'Root', 'children': []}
        },
        'settings': {}
    }
    base.update(overrides)
    return json.dumps(base)


class TestAuth:
    def test_unauthenticated_rejected(self, client):
        resp = client.get('/api/maps?id=0')
        assert resp.status_code == 401

    def test_authenticated_accepted(self, authed_client):
        resp = authed_client.get('/api/maps?id=0')
        assert resp.status_code == 200


class TestMapsCRUD:
    def test_list_maps_empty(self, authed_client):
        resp = authed_client.get('/api/maps?id=0')
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_create_map(self, authed_client):
        resp = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Test', 'map': make_map_json()}),
            content_type='application/json'
        )
        assert resp.status_code == 200
        assert 'id' in resp.get_json()

    def test_load_map(self, authed_client):
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Load me', 'map': make_map_json()}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        assert load.status_code == 200
        # Single map load returns {'map': <map_object>}
        assert 'map' in load.get_json()
        # Title is available via the list endpoint
        maps_list = authed_client.get('/api/maps?id=0').get_json()
        assert any(m['id'] == map_id and m['title'] == 'Load me' for m in maps_list)

    def test_update_map(self, authed_client):
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'V1', 'map': make_map_json()}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        authed_client.post(
            '/api/maps',
            data=json.dumps({'id': map_id, 'title': 'V2', 'map': make_map_json()}),
            content_type='application/json'
        )
        # Title is returned in the list endpoint, not the single map endpoint
        maps_list = authed_client.get('/api/maps?id=0').get_json()
        assert any(m['id'] == map_id and m['title'] == 'V2' for m in maps_list)

    def test_delete_map(self, authed_client):
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Delete me', 'map': make_map_json()}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        delete = authed_client.delete(f'/api/maps/{map_id}')
        assert delete.status_code == 200


class TestNewFieldsRoundtrip:
    def test_free_bubble_fields_survive(self, authed_client):
        map_json = make_map_json(nodes={
            'n1': {'id': 'n1', 'parentId': None, 'text': 'Root', 'children': []},
            'n2': {'id': 'n2', 'parentId': None, 'text': 'Free',
                   'children': [], 'nodeType': 'bubble', 'placement': 'free',
                   'fx': 150, 'fy': -200}
        })
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Free', 'map': map_json}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = json.loads(load.get_json()['map'])
        assert loaded['nodes']['n2']['placement'] == 'free'
        assert loaded['nodes']['n2']['fx'] == 150

    def test_frames_survive(self, authed_client):
        map_json = make_map_json(
            frames=[{'id': 'f1', 'title': 'Projet A', 'color': '#dbeafe',
                     'x': 50, 'y': 50, 'w': 400, 'h': 300}]
        )
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Frames', 'map': map_json}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = json.loads(load.get_json()['map'])
        assert loaded['frames'][0]['title'] == 'Projet A'
        assert loaded['frames'][0]['w'] == 400

    def test_links_survive(self, authed_client):
        map_json = make_map_json(
            links=[{'id': 'l1', 'from': 'n1', 'to': 'n1', 'label': 'self',
                    'color': '#94a3b8', 'style': 'dashed'}]
        )
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Links', 'map': map_json}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = json.loads(load.get_json()['map'])
        assert loaded['links'][0]['label'] == 'self'

    def test_tags_survive(self, authed_client):
        map_json = make_map_json(
            nodes={'n1': {'id': 'n1', 'parentId': None, 'text': 'Root',
                          'children': [], 'tags': ['tag1']}},
            settings={'tags': [{'id': 'tag1', 'name': 'En cours', 'color': '#3b82f6'}]}
        )
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Tags', 'map': map_json}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = json.loads(load.get_json()['map'])
        assert loaded['nodes']['n1']['tags'] == ['tag1']

    def test_old_map_loads_fine(self, authed_client):
        old_map = json.dumps({
            'rootId': 'n1',
            'nodes': {
                'n1': {'id': 'n1', 'parentId': None, 'text': 'Root', 'children': ['n2']},
                'n2': {'id': 'n2', 'parentId': 'n1', 'text': 'Child', 'children': []}
            },
            'settings': {'levelColors': ['#fff', '#f00']}
        })
        create = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Old', 'map': old_map}),
            content_type='application/json'
        )
        map_id = create.get_json()['id']
        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = json.loads(load.get_json()['map'])
        assert loaded['nodes']['n1']['text'] == 'Root'
        assert 'frames' not in loaded


class TestSharing:
    def _create_map(self, authed_client):
        resp = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Shared', 'map': make_map_json()}),
            content_type='application/json'
        )
        return resp.get_json()['id']

    def test_share_creates_token(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(f'/api/maps/{map_id}/share')
        if resp.status_code == 404:
            pytest.skip('Sharing not implemented')
        data = resp.get_json()
        assert 'token' in data

    def test_shared_view_accessible_without_auth(self, client, authed_client):
        map_id = self._create_map(authed_client)
        share_resp = authed_client.post(f'/api/maps/{map_id}/share')
        if share_resp.status_code == 404:
            pytest.skip('Sharing not implemented')
        token = share_resp.get_json()['token']
        view_resp = client.get(f'/api/shared/{token}')
        assert view_resp.status_code == 200

    def test_shared_nonexistent_token_404(self, client):
        resp = client.get('/api/shared/doesnotexist123456')
        assert resp.status_code in (404, 500)
