import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Discribe — Two ways to write. One place to create.")
    parser.add_argument("targets", nargs="*", metavar="COMMAND_OR_FILE",
                        help="Optional build/web/desktop/host command, or files to open in desktop mode")
    parser.add_argument("--output", type=Path, default=Path("dist"))
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--data", type=Path, default=Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "discribe")
    args = parser.parse_intermixed_args(argv)
    commands = {"build", "web", "desktop", "host"}
    args.command = args.targets.pop(0) if args.targets and args.targets[0] in commands else "desktop"
    if args.targets and args.command != "desktop":
        parser.error("File arguments are supported only in desktop mode")
    args.files = [Path(value).expanduser().resolve() for value in args.targets]
    for file in args.files:
        if not file.is_file():
            parser.error(f"File does not exist or is not a regular file: {file}")
    return args


def main():
    args = parse_args()
    from .shell import build
    path = build(args.output.resolve())
    if args.command == "build":
        print(path)
    elif args.command == "web":
        print(f"Discribe: http://{args.bind}:{args.port} (Ctrl+C to stop)", flush=True)
        server = ThreadingHTTPServer((args.bind, args.port), partial(SimpleHTTPRequestHandler, directory=str(path.parent)))
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    elif args.command == "desktop":
        from nitrogen import require
        from .desktop import DesktopBridge
        try:
            bridge = DesktopBridge(args.data, startup_files=args.files)
        except (OSError, ValueError) as error:
            raise SystemExit(f"Cannot open file: {error}") from error
        path.write_text(path.read_text().replace('</head>', '<meta name="discribe-desktop" content="true"></head>', 1))
        require("s").App(str(path), callbacks=bridge.callbacks(), name="Discribe", width=1440, height=940,
                         min_size=(640, 480), serve_local=True, confirm_close=True).open()
    else:
        from .collaboration import create_host
        host = create_host(path.parent, args.data / "sessions", args.bind, args.port)
        print(f"Discribe collaboration host: http://{args.bind}:{args.port}/editor/", flush=True)
        host.run(admin=False, sulfur=False)


if __name__ == "__main__":
    main()
