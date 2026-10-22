from dataclasses import asdict
import json

import pytest

from discribe.core import ConflictError, Document, DocumentStore, atomic_write, digest, language_for, read_document


def test_revisions_prevent_lost_updates_and_survive_restart(tmp_path):
    store = DocumentStore(tmp_path)
    first = store.save(asdict(Document(name="hello.py", language="python", content="print('hello')")))
    old = dict(first)
    first["content"] = "print('updated')"
    second = store.save(first)
    with pytest.raises(ConflictError):
        store.save(old)
    with pytest.raises(ConflictError):
        store.delete(first["id"], first["revision"])
    restored = DocumentStore(tmp_path).list()
    assert restored == [second]
    store.delete(second["id"], second["revision"])
    assert store.list() == []


def test_native_save_detects_external_modification(tmp_path):
    path = tmp_path / "file.txt"
    atomic_write(path, "first", None)
    expected = digest(path)
    path.write_text("another application")
    with pytest.raises(ConflictError):
        atomic_write(path, "our edit", expected)
    assert path.read_text() == "another application"
    atomic_write(path, "confirmed edit", digest(path))
    assert path.read_text() == "confirmed edit"


def test_import_formats_and_validation(tmp_path):
    path = tmp_path / "test.py"
    path.write_text("print('✓')")
    assert read_document(path).content == "print('✓')"
    assert read_document(path).language == "python"
    document = Document(name="notes.discribe", kind="write", content=[{"type": "paragraph", "content": "A note"}],
                        preferredEditor="write", contentFormat="blocknote")
    rich = tmp_path / document.name
    rich.write_text(json.dumps(asdict(document)))
    assert read_document(rich).content == document.content
    assert read_document(rich).id != document.id
    path.write_bytes(b"a\x00b")
    with pytest.raises(ValueError):
        read_document(path)
    with pytest.raises(ValueError):
        Document.parse({"kind": "write", "content": "invalid"})
    assert language_for("example.YAML") == "yaml"


def test_settings_persist_and_native_paths_require_dialog(tmp_path):
    from discribe.desktop import DesktopBridge
    bridge = DesktopBridge(tmp_path)
    bridge.store.settings({"autosave": False, "fontSize": 18})
    assert DocumentStore(tmp_path).settings()["fontSize"] == 18
    # A JavaScript-supplied filePath cannot authorize writing a local path.
    path = tmp_path / "protected.txt"
    path.write_text("keep me")
    bridge.dialog = lambda *args: None
    value = asdict(Document(filePath=str(path), content="overwrite"))
    assert bridge.write_file(value) is None
    assert path.read_text() == "keep me"


def test_native_markdown_save_and_view_backups_survive_restart(tmp_path):
    from discribe.desktop import DesktopBridge
    bridge = DesktopBridge(tmp_path / 'workspace')
    target = tmp_path / 'note.md'
    bridge.dialog = lambda *args: target
    doc = Document(name='note.md', kind='write', preferredEditor='write', contentFormat='blocknote',
                   content=[{'type': 'heading', 'props': {'level': 1}, 'content': 'A note'}],
                   markdown='# A note\n', viewBackup={'content': [{'type': 'paragraph', 'content': 'Original'}]},
                   sourceView={'text': '# A note\n', 'blocks': '[]'})
    saved = bridge.store.save(asdict(doc))
    bridge.write_file(saved)
    assert target.read_text() == '# A note\n'
    restored = DocumentStore(tmp_path / 'workspace').list()[0]
    assert restored['viewBackup'] == doc.viewBackup
    assert restored['sourceView'] == doc.sourceView
    assert read_document(target).content == '# A note\n'
