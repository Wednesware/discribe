[![Wednesware](https://github.com/Wednesware/Nitrogen/raw/main/wednesware.png)](https://wednesware.org)

# Discribe

**Two ways to write. One place to create.**

Discribe brings Monaco code editing and BlockNote writing into a local-first,
Fluorine-generated workspace. Python manages native documents, Sulfur provides
the desktop window, and an optional Beryllium host transports Yjs collaboration.
React is confined to the BlockNote editor container. No Vite server is involved.

## Installation

> `h2 get discribe`

Or just use the browser version [here](https://discribe.wednesware.org)

## Get started

Requires Python 3.12+, Node.js 22+, and the supplied Nitrogen installation.

```sh
python -m venv .venv
. .venv/bin/activate
pip install -e '.[desktop,collaboration]'
npm ci
npm run build
```

On Windows, activate with `.venv\Scripts\activate`. `npm run build` uses the
Unix virtualenv path; on Windows run `npm run bundle` then `python -m discribe build`.
Wednesware publications are imported using Nitrogen's documented
`require('f')`, `require('s')`, and `require('be')` APIs. Cache them once online;
subsequent builds and launches reuse the local cache. Integration was verified
against Fluorine 26.7, Sulfur 26.9, and Beryllium's current WebSocket Host API.

```sh
# Native desktop application
python -m discribe desktop

# Open files directly (quotes handle spaces; multiple files open as tabs)
discribe ./notes.md "./my project/main.py"
# Equivalent: python -m discribe desktop ./notes.md

# Browser edition: a static server, no application backend needed
python -m discribe web --port 8080

# Build a deployable static site
python -m discribe build --output dist

# Optional collaboration host
python -m discribe host --port 8080
# Open http://127.0.0.1:8080/editor/
```

`dist/` can be served by any static host. Browser documents live in IndexedDB
and remain independent of Python and collaboration servers. A service worker
caches the complete build, including both editors, workers, and bundled fonts.
Wait for the initial cache installation before going offline. Offline caching
requires HTTPS or localhost. Desktop assets are bundled locally.

For LAN collaboration, use `--bind 0.0.0.0` and a reachable host address in the
collaboration panel. Use an HTTPS reverse proxy for remote deployment. Browser
mixed-content restrictions prevent an HTTPS editor from joining an HTTP host.

## GitHub Pages

The browser edition is published at https://discribe.wednesware.org/
(GitHub Pages URL: https://wednesware.github.io/discribe/).
The `Deploy Discribe to GitHub Pages` workflow builds and checks the static site,
then deploys `dist/` using GitHub's official Pages artifact/deployment actions.
It runs on pushes to `main`, release tags named `pages-*`, or a manual run from
Actions once the workflow is on the default branch. Tagged builds allow publishing
the current implementation before its pull request is merged.

For a fork, go to **Settings → Pages → Build and deployment → Source** and choose
**GitHub Actions**. In **Settings → Environments → github-pages**, allow deployments
from `main` and tags matching `pages-*` if deployment branch/tag restrictions are
configured. Merge this workflow to your default branch, then use **Actions → Deploy
Discribe to GitHub Pages → Run workflow** for the first deployment. The deployment
job reports your site's URL; a project site normally uses `/<repository-name>/`.

Assets, editor workers, branding, and the service worker use relative URLs.
`npm run test:pages` verifies the built app at `/discribe/`, including both editors,
local persistence, and offline reload. Pages hosts the browser editor; documents
stay in your browser. Collaboration requires a separate HTTPS Beryllium host,
and native file dialogs remain part of the desktop edition.

## Your workspace

- Write formatted documents with headings, lists, checklists, quotes, tables,
  code blocks, links, images, and slash commands. Drag blocks using their handles.
- Code with syntax highlighting, completion, folding, multiple cursors, find and
  replace, configurable indentation, word wrap, and Monaco's command palette.
- Create workspaces, search documents, switch recent files, reorder tabs, rename,
  duplicate, move, import, export, and delete documents.
- Change writing width and typography, code fonts and minimap, autosave,
  animations, reduced motion, and collaboration display name in Settings.
- All fonts and editor dependencies ship in the generated assets; no CDN is used.

Code/Write switches the current file between Monaco source editing and BlockNote
writing without opening a different tab. Markdown files display headings, lists,
and formatting in Write, and their Markdown source in Code. Other text/code files
use literal paragraphs in Write, preserving code and whitespace on unedited
switches. Each editor keeps its undo history while its content is unchanged.

New document creates a blank file in the current editor without a mode prompt.
Use **Open file…** in the sidebar or Ctrl/Cmd+O to open an existing file.
New Write documents default to `.md` and save/export Markdown. Structured blocks
and view snapshots also persist in the local workspace. Existing `.discribe`
documents remain supported and can be edited as Markdown source in Code mode.
BlockNote's Markdown conversion is not lossless for every rich-text feature:
merely switching views preserves the original exactly; edits through a converted
view can simplify formatting. Discribe keeps an original version and offers
**Document actions → Export original version** when such edits occur. Use
`.discribe` exports when you need the full structured rich-text representation.

Preferences have separate Code and Write theme selectors, each grouped into
**Dark themes**, **Mixed themes**, and **Light themes**. Code defaults to dark Graphite. Write defaults
to a darker, colorful Grey blue; Nebula and Aurora offer purple and teal alternatives.
Mixed themes offer mid-tone grey and colored surfaces: Pewter, Denim, Moss, Clay,
and Lavender. Mist and Sage remain available as light choices for either mode. Themes include
quiet, static ambient circles behind the editing surface; patterns never intercept
input and respect reduced motion.

Attachments up to 5 MiB are embedded as persistent data URLs. Documents are limited
to 20 MiB. Export copies regularly if you clear browser data. Native workspace
storage defaults to `$XDG_DATA_HOME/discribe` or `~/.local/share/discribe`; override
it with `--data DIRECTORY`. Native file writes require a user-selected path,
use atomic replacement, and detect files modified by other applications.

Autosave is debounced. Interrupted unsaved changes are recovered into separate
copies on restart. Revision checks reject overwrites from another window.
Deleting a workspace document leaves an exported/native file on disk.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+S | Save; in desktop, also save to a selected native file |
| Ctrl/Cmd+Shift+S | Save As / export |
| Ctrl/Cmd+N | New document in the current environment |
| Ctrl/Cmd+O | Open file |
| Ctrl/Cmd+W | Close tab, prompting for unsaved changes |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl/Cmd+F | Editor find / browser text find |
| Ctrl/Cmd+K | Search workspace documents |
| Ctrl/Cmd+, | Settings |

Browsers may reserve some shortcuts. Every action also has an interface control.

## Collaboration

Start `discribe host`, open its `/editor/` page, and choose **Collaborate**.
The host creates separate editor and viewer invitations. Only the owner token
can end a session. Invitation tokens are capability secrets; distribute the
appropriate invitation to trusted participants. Invitations carry tokens in
URL fragments; clients authenticate in their first WebSocket message.

Code uses `Y.Text` and `y-monaco`; Write uses BlockNote's shared Yjs XML fragment.
Binary updates are merged server-side with `pycrdt` and persisted atomically.
Presence and remote selections use Yjs awareness. Reconnect synchronization and
browser Yjs persistence preserve edits across temporary disconnections.
Leaving a session retains a local copy. Reloaded documents open locally; rejoin
with an invitation to resume synchronization.

Sessions expire after seven days. The host caps sessions and participants at
32, updates at 1 MiB, shared state at 20 MiB, and awareness at 16 KiB. Viewer
writes, malformed updates, invalid tokens, and unauthorized session termination
are rejected server-side. Session metadata omits filesystem paths. Shared code
is never executed. Session persistence contains access tokens and should remain
private to the host. Hosting is intended for trusted groups; it does not include
an account system, per-user invitation revocation, or an Internet abuse gateway.

## Development and validation

```sh
pip install -e '.[test]'
npm run typecheck
python -m pytest tests/test_core.py tests/test_collaboration.py -q
npm run build
npx playwright install chromium
npm test

# Linux desktop integration (requires desktop extras and Xvfb)
xvfb-run -a .venv/bin/python tests/desktop_smoke.py
```

See [the architecture and integration notes](docs/ARCHITECTURE.md) for module
boundaries and the collaboration protocol. The original product brief remains
in [DISCRIBE_INFO.md](DISCRIBE_INFO.md).

Language-server-backed Python/SQL/etc. analysis, account management, filesystem
folder trees, large binary assets, and signed desktop installers are outside this
release. Monaco provides its bundled language services; Discribe does not claim
full language-server support. Touch layouts are exercised in Chromium; physical
mobile keyboards, screen readers, Windows, and macOS still need platform QA.

## License

[MIT](LICENSE.md).
