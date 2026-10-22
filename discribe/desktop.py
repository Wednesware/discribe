"""Native operations exposed exclusively to the trusted, bundled Sulfur page."""
import json
from dataclasses import asdict
from pathlib import Path

from .core import Document, DocumentStore, atomic_write, digest, read_document


class DesktopBridge:
    def __init__(self, directory: Path):
        self.store = DocumentStore(directory)
        # Only native user selections authorize paths, never JavaScript arguments.
        self.files: dict[str, tuple[Path, str | None]] = {}

    @staticmethod
    def dialog(save=False, name="Untitled.txt"):
        import webview
        window = webview.active_window()
        result = window.create_file_dialog(webview.FileDialog.SAVE if save else webview.FileDialog.OPEN,
                                           save_filename=name, allow_multiple=False)
        return Path(result[0] if isinstance(result, (tuple, list)) else result) if result else None

    def open_file(self):
        path = self.dialog()
        if path is None:
            return None
        doc = read_document(path)
        self.files[doc.id] = (path, digest(path))
        return asdict(doc)

    def write_file(self, value, save_as=False):
        doc = Document.parse(value)
        known = self.files.get(doc.id)
        path = self.dialog(True, doc.name) if save_as or known is None else known[0]
        if path is None:
            return None
        expected = digest(path) if save_as or known is None else known[1]
        text = json.dumps(asdict(doc), ensure_ascii=False, indent=2) if doc.kind == "write" else doc.content
        if doc.kind == "write" and path.suffix.lower() in (".md", ".markdown"):
            if doc.markdown is None:
                raise ValueError("Markdown source is unavailable; save as .discribe to preserve the document")
            text = doc.markdown
        atomic_write(path, text, expected)
        self.files[doc.id] = (path, digest(path))
        return {"name": path.name, "filePath": str(path)}

    def callbacks(self):
        return {"list_documents": self.store.list, "save_document": self.store.save,
                "delete_document": self.store.delete, "settings": self.store.settings,
                "open_file": self.open_file, "write_file": self.write_file}
