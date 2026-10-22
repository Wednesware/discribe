"""Capability-authorized binary Yjs transport added to Beryllium's ASGI host.

Wire: first message JSON {token,name}; subsequent binary messages consist of
one byte (0=server snapshot, 1=Yjs update, 2=awareness) followed by payload.
The server merges Yjs updates with pycrdt, never by concatenating text.
"""
import asyncio
import contextlib
import json
import os
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pycrdt import Doc as YDoc

MAX_MESSAGE = 1024 * 1024
MAX_STATE = 20 * 1024 * 1024
SESSION_LIFETIME = 7 * 86400


@dataclass
class Session:
    id: str
    metadata: dict
    tokens: dict
    expires: float
    doc: YDoc = field(default_factory=YDoc)
    peers: dict = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class Sessions:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.items: dict[str, Session] = {}
        for file in directory.glob('*.json'):
            try:
                data = json.loads(file.read_text())
                if data['expires'] <= time.time():
                    continue
                session = Session(data['id'], data['metadata'], data['tokens'], data['expires'])
                state = directory / f'{session.id}.yjs'
                if state.exists():
                    session.doc.apply_update(state.read_bytes())
                self.items[session.id] = session
            except (ValueError, KeyError, OSError):
                continue

    def create(self, metadata):
        for key, item in list(self.items.items()):
            if item.expires <= time.time() and not item.peers:
                self.items.pop(key)
                for suffix in ('json', 'yjs'):
                    (self.directory / f'{key}.{suffix}').unlink(missing_ok=True)
        if len(self.items) >= 32:
            raise HTTPException(429, 'Host has reached its session limit')
        if metadata.get('kind') not in ('code', 'write'):
            raise HTTPException(400, 'A session must use Code or Write')
        safe = {'name': str(metadata.get('name', 'Shared document'))[:255], 'kind': metadata['kind'],
                'language': str(metadata.get('language', 'plaintext'))[:40]}
        session = Session(secrets.token_urlsafe(16), safe,
                          {role: secrets.token_urlsafe(32) for role in ('host', 'editor', 'viewer')},
                          time.time() + SESSION_LIFETIME)
        self.items[session.id] = session
        self.persist(session)
        return session

    def get(self, session_id):
        session = self.items.get(session_id)
        if session is None or session.expires <= time.time():
            raise HTTPException(404, 'Session ended or expired')
        return session

    def persist(self, session):
        # Atomic replacement: metadata and binary state never contain native paths.
        for suffix, data in [('json', json.dumps({'id': session.id, 'metadata': session.metadata,
                   'tokens': session.tokens, 'expires': session.expires}).encode()), ('yjs', session.doc.get_update())]:
            target = self.directory / f'{session.id}.{suffix}'
            temp = target.with_suffix('.tmp')
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, target)


def install_routes(app, sessions: Sessions):
    @app.post('/discribe/api/sessions')
    async def create(request: Request):
        body = await request.body()
        if len(body) > 4096:
            raise HTTPException(413, 'Metadata too large')
        try:
            metadata = json.loads(body)
            if not isinstance(metadata, dict):
                raise ValueError()
        except ValueError:
            raise HTTPException(400, 'Invalid metadata')
        session = sessions.create(metadata)
        return {'id': session.id, 'tokens': session.tokens, **session.metadata}

    @app.delete('/discribe/api/sessions/{session_id}')
    async def end(session_id: str, request: Request):
        session = sessions.get(session_id)
        if not secrets.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + session.tokens['host']):
            raise HTTPException(403, 'Only the host can end this session')
        sessions.items.pop(session_id)
        for peer in list(session.peers):
            with contextlib.suppress(Exception):
                await peer.close(code=4001, reason='The host ended the session')
        for suffix in ('json', 'yjs'):
            (sessions.directory / f'{session.id}.{suffix}').unlink(missing_ok=True)
        return {'ended': True}

    async def presence(session):
        payload = {'type': 'presence', 'participants': list(session.peers.values())}
        for peer in list(session.peers):
            with contextlib.suppress(Exception):
                await peer.send_json(payload)

    @app.websocket('/discribe/ws/{session_id}')
    async def websocket(ws: WebSocket, session_id: str):
        await ws.accept()
        session = None
        try:
            try:
                session = sessions.get(session_id)
            except HTTPException:
                await ws.close(4004, 'Session ended or expired')
                return
            auth_raw = await asyncio.wait_for(ws.receive_text(), 10)
            if len(auth_raw) > 1024:
                raise ValueError('Invalid authentication')
            auth = json.loads(auth_raw)
            role = next((role for role, token in session.tokens.items()
                         if secrets.compare_digest(str(auth.get('token', '')), token)), None)
            if role is None:
                await ws.close(4003, 'Invalid invitation')
                return
            if len(session.peers) >= 32:
                await ws.close(4008, 'Session full')
                return
            participant = {'id': secrets.token_hex(8), 'name': str(auth.get('name', 'Anonymous'))[:80], 'role': role}
            # Lock admission against concurrent updates so no update precedes the snapshot.
            async with session.lock:
                await ws.send_json({'type': 'ready', 'role': role, **session.metadata})
                await ws.send_bytes(b'\x00' + session.doc.get_update())
                session.peers[ws] = participant
            await presence(session)
            window, count = time.monotonic(), 0
            while True:
                message = await ws.receive_bytes()
                if time.monotonic() - window > 1:
                    window, count = time.monotonic(), 0
                count += 1
                if count > 240 or not message or len(message) > MAX_MESSAGE:
                    await ws.close(4009, 'Message limit exceeded')
                    break
                tag, update = message[0], message[1:]
                if tag not in (1, 2):
                    raise ValueError('Unknown protocol message')
                if tag == 1 and role == 'viewer':
                    await ws.close(4003, 'Viewers cannot edit')
                    break
                if tag == 2 and len(update) > 16384:
                    raise ValueError('Presence too large')
                async with session.lock:
                    if tag == 1:
                        # Validate and enforce size limits before touching canonical state.
                        candidate = YDoc()
                        candidate.apply_update(session.doc.get_update())
                        candidate.apply_update(update)
                        if len(candidate.get_update()) > MAX_STATE:
                            raise ValueError('Shared document too large')
                        session.doc = candidate
                        sessions.persist(session)
                    for peer in list(session.peers):
                        if peer != ws:
                            with contextlib.suppress(Exception):
                                await peer.send_bytes(message)
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception:
            with contextlib.suppress(Exception):
                await ws.close(4002, 'Malformed collaboration message')
        finally:
            if session and ws in session.peers:
                session.peers.pop(ws, None)
                await presence(session)


def create_host(assets: Path, data: Path, bind='127.0.0.1', port=8080):
    from nitrogen import require
    host = require('be').Host(port=port, host=bind, admin_panel=False, bans_file=None)
    host.app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['POST', 'DELETE'],
                            allow_headers=['Content-Type', 'Authorization'])
    install_routes(host.app, Sessions(data))
    host.app.mount('/editor', StaticFiles(directory=assets, html=True), name='discribe-editor')
    from .shell import create_page
    host.page = create_page('/editor/')
    return host
