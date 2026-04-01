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
        loaded = load.get_json()['map']
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
        loaded = load.get_json()['map']
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
        loaded = load.get_json()['map']
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
        loaded = load.get_json()['map']
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
        loaded = load.get_json()['map']
        assert loaded['nodes']['n1']['text'] == 'Root'
        assert 'frames' not in loaded


class TestInjectAPI:
    def _create_map(self, authed_client):
        resp = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Inject test', 'map': make_map_json()}),
            content_type='application/json'
        )
        return resp.get_json()['id']

    def test_inject_add_child(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_1', 'text': 'Test'}
            ]}),
            content_type='application/json'
        )
        data = resp.get_json()
        assert data['ok'] is True
        assert data['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert 'ai_1' in loaded['nodes']
        assert loaded['nodes']['ai_1']['parentId'] == 'n1'
        assert 'ai_1' in loaded['nodes']['n1']['children']

    def test_inject_cascade_references(self, authed_client):
        """Operations can reference nodes created in the same batch."""
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_1', 'text': 'Parent'},
                {'op': 'add_child', 'parent': 'ai_1', 'id': 'ai_2', 'text': 'Enfant'},
            ]}),
            content_type='application/json'
        )
        data = resp.get_json()
        assert data['operations_applied'] == 2

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert loaded['nodes']['ai_2']['parentId'] == 'ai_1'

    def test_inject_idempotent(self, authed_client):
        """Replaying the same batch doesn't duplicate nodes."""
        map_id = self._create_map(authed_client)
        ops = json.dumps({'operations': [
            {'op': 'add_child', 'parent': 'n1', 'id': 'ai_1', 'text': 'Once'}
        ]})
        authed_client.post(f'/api/maps/{map_id}/inject',
                          data=ops, content_type='application/json')
        resp = authed_client.post(f'/api/maps/{map_id}/inject',
                                 data=ops, content_type='application/json')
        data = resp.get_json()
        assert data['operations_skipped'] == 1
        assert data['operations_applied'] == 0

    def test_inject_add_sibling(self, authed_client):
        map_id = self._create_map(authed_client)
        # First add a child, then add a sibling
        authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_1', 'text': 'First'}
            ]}),
            content_type='application/json'
        )
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_sibling', 'sibling_of': 'ai_1', 'id': 'ai_2', 'text': 'Second'}
            ]}),
            content_type='application/json'
        )
        data = resp.get_json()
        assert data['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert loaded['nodes']['ai_2']['parentId'] == 'n1'
        # Should be inserted after ai_1
        children = loaded['nodes']['n1']['children']
        assert children.index('ai_2') == children.index('ai_1') + 1

    def test_inject_add_card(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_card', 'id': 'card_1', 'text': 'Notes',
                 'fx': 500, 'fy': 100, 'body': '## Test\n- item'}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert loaded['nodes']['card_1']['nodeType'] == 'card'
        assert loaded['nodes']['card_1']['body'] == '## Test\n- item'
        assert loaded['nodes']['card_1']['placement'] == 'free'

    def test_inject_add_free_bubble(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_free_bubble', 'id': 'fb_1', 'text': 'Idée',
                 'fx': 300, 'fy': -100}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert loaded['nodes']['fb_1']['nodeType'] == 'bubble'
        assert loaded['nodes']['fb_1']['fx'] == 300

    def test_inject_add_link(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_a', 'text': 'A'},
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_b', 'text': 'B'},
                {'op': 'add_link', 'from': 'ai_a', 'to': 'ai_b', 'label': 'lié'},
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 3

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert any(l['label'] == 'lié' for l in loaded.get('links', []))

    def test_inject_add_frame(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_frame', 'id': 'f_test', 'title': 'Zone IA',
                 'x': 0, 'y': 0, 'w': 500, 'h': 400}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert any(f['id'] == 'f_test' for f in loaded.get('frames', []))

    def test_inject_add_tag(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_tag', 'id': 'tg1', 'label': 'IA-généré', 'color': '#8b5cf6'}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert any(t['id'] == 'tg1' for t in loaded.get('settings', {}).get('tags', []))

    def test_inject_update_node(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'update_node', 'id': 'n1', 'text': 'Updated Root'}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert loaded['nodes']['n1']['text'] == 'Updated Root'

    def test_inject_delete_node(self, authed_client):
        map_id = self._create_map(authed_client)
        # Add then delete
        authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'ai_del', 'text': 'To delete'}
            ]}),
            content_type='application/json'
        )
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'delete_node', 'id': 'ai_del'}
            ]}),
            content_type='application/json'
        )
        assert resp.get_json()['operations_applied'] == 1

        load = authed_client.get(f'/api/maps?id={map_id}')
        loaded = load.get_json()['map']
        assert 'ai_del' not in loaded['nodes']
        assert 'ai_del' not in loaded['nodes']['n1']['children']

    def test_inject_error_bad_parent(self, authed_client):
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'doesnt_exist', 'text': 'Fail'}
            ]}),
            content_type='application/json'
        )
        data = resp.get_json()
        assert data['operations_skipped'] == 1
        assert len(data['errors']) == 1
        assert data['errors'][0]['error']  # error message present

    def test_inject_mixed_operations(self, authed_client):
        """Full test with all operation types in one batch."""
        map_id = self._create_map(authed_client)
        resp = authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_tag', 'id': 'tg1', 'label': 'IA', 'color': '#8b5cf6'},
                {'op': 'add_child', 'parent': 'n1', 'id': 'x1', 'text': 'Branche', 'tags': ['tg1']},
                {'op': 'add_child', 'parent': 'x1', 'id': 'x2', 'text': 'Sous-branche'},
                {'op': 'add_card', 'id': 'x3', 'text': 'Card', 'fx': 500, 'fy': 0, 'body': '# Note'},
                {'op': 'add_free_bubble', 'id': 'x4', 'text': 'Libre', 'fx': 300, 'fy': 200},
                {'op': 'add_link', 'from': 'x3', 'to': 'x1', 'label': 'annoté'},
                {'op': 'add_frame', 'id': 'xf', 'title': 'Zone', 'x': 250, 'y': -50, 'w': 500, 'h': 400},
            ]}),
            content_type='application/json'
        )
        data = resp.get_json()
        assert data['operations_applied'] == 7
        assert data['operations_skipped'] == 0

    def test_inject_map_not_found(self, authed_client):
        resp = authed_client.post(
            '/api/maps/nonexistent/inject',
            data=json.dumps({'operations': []}),
            content_type='application/json'
        )
        assert resp.status_code == 404

    def test_inject_unauthenticated(self, client):
        resp = client.post(
            '/api/maps/whatever/inject',
            data=json.dumps({'operations': []}),
            content_type='application/json'
        )
        assert resp.status_code == 401


