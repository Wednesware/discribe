# Discribe — Development Specification

**Developer:** Wednesware  
**Project:** Discribe  
**Type:** Hybrid text editor, code editor, and collaborative writing application  
**Architecture:** Python + Fluorine + Sulfur + Beryllium  
**Tagline:** Two ways to write. One place to create.

---

## 1. Project Overview

Discribe is a modern, feature-rich text editing application that combines two distinct editing experiences within a unified workspace.

- **Code Mode:** A powerful programming environment powered by Monaco Editor.
- **Write Mode:** An elegant, block-based rich-text environment powered by BlockNote.

The name Discribe combines *di-* (two) and *scribe* (write), reflecting the application's dual editing modes.

Discribe is built using Wednesware's existing software ecosystem:

- **Fluorine:** Generates and manages the application's web-based interface.
- **Sulfur:** Provides a desktop application environment.
- **Beryllium:** Enables optional collaborative editing sessions.
- **Python:** Handles application logic, documents, persistence, and session management.

Discribe should be usable independently as a desktop application or browser-based editor, with collaboration available when a Beryllium host is running.

The defining qualities of Discribe are visual polish, smooth animations, powerful editing capabilities, and flexible deployment.

## 2. Technology Stack

### Primary technologies

| Component | Technology |
|---|---|
| Core language | Python |
| UI framework | Fluorine |
| Browser scripting | JavaScript / TypeScript |
| Code editor | Monaco Editor |
| Rich-text editor | BlockNote |
| Desktop integration | Sulfur |
| Collaboration host | Beryllium |
| Real-time synchronization | Yjs |
| Monaco synchronization | y-monaco |
| Styling | CSS, animations, custom properties |
| Local storage | Filesystem / IndexedDB |
| Collaboration transport | WebSockets |

Use existing Wednesware libraries wherever practical.

Do not replace Fluorine with React or Vite as the application's primary framework.

However, BlockNote is React-based. A small isolated React integration is acceptable where necessary to embed BlockNote within a Fluorine-generated page. This should remain an implementation detail rather than becoming the application's primary architecture.

A JavaScript bundler may also be used for third-party editor dependencies.

## 3. Application Architecture

Discribe should be divided into five major subsystems.

### 3.1 Discribe Core

Python application logic responsible for:

- Document creation, loading, saving, and deletion
- Document metadata
- Workspace management
- File format detection
- Import/export
- Settings
- Local persistence
- Collaboration lifecycle
- Error handling

Keep core logic independent of the frontend wherever possible.

### 3.2 Fluorine Frontend

Fluorine provides the application's visual interface.

Responsibilities include:

- Rendering the application shell
- Navigation
- Toolbars
- Sidebar
- Tabs
- Settings
- Editor containers
- Theme management
- Animations
- Dialogs and notifications

Monaco and BlockNote should be embedded into dedicated frontend containers.

Provide a clean communication interface between JavaScript editors and the Python core.

### 3.3 Editor Engines

Discribe uses two independent editing engines.

**Monaco Editor**

Used for source code, configuration files, and raw text.

**BlockNote**

Used for rich-text documents, formatted notes, and Markdown-oriented writing.

Both editors should expose common operations through a Discribe editor adapter:

- Get content
- Set content
- Focus
- Undo/redo
- Determine dirty state
- Retrieve selection information
- Handle content changes
- Serialize document state
- Dispose resources

Editor-specific functionality should remain available rather than being restricted to the common interface.

### 3.4 Sulfur Desktop Integration

Sulfur provides the native application experience.

The desktop version should support:

- Native application windows
- Local filesystem access
- Opening and saving files
- Native file dialogs where supported
- Offline editing
- Application settings
- Optional collaboration hosting or joining

Keep Sulfur-specific functionality isolated so the browser version remains usable.

### 3.5 Beryllium Collaboration

Beryllium provides session hosting and communication between connected users.

Responsibilities include:

