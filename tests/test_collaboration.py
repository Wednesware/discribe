import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pycrdt import Doc, Text
from starlette.websockets import WebSocketDisconnect

from discribe.collaboration import Sessions, install_routes


@pytest.fixture
def host(tmp_path):
    app = FastAPI()
    sessions = Sessions(tmp_path)
    install_routes(app, sessions)
    with TestClient(app) as client:
        yield client, sessions


def create(client):
    return client.post('/discribe/api/sessions', json={'kind': 'code', 'name': 'shared.py', 'filePath': '/secret/path'}).json()


def connect(client, session, role):
    return client.websocket_connect('/discribe/ws/' + session['id'])


def auth(ws, session, role):
    ws.send_json({'token': session['tokens'][role], 'name': role})
    assert ws.receive_json()['role'] == role
    assert ws.receive_bytes()[0] == 0
    assert ws.receive_json()['type'] == 'presence'


def test_binary_updates_merge_persist_and_permissions_are_enforced(host, tmp_path):
    client, sessions = host
    session = create(client)
    assert 'filePath' not in session
    with connect(client, session, 'host') as owner:
        auth(owner, session, 'host')
        with connect(client, session, 'editor') as editor:
            auth(editor, session, 'editor')
            assert owner.receive_json()['type'] == 'presence'
            local = Doc({'code': Text('Hello')})
            editor.send_bytes(b'\x01' + local.get_update())
            update = owner.receive_bytes()
            assert update[0] == 1
            merged = Doc({'code': Text()})
            merged.apply_update(update[1:])
            assert str(merged['code']) == 'Hello'
        owner.receive_json()
        with connect(client, session, 'viewer') as viewer:
            auth(viewer, session, 'viewer')
            owner.receive_json()
            viewer.send_bytes(b'\x01' + local.get_update())
            with pytest.raises(WebSocketDisconnect) as error:
                viewer.receive_bytes()
            assert error.value.code == 4003
    restored = Sessions(tmp_path)
    state = Doc({'code': Text()})
    state.apply_update(restored.get(session['id']).doc.get_update())
    assert str(state['code']) == 'Hello'


def test_bad_auth_malformed_updates_and_host_only_end(host):
    client, sessions = host
    session = create(client)
    with client.websocket_connect('/discribe/ws/' + session['id']) as ws:
        ws.send_json({'token': 'bad'})
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 4003
    with connect(client, session, 'editor') as ws:
        auth(ws, session, 'editor')
        ws.send_bytes(b'\x01not-a-yjs-update')
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_bytes()
        assert error.value.code == 4002
    endpoint = '/discribe/api/sessions/' + session['id']
    assert client.delete(endpoint, headers={'Authorization': 'Bearer ' + session['tokens']['editor']}).status_code == 403
    assert client.delete(endpoint, headers={'Authorization': 'Bearer ' + session['tokens']['host']}).status_code == 200
    assert session['id'] not in sessions.items
    assert client.post('/discribe/api/sessions', json={'kind': 'bogus'}).status_code == 400
    assert client.post('/discribe/api/sessions', content='not-json').status_code == 400


def test_concurrent_updates_converge_in_any_order():
    base = Doc({'code': Text('Hello')})
    alice = Doc({'code': Text()}); bob = Doc({'code': Text()})
    for doc in (alice, bob):
        doc.apply_update(base.get_update())
    state = base.get_state()
    alice['code'].insert(0, 'Alice ')
    bob['code'].insert(len(bob['code']), ' Bob')
    for update in (alice.get_update(state), bob.get_update(state)):
        base.apply_update(update)
    alice.apply_update(base.get_update(alice.get_state()))
    bob.apply_update(base.get_update(bob.get_state()))
    assert str(base['code']) == str(alice['code']) == str(bob['code']) == 'Alice Hello Bob'
