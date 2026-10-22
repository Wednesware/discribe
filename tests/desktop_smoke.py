"""Real Sulfur/Qt bridge smoke test: run with xvfb-run on Linux."""
import json
import sys
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from nitrogen import require
from discribe.desktop import DesktopBridge
from discribe.shell import build


with TemporaryDirectory(prefix='discribe-desktop-') as temporary:
    directory = Path(temporary)
    index = build(directory / 'site')
    index.write_text(index.read_text().replace('</head>', '<meta name="discribe-desktop" content="true"></head>', 1))
    bridge = DesktopBridge(directory / 'data')
    errors = []
    app = require('s').App(str(index), callbacks=bridge.callbacks(), name='Discribe smoke test',
                          serve_local=True, width=1200, height=850)

    def check():
        try:
            for _ in range(120):
                time.sleep(.25)
                if app.window.evaluate_js('Boolean(document.querySelector(".bn-editor"))'):
                    break
            else:
                raise AssertionError('BlockNote failed to mount in Sulfur')
            assert len(bridge.store.list()) == 2, 'Frontend did not use native storage'
            app.window.evaluate_js('document.querySelector("[data-action=mode-code]").click()')
            app.window.evaluate_js("""document.querySelector('[aria-label="Open hello.py"]').click()""")
            for _ in range(80):
                time.sleep(.25)
                if app.window.evaluate_js('Boolean(document.querySelector(".monaco-editor"))'):
                    break
            else:
                raise AssertionError('Monaco failed to mount in Sulfur')
            assert not app.window.evaluate_js('Boolean(document.querySelector("#notifications .error"))'), 'Frontend reported an error'
            print('Sulfur smoke passed: real Qt window, native bridge, SQLite documents, BlockNote, Monaco.', flush=True)
        except Exception as error:
            errors.append(error)
            print(f'DESKTOP SMOKE FAILED: {error}', file=sys.stderr, flush=True)
        finally:
            app.close()

    app.window.events.loaded += lambda: threading.Thread(target=check, daemon=True).start()
    app.open()
    if errors:
        raise SystemExit(1)