- Creating sessions
- Joining sessions
- Managing participants
- Document access
- Session permissions
- Network communication
- Connection lifecycle
- Presence information

Beryllium should act as the collaboration transport and session host, not as the text-merging algorithm.

Use Yjs for concurrent document synchronization.

## 4. Deployment Modes

Discribe should support three configurations.

### Web Mode

A browser-based editing environment rendered through Fluorine.

Features:

- Code and Write editing
- Browser-local document storage
- File import/export
- Autosave
- Themes and animations
- Optional connection to a Beryllium host

Web Mode should not require a Python server for ordinary local editing after the frontend has loaded.

If Fluorine's generated frontend depends on Python at runtime, implement a standalone browser-compatible build for this configuration.

### Desktop Mode

Discribe runs inside Sulfur.

Features:

- All editing features
- Native filesystem access
- Offline operation
- Local workspace management
- Optional collaboration

### Collaborative Mode

Discribe connects to a Beryllium session.

Features:

- Multiple participants
- Simultaneous editing
- Shared document state
- Participant presence
- Live cursors and selections where supported
- Automatic synchronization
- Connection recovery

Collaborative Mode is an optional capability available to both web and desktop clients.

## 5. Visual Identity

Discribe should feel like two carefully designed applications connected through one interface.

The visual distinction between Code and Write modes is a core product feature.

### 5.1 Code Mode — Dark and Technical

Code Mode should use:

- Near-black and charcoal backgrounds
- Muted violet and blue accents
- JetBrains Mono or similar monospace typography
- Crisp borders
- Subtle highlights
- Minimal visual distractions
- Professional syntax highlighting
- Compact, precise controls

Code Mode should feel focused, technical, and sophisticated.

### 5.2 Write Mode — Soft and Expressive

Write Mode should use:

- Soft desaturated blue backgrounds
- Blue-gray surfaces
- Gentle gradients
- Rounded containers
- Subtle glassmorphism
- Soft shadows
- Comfortable spacing
- Inter or Manrope typography
- Elegant document presentation

Write Mode should feel calm, creative, and comfortable.

### 5.3 Shared Interface

Both modes should maintain consistent:

- Navigation
- Document tabs
- Sidebar structure
- Window controls
- Settings
- Notifications
- Keyboard shortcuts

The overall appearance should remain recognizably Discribe despite the dramatic theme differences.

## 6. Signature Mode Transitions

Switching between Code and Write should be one of Discribe's most recognizable interactions.

Provide a prominent segmented switch in the toolbar.

### Transition Sequence

When switching modes:

1. The active mode indicator glides to its new position.
2. Background and surface colors transition.
3. Accent colors change.
4. Toolbar controls transform or crossfade.
5. Interface typography transitions between monospace and proportional fonts.
6. The outgoing editor fades away.
7. The incoming editor appears.
8. Ambient decorative effects adapt.

### Animation Timing

| Animation | Duration |
|---|---|
| Main theme transition | 450–600 ms |
| Editor crossfade | 200–350 ms |
| Toolbar transition | 200–300 ms |
| Hover interaction | 120–200 ms |
| Sidebar transition | 250–350 ms |

Use smooth easing curves and avoid unnecessary layout shifts.

Font-family changes should use crossfades or coordinated transitions because CSS cannot smoothly interpolate between arbitrary font families.

Keep the editor responsive during transitions.

Respect `prefers-reduced-motion`.

### Important Behavior

The mode switch must never silently convert incompatible document formats.

Code and Write are separate editing environments, not interchangeable representations of every file.

Switching environments should preserve the active document's content and unsaved state.

For Markdown, optionally provide both source and rich-text views, with explicit safeguards against lossy conversion.

## 7. Code Mode — Monaco

Implement Monaco Editor with as many native features as practical.

Required features:

