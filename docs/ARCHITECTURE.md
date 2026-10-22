# Architecture and integration notes

`discribe/core.py` defines the portable document model, language detection,
SQLite workspace store, revision conflicts, UTF-8 import, and atomic file writes.
It imports no editor or GUI libraries. Browser and native documents use the same
field names and formats. A saved revision is distinct from a dirty editor buffer.

`discribe/shell.py` generates the entire shared shell using Nitrogen-loaded
Fluorine `Page`, `Element`, and `Page.style`. Toolbar, sidebar, editor area, tabs,
settings host, dialog host, and notification host are Python-authored components.
`build()` combines the shell with compiled editor assets and generates a versioned
service worker. No Python callbacks are needed for static browser editing.

`frontend/app.ts` manages the client workspace and common commands. Each open
document has its own adapter and container; hiding a tab retains its undo stack.
Closing a tab disposes its editor. Monaco and BlockNote load on demand. React
mounts exclusively inside a Write adapter. Status updates avoid regenerating the
sidebar on each keystroke. Styling lives in `frontend/style.css`, with separate
mode palettes, coordinated transitions, responsive layouts, and reduced motion.

`frontend/storage.ts` uses IndexedDB transactions in a browser and registered
Sulfur callbacks in desktop mode. Saves check revisions before replacing a record.
The client serializes save requests and only clears dirty state if no newer edits
arrived during the save. Recovery buffers are separate from document records.
Recovery creates copies, preserving a version saved by a different window.

`discribe/desktop.py` exposes an explicit callback whitelist. The documented
Sulfur `App(file, callbacks=..., serve_local=True)` API hosts the generated page.
Native file dialogs use Sulfur's documented underlying pywebview window API.
JavaScript cannot authorize arbitrary filesystem paths; a path must come from a
native user selection. File hashes detect external changes before replacement.
Native workspace autosave is independent of explicit file saving.

`discribe/collaboration.py` extends the actual Beryllium `Host.app` FastAPI object
with isolated routes. It does not modify Beryllium's global client/group semantics
or expose the desktop bridge to network clients. The stock administration panel
is disabled. `/editor/` serves the same standalone build.

## Library references reviewed

- [Nitrogen require and package caching](https://github.com/Wednesware/Nitrogen/blob/main/README.md)
- [Fluorine Page, Element, styling, and callback contract](https://github.com/Wednesware/Fluorine/blob/main/README.md)
- [Sulfur App, explicit callbacks, and local serving](https://github.com/Wednesware/Sulfur/blob/main/README.md)
- [Beryllium Host and WebSocket API](https://github.com/Wednesware/Beryllium/blob/main/README.md)
- [BlockNote editor setup](https://www.blocknotejs.org/docs/getting-started/editor-setup)
- [BlockNote collaboration](https://www.blocknotejs.org/docs/features/collaboration)
- [Monaco API](https://microsoft.github.io/monaco-editor/docs.html)
- [y-monaco binding](https://github.com/yjs/y-monaco)
- [pywebview window and file-dialog APIs](https://pywebview.flowrl.com/api/)

Installed BlockNote 0.51 exposes the `collaboration` editor option directly; later
online documentation uses `withCollaboration`. The integration follows installed
TypeScript definitions. Monaco 0.57 changed package exports; the bundler resolves
y-monaco's older import to the same installed editor API. Its input adapter uses
the established textarea path for consistent Qt and browser behavior.

## Collaboration protocol

1. `POST /discribe/api/sessions` accepts only document name, kind, and language.
   It returns a random session ID and independent host/editor/viewer tokens.
2. Connect to `/discribe/ws/{session}`. The first text frame is JSON containing
   `token` and `name`, with a 10-second authentication deadline.
3. Server sends JSON `{type: 'ready', role, name, kind, language}` followed by
   a binary frame: byte `0` plus a complete Yjs update for the current state.
4. Editors merge the snapshot, then send their Yjs state for reconciliation.
   Subsequent byte `1` frames carry incremental binary Yjs updates. The server
   validates, merges with pycrdt, persists, and relays to other session peers.
5. Byte `2` frames carry Yjs awareness updates. Participant lists are separate
   JSON `{type: 'presence', participants}` messages containing names and roles.
6. `DELETE /discribe/api/sessions/{session}` requires the host bearer token and
   closes every connection. State and token files are deleted.

Code and Write never share the same Yjs root: code binds `getText('code')`;
writing binds `getXmlFragment('write')`. Document metadata never includes paths,
and session type is fixed. Credentials remain in provider memory, separate from
portable document exports. CRDT state is stored in a role-specific IndexedDB
store and on the host. Binary updates are never interpreted as executable code.