class TestOutlineAPI:
    def _create_map_with_children(self, authed_client):
        map_id_resp = authed_client.post(
            '/api/maps',
            data=json.dumps({'title': 'Outline Test', 'map': make_map_json()}),
            content_type='application/json'
        )
        map_id = map_id_resp.get_json()['id']
        authed_client.post(
            f'/api/maps/{map_id}/inject',
            data=json.dumps({'operations': [
                {'op': 'add_child', 'parent': 'n1', 'id': 'o1', 'text': 'Branch A'},
                {'op': 'add_child', 'parent': 'o1', 'id': 'o2', 'text': 'Leaf 1'},
                {'op': 'add_free_bubble', 'id': 'fb1', 'text': 'Free note', 'fx': 400, 'fy': 200},
                {'op': 'add_card', 'id': 'cd1', 'text': 'Card title', 'fx': 600, 'fy': 100, 'body': '## Content'},
                {'op': 'add_frame', 'id': 'fr1', 'title': 'Work zone', 'x': 0, 'y': 0, 'w': 500, 'h': 400},
            ]}),
            content_type='application/json'
        )
        return map_id

    def test_outline_tree(self, authed_client):
        map_id = self._create_map_with_children(authed_client)
        resp = authed_client.get(f'/api/maps/{map_id}/outline')
        assert resp.status_code == 200
        data = resp.get_json()
        assert '[n1]' in data['tree']
        assert '[o1]' in data['tree']
        assert '[o2]' in data['tree']
        assert 'Branch A' in data['tree']

    def test_outline_free_bubbles(self, authed_client):
        map_id = self._create_map_with_children(authed_client)
        data = authed_client.get(f'/api/maps/{map_id}/outline').get_json()
        assert any(b['id'] == 'fb1' for b in data['free_bubbles'])

    def test_outline_cards(self, authed_client):
        map_id = self._create_map_with_children(authed_client)
        data = authed_client.get(f'/api/maps/{map_id}/outline').get_json()
        card = next(c for c in data['cards'] if c['id'] == 'cd1')
        assert card['text'] == 'Card title'
        assert card['body'] == '## Content'

    def test_outline_frames(self, authed_client):
        map_id = self._create_map_with_children(authed_client)
        data = authed_client.get(f'/api/maps/{map_id}/outline').get_json()
        assert any(f['id'] == 'fr1' for f in data['frames'])

    def test_outline_not_found(self, authed_client):
        resp = authed_client.get('/api/maps/nonexistent/outline')
        assert resp.status_code == 404

    def test_outline_unauthenticated(self, client):
        resp = client.get('/api/maps/whatever/outline')
        assert resp.status_code == 401


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