- Syntax highlighting
- Language detection
- Language selection
- Line numbers
- Code folding
- Autocomplete
- Bracket matching
- Automatic indentation
- Multiple cursors
- Find and replace
- Undo/redo
- Word wrap
- Minimap toggle
- Font configuration
- Tab size configuration
- Command palette
- Keyboard shortcuts
- Custom themes

Support common languages including Python, JavaScript, TypeScript, HTML, CSS, JSON, YAML, SQL, and Markdown.

Advanced language intelligence may be implemented later through appropriate language servers or editor extensions.

Avoid claiming complete language-server support without actually providing it.

## 8. Write Mode — BlockNote

Implement BlockNote as the primary rich-text editing engine.

Required features:

- Headings
- Paragraphs
- Bold, italic, underline, and strikethrough
- Lists
- Checklists
- Quotes
- Code blocks
- Links
- Tables
- Dividers
- Slash commands
- Drag-and-drop blocks
- Undo/redo
- Markdown import/export
- Keyboard shortcuts
- Document word count

Support images and attachments where practical, with persistent asset storage.

Do not store temporary browser object URLs as permanent document references.

The editor should use a centered, comfortable writing layout with configurable width.

## 9. Document System

Discribe must support multiple documents and workspaces.

### Document Model

Each document should include:

- Unique identifier
- Name
- Document type
- Preferred editor
- Content format
- Serialized content
- Creation timestamp
- Modification timestamp
- File path, where applicable
- Collaboration metadata, where applicable

### Supported Document Types

**Code documents**

Store raw source text.

Examples:

- `.py`
- `.js`
- `.ts`
- `.html`
- `.css`
- `.json`
- `.txt`

**Write documents**

Store BlockNote's structured document representation.

Support Markdown import/export.

**Markdown documents**

Markdown may be opened in either Monaco or BlockNote.

Preserve the original source when switching between representations.

If conversion would discard unsupported features, warn the user or offer a separate converted copy.

Do not promise lossless bidirectional conversion of arbitrary Markdown.

### Document Operations

Implement:

- New document
- Open document
- Save document
- Save As
- Rename
- Duplicate
- Delete
- Import
- Export
- Recent documents
- Document search
- Multiple tabs

## 10. Local Persistence

Discribe should be local-first.

### Desktop

Use Python filesystem APIs for native file operations.

Support saving directly to user-selected paths.

### Browser

Use IndexedDB for local document persistence.

Support downloading and importing files.

Where supported, optionally integrate the File System Access API.

### Autosave

Implement debounced autosaving.

Requirements:

- Preserve changes during ordinary editing.
- Display save status.
- Handle storage failures.
- Prevent accidental overwrites.
- Warn before discarding unsaved changes.
- Recover from interrupted sessions where possible.

Keep temporary editor state separate from persistent document content.

## 11. Collaborative Editing

Collaborative editing is a major optional feature.

Use **Yjs** as the synchronization engine.

### Monaco Collaboration

Integrate `y-monaco` with a shared `Y.Text` document.

Support concurrent edits and remote selections where feasible.

### BlockNote Collaboration

Use BlockNote's Yjs collaboration capabilities.

Use a shared Yjs document appropriate to BlockNote's structured editing model.

### Beryllium Integration

Extend Beryllium with a WebSocket-based collaboration transport.

Beryllium should support:

- Session creation
- Session joining
- Session identifiers
- Participant registration
- Participant disconnection
- Binary Yjs update transmission
- Presence messages
- Session permissions
- Session cleanup

Existing Beryllium HTTP action endpoints may be used for session management.

Real-time editing should use persistent WebSocket connections rather than repeated HTTP requests.

### Session Permissions

Support at least:

- Host
- Editor
- Viewer

Hosts should control who may join and edit.

Session access must be validated server-side.

### Collaboration Safety

- Never execute shared code automatically.
- Validate participant permissions.
- Limit message sizes.
- Handle malformed messages.
- Prevent unauthorized session access.
- Avoid exposing local filesystem paths.
- Provide clear session disconnect controls.

### Synchronization

