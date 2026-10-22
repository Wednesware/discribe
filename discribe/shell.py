"""Reusable application components authored with Fluorine's Element API."""
from pathlib import Path
from nitrogen import require


def create_page(asset_prefix="./"):
    fluorine = require("f")
    E = fluorine.Element
    page = fluorine.Page("Discribe")

    def button(text, action, *, label=None, cls="", **attrs):
        return E("button", text, type="button", data_action=action,
                 aria_label=label or text, title=label or text, class_=cls, **attrs)

    def icon(text, action, label):
        return button(text, action, label=label, cls="icon-button")

    def toolbar():
        return E("header",
            E("div", icon("☰", "sidebar", "Toggle sidebar"),
              E("a", E("img", src=asset_prefix + "branding/discribe-white.png", alt="", class_="brand-logo brand-logo-white"),
                E("img", src=asset_prefix + "branding/discribe-black.png", alt="", class_="brand-logo brand-logo-black"),
                href="#", class_="brand", aria_label="Discribe"),
              E("span", "YOUR SPACE TO CREATE", class_="brand-caption"), class_="brand-group"),
            E("div", E("span", class_="mode-pill"),
              button("⌘  Code", "mode-code", cls="mode-button", aria_pressed="false"),
              button("✎  Write", "mode-write", cls="mode-button", aria_pressed="true"),
              class_="mode-switch", role="group", aria_label="Editor mode"),
            E("div", E("span", "All changes saved", id="save-state", role="status"),
              button("↗  Collaborate", "collaborate", cls="collaborate-button"),
              icon("⚙", "settings", "Settings"), class_="toolbar-end"), class_="toolbar")

    def sidebar():
        return E("aside",
            E("div", E("span", "WORKSPACE", class_="eyebrow"),
              E("div", E("span", "P", class_="workspace-avatar"),
                E("select", E("option", "Personal"), id="workspace-select", aria_label="Workspace"),
                icon("+", "workspace-new", "New workspace"), class_="workspace-picker"), class_="workspace-header"),
            E("label", E("span", "⌕"), E("input", id="document-search", placeholder="Find a document…", aria_label="Find a document"),
              E("kbd", "⌘ K"), class_="search-field"),
            E("nav", button("▤  All documents", "all-documents", cls="nav-item active"),
              button("◷  Recent", "recent", cls="nav-item"),
              button("Open file…", "open", cls="nav-item"), aria_label="Document navigation"),
            E("div", E("span", "DOCUMENTS", class_="eyebrow"), icon("+", "new", "New document"), class_="section-label"),
            E("div", id="document-list", class_="document-list"),
            button("+  New document", "new", cls="new-document"),
            E("div", E("span", "◉", class_="local-dot"), E("div", E("strong", "Made for your ideas"), E("small", "Local first. Yours, always.")), class_="local-note"),
            E("div", E("span", "WEDNESWARE", class_="eyebrow"), E("span", "v0.1", class_="muted"), class_="sidebar-footer"),
            id="sidebar", class_="sidebar", aria_label="Documents and workspaces")

    def editor_area():
        return E("main", E("div", id="tabs", role="tablist", aria_label="Open documents", class_="tabs"),
            E("div", E("div", E("span", "Personal", id="breadcrumb-workspace"), E("span", "/", class_="muted"),
              E("span", "Welcome to your space", id="breadcrumb-name"), class_="breadcrumbs"),
              E("div", icon("↶", "undo", "Undo"), icon("↷", "redo", "Redo"), E("span", class_="toolbar-divider"),
                icon("⌕", "find", "Find"), icon("⇩", "export", "Export document"),
                icon("⋯", "document-menu", "Document actions"), class_="editor-actions"), class_="document-toolbar"),
            E("div", E("div", E("div", E("span", "YOUR NEXT GREAT IDEA STARTS HERE", class_="eyebrow"),
                E("h1", "Welcome to your space", id="document-title"),
                E("div", E("span", "✎  WRITING", id="document-kind"), E("span", "•"), E("span", "Saved locally", id="document-date"), class_="document-meta"),
                class_="document-heading", id="document-heading"),
              E("div", id="write-editor", class_="write-editor"), class_="writing-page", id="writing-page"),
              E("div", id="code-editor", class_="code-editor", hidden=True),
              E("div", "Loading your workspace…", id="editor-loading", role="status"),
              id="editor-stage", class_="editor-stage"),
            E("footer", E("div", E("span", "◉", class_="local-dot"), E("span", "Local workspace", id="connection-state")),
              E("div", E("span", id="selection-status"),
                E("select", *[E("option", name, value=lang) for lang, name in [
                    ("plaintext", "Plain text"), ("python", "Python"), ("javascript", "JavaScript"),
                    ("typescript", "TypeScript"), ("html", "HTML"), ("css", "CSS"), ("json", "JSON"),
                    ("yaml", "YAML"), ("sql", "SQL"), ("markdown", "Markdown"), ("rust", "Rust"), ("go", "Go"), ("shell", "Shell")]],
                  id="language-select", aria_label="Code language", hidden=True),
                E("span", "UTF-8", id="encoding-status", hidden=True), E("span", "100%", class_="muted")), class_="status-bar"),
            class_="main-panel")

    page.head(E("meta", charset="utf-8"), E("meta", name="viewport", content="width=device-width, initial-scale=1"),
              E("meta", name="theme-color", content="#e9eff7"), E("title", "Discribe — Your space to create"),
              E("link", rel="icon", href=asset_prefix + "favicon.svg"),
              E("link", rel="stylesheet", href=asset_prefix + "assets/app.css"))
    page.style("[hidden]", display="none !important")
    page.body(toolbar(), E("div", sidebar(), editor_area(), class_="workspace-layout"),
              E("dialog", id="app-dialog", aria_label="Discribe dialog"),
              E("div", id="notifications", aria_live="polite"),
              E("input", type="file", id="file-input", hidden=True, multiple=True,
                accept=".txt,.py,.js,.ts,.tsx,.jsx,.html,.css,.json,.md,.markdown,.yaml,.yml,.sql,.toml,.xml,.sh,.rs,.go,.c,.cpp,.discribe"),
              E("script", src=asset_prefix + "assets/app.js", type="module"), data_mode="write")
    return page


def build(output: Path):
    import shutil
    assets = Path(__file__).parent / "web"
    if not (assets / "assets/app.js").exists():
        raise RuntimeError("Editor bundles are missing. Run npm ci && npm run bundle first.")
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'assets').exists():
        shutil.rmtree(output / 'assets')
    shutil.copytree(assets, output, dirs_exist_ok=True)
    create_page().build(str(output / "index.html"))
    # Version each offline cache using the complete build, including lazy chunks.
    import hashlib
    files = sorted(p for p in output.rglob("*") if p.is_file() and p.name != "sw.js")
    version = hashlib.sha256(b"".join(p.read_bytes() for p in files)).hexdigest()[:16]
    import json
    urls = ["./"] + ["./" + p.relative_to(output).as_posix() for p in files]
    worker = (assets / "sw-template.js").read_text().replace("__VERSION__", version).replace("__FILES__", json.dumps(urls))
    (output / "sw.js").write_text(worker)
    return output / "index.html"
