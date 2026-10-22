"""Portable document model and crash-safe native persistence.

No frontend, Nitrogen, or GUI imports belong in this module.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

MAX_FILE_BYTES = 20 * 1024 * 1024
LANGUAGES = {"py": "python", "js": "javascript", "mjs": "javascript", "ts": "typescript",
             "tsx": "typescript", "html": "html", "css": "css", "json": "json", "yaml": "yaml",
             "yml": "yaml", "sql": "sql", "md": "markdown", "sh": "shell", "rs": "rust",
             "go": "go", "c": "c", "cpp": "cpp", "xml": "xml", "toml": "ini"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def language_for(name: str) -> str:
    return LANGUAGES.get(Path(name).suffix.lstrip(".").lower(), "plaintext")


@dataclass
class Document:
    name: str = "Untitled.txt"
    kind: str = "code"
    content: str | list = ""
    id: str = field(default_factory=lambda: str(uuid4()))
    preferredEditor: str = "code"
    contentFormat: str = "text"
    language: str = "plaintext"
    workspace: str = "Personal"
    createdAt: str = field(default_factory=now)
    modifiedAt: str = field(default_factory=now)
    revision: int = 0
    filePath: str | None = None
    collaboration: dict | None = None

    @classmethod
    def parse(cls, value: dict) -> Document:
        doc = cls(**{k: v for k, v in value.items() if k in cls.__dataclass_fields__})
        if doc.kind not in {"code", "write"}:
            raise ValueError("Unknown document type")
        if not isinstance(doc.name, str) or not doc.name.strip() or len(doc.name) > 255:
            raise ValueError("Document name must contain 1–255 characters")
        if doc.kind == "code" and not isinstance(doc.content, str):
            raise ValueError("Code content must be text")
        if doc.kind == "write" and not isinstance(doc.content, list):
            raise ValueError("Write content must be a BlockNote array")
        if len(json.dumps(asdict(doc)).encode()) > MAX_FILE_BYTES:
            raise ValueError("Document exceeds 20 MiB")
        return doc


class ConflictError(ValueError):
    """The saved document or file changed since it was opened."""


class DocumentStore:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.database = directory / "workspace.sqlite3"
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, revision INTEGER, data TEXT)")
            db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT)")

    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.execute("PRAGMA journal_mode=WAL")
        return db

    def list(self) -> list[dict]:
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute("SELECT data FROM documents ORDER BY json_extract(data, '$.modifiedAt') DESC")]

    def save(self, value: dict) -> dict:
        doc = Document.parse(value)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision FROM documents WHERE id=?", (doc.id,)).fetchone()
            if row and row[0] != doc.revision:
                raise ConflictError("This document changed in another window. Save a duplicate to preserve both versions.")
            doc.revision += 1
            doc.modifiedAt = now()
            result = asdict(doc)
            db.execute("INSERT OR REPLACE INTO documents VALUES (?, ?, ?)", (doc.id, doc.revision, json.dumps(result)))
        return result

    def delete(self, doc_id: str, revision: int):
        with self.connect() as db:
            result = db.execute("DELETE FROM documents WHERE id=? AND revision=?", (doc_id, revision))
            if result.rowcount == 0:
                raise ConflictError("Document changed or was already deleted")

    def settings(self, value: dict | None = None) -> dict:
        with self.connect() as db:
            if value is not None:
                db.execute("INSERT OR REPLACE INTO settings VALUES ('app', ?)", (json.dumps(value),))
            row = db.execute("SELECT data FROM settings WHERE key='app'").fetchone()
            return json.loads(row[0]) if row else {}


def read_document(path: Path) -> Document:
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("File exceeds 20 MiB")
    source = path.read_text(encoding="utf-8-sig")
    if "\x00" in source:
        raise ValueError("Binary files cannot be opened as text")
    if path.suffix == ".discribe":
        doc = Document.parse(json.loads(source))
        doc.id, doc.revision = str(uuid4()), 0
    else:
        doc = Document(name=path.name, content=source, language=language_for(path.name))
    doc.filePath = str(path.resolve())
    return doc


def digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def atomic_write(path: Path, text: str, expected: str | None):
    if digest(path) != expected:
        raise ConflictError("The file changed on disk. Use Save As to preserve both versions.")
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".discribe-", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
