import pytest

from discribe.__main__ import parse_args
from discribe.core import ConflictError
from discribe.desktop import DesktopBridge


def test_file_arguments_and_existing_commands(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    path = tmp_path / 'a note.md'
    path.write_text('# From terminal\n')
    for argv in ([str(path)], ['desktop', 'a note.md'], ['--data', str(tmp_path / 'data'), str(path)]):
        args = parse_args(argv)
        assert args.command == 'desktop'
        assert args.files == [path]
    assert parse_args([]).command == 'desktop'
    for command in ('build', 'web', 'host'):
        assert parse_args([command]).command == command
    with pytest.raises(SystemExit):
        parse_args(['missing.md'])
    with pytest.raises(SystemExit):
        parse_args(['web', str(path)])
    with pytest.raises(SystemExit):
        parse_args([str(tmp_path)])


def test_cli_files_open_once_and_save_to_authorized_path(tmp_path):
    path = tmp_path / 'a note.md'
    path.write_text('# From terminal\n')
    bridge = DesktopBridge(tmp_path / 'data', startup_files=[path, path])
    docs = bridge.startup_documents()
    assert len(docs) == 1
    assert bridge.startup_documents() == []
    doc = docs[0]
    assert doc['content'] == '# From terminal\n'
    assert doc['filePath'] == str(path)
    bridge.dialog = lambda *args: pytest.fail('CLI file should not require a save dialog')
    doc['content'] = '# Edited\n'
    bridge.write_file(doc)
    assert path.read_text() == '# Edited\n'
    path.write_text('External edit')
    with pytest.raises(ConflictError):
        bridge.write_file(doc)