Use Yjs updates rather than broadcasting entire document contents after every keystroke.

Implement reconnect synchronization and document state recovery.

The host should persist collaborative document state when persistence is enabled.

Avoid silently discarding edits when connections fail.

### Scope

Initial collaboration should operate within one document type at a time.

Do not attempt to synchronize Monaco's plain-text representation directly with BlockNote's rich-text document structure.

## 12. Workspace Interface

### Main Toolbar

Include:

- Discribe branding
- Active document name
- Code / Write selector
- Save indicator
- Collaboration controls
- Settings button

### Sidebar

Include:

- Documents
- Workspaces
- Recent files
- Search
- Create document
- Document context menus

The sidebar should support animated collapsing.

### Tabs

Support:

- Multiple open documents
- Active tab highlighting
- Close buttons
- Unsaved indicators
- Drag-and-drop reordering where practical

### Status Bar

**Code Mode**

Show:

- Language
- Cursor position
- Indentation
- Encoding when meaningful

**Write Mode**

Show:

- Word count
- Character count
- Document status

**Collaborative Mode**

Additionally show:

- Connection status
- Participant count
- Session information

## 13. Collaboration Interface

Provide a collaboration panel accessible from the main toolbar.

### Host Session

Allow the user to:

- Create a session
- Select the document to share
- Configure permissions
- Copy an invitation link or connection information
- View participants
- End the session

### Join Session

Allow the user to:

- Enter an invitation link or session identifier
- Connect to a host
- View connection progress
- Open the shared document
- Leave the session

### Participant Presence

Display participant names and connection states.

Where supported, show collaborative cursors and selections.

Use distinct, readable participant colors.

Avoid excessive cursor animations.

## 14. Sulfur Integration

Discribe should be launchable as a Sulfur application.

Use Sulfur's supported application and frontend attachment APIs.

Avoid inventing or assuming undocumented Sulfur methods.

The desktop application should provide:

- A native window
- Fluorine-powered interface
- Monaco and BlockNote
- Python document management
- Native file handling
- Optional Beryllium hosting

Keep desktop-only functionality behind an abstraction layer.

The same frontend should be reusable in browser deployments.

## 15. Fluorine Integration

Fluorine should remain the primary interface framework.

Create reusable UI components for:

- Application shell
- Toolbar
- Mode switch
- Sidebar
- Tabs
- Editor containers
- Dialogs
- Settings
- Collaboration panel
- Notifications

Use Fluorine's supported Page, Style, and Script capabilities.

Implement the JavaScript bridge required for Monaco and BlockNote.

If BlockNote requires React, mount it within a dedicated frontend container without replacing the surrounding Fluorine application.

Do not assume that Fluorine natively understands React components.

Keep editor-specific JavaScript isolated and maintainable.

## 16. Settings

Provide settings for:

- Default editor mode
- Code font family
- Code font size
- Code tab size
- Code word wrap
- Monaco minimap
- Write document width
- Write typography
- Autosave
- Animation intensity
- Reduced motion
- Sidebar behavior
- Collaboration preferences

Persist settings locally.

## 17. Keyboard Shortcuts

Implement appropriate keyboard shortcuts.

| Shortcut | Action |
|---|---|
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+N | New document |
| Ctrl+O | Open document |
| Ctrl+W | Close tab |
| Ctrl+Tab | Next tab |
| Ctrl+Shift+Tab | Previous tab |
| Ctrl+F | Find |
| Ctrl+, | Settings |

Support platform-specific equivalents where appropriate.

Avoid conflicting with Monaco's and BlockNote's internal keyboard handling.

## 18. Responsive Design

Desktop is the primary target, but the browser version should remain usable on mobile and tablets.

Requirements:

- Responsive toolbar
- Collapsible sidebar
- Touch-friendly controls
- Adaptive dialogs
- No unnecessary horizontal overflow
- Functional text editing
- Accessible menus

Test both editor engines on touch devices.

## 19. Accessibility

Implement:

- Keyboard navigation
- Visible focus indicators
- Accessible labels
- Sufficient text contrast
- Reduced-motion support
- Semantic interface elements
- Screen-reader support where practical

Avoid excessive transparency that reduces text readability.

## 20. Performance

Discribe should remain responsive during editing.

Requirements:

- Lazy-load editor dependencies where practical.
- Avoid unnecessary editor initialization.
- Preserve editor state when switching tabs.
- Debounce storage writes.
- Dispose of unused resources.
- Minimize expensive blur effects.
- Keep animation work separate from editing operations.
- Avoid unnecessary Python–JavaScript communication.

Collaborative synchronization should be efficient and incremental.

## 21. Implementation Roadmap

### Phase 1 — Core and Interface

- Establish the Python project structure.
- Integrate Fluorine.
- Build the application shell.
- Implement the visual design system.
- Create the Code / Write mode switch.
- Implement basic navigation and tabs.

### Phase 2 — Editing Engines

- Integrate Monaco.
- Integrate BlockNote.
- Implement editor adapters.
- Implement native editor features.
- Implement mode-specific themes.

### Phase 3 — Documents

- Create the document model.
- Implement file operations.
- Implement browser storage.
- Implement desktop filesystem access.
- Add import/export.
- Add autosave and recovery.

### Phase 4 — Sulfur

- Integrate the application with Sulfur.
- Implement native file dialogs.
- Verify offline operation.
- Test desktop packaging.

### Phase 5 — Visual Polish

- Implement signature mode transitions.
- Add typography transitions.
- Add sidebar and tab animations.
- Polish dialogs and menus.
- Add microinteractions.
- Improve responsiveness.

### Phase 6 — Beryllium Collaboration

- Extend Beryllium with WebSocket support.
- Integrate Yjs.
- Add Monaco collaboration.
- Add BlockNote collaboration.
- Implement sessions and permissions.
- Add participant presence.
- Implement reconnect synchronization.
- Test simultaneous editing.

### Phase 7 — Testing and Release

- Test all editor features.
- Test document persistence.
- Test imports and exports.
- Test mode switching.
- Test desktop and browser builds.
- Test collaborative sessions.
- Fix critical bugs.
- Prepare release documentation.

## 22. Acceptance Criteria

Discribe's initial standalone release should meet the following requirements:

1. Code and Write modes are fully functional.
2. Monaco and BlockNote are properly integrated.
3. Fluorine provides the shared application interface.
4. Users can create, open, edit, save, and export documents.
5. Document data survives application restarts.
6. Mode transitions are smooth and visually polished.
7. Sulfur provides a functional desktop application.
8. Browser editing works without requiring an active collaboration host.
9. The application remains usable offline after required resources are available.
10. Editor switching never silently destroys content.

The subsequent collaborative release should additionally provide reliable simultaneous editing, permissions, session management, and recovery from temporary disconnections.

## 23. Implementation Instructions for Codex

Before implementation:

1. Inspect the existing Wednesware Fluorine, Sulfur, and Beryllium libraries.
2. Identify their actual APIs and supported integration mechanisms.
3. Reuse existing functionality instead of reimplementing it.
4. Do not invent methods or interfaces that do not exist.
5. Determine how third-party JavaScript editor libraries can be embedded within Fluorine.
6. Determine how Sulfur launches and manages Fluorine frontends.
7. Determine how Beryllium can be extended for persistent WebSocket connections.

Implement Discribe incrementally.

Keep the architecture modular and avoid coupling the application core to any specific editor engine or deployment environment.

Prefer actual working functionality over placeholder interfaces.

Do not add Blockly or visual programming features.

Do not replace the Wednesware-based architecture with an unrelated frontend framework.

**Final objective:** Build Discribe as a beautiful, powerful, local-first editor that combines professional code editing and elegant document writing, with native desktop support and optional real-time collaboration through the Wednesware ecosystem.