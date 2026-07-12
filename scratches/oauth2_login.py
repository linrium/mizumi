#!/usr/bin/env python3
"""OAuth2 authorization-code flow for the CLI (mirrors Oauth2CliExchange.java)."""

import base64
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
from configparser import RawConfigParser
from http.server import BaseHTTPRequestHandler, HTTPServer


def load_server_properties(path: str = "./server.properties") -> dict:
    # RawConfigParser can parse Java .properties files if we add a dummy section header.
    content = "[default]\n" + open(path).read()
    parser = RawConfigParser()
    parser.read_string(content)
    return dict(parser["default"])


def find_available_port(props: dict) -> int:
    port_str = props.get("server.redirect-port", "").strip()
    if port_str:
        return int(port_str)
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


class _AuthCallbackHandler(BaseHTTPRequestHandler):
    """Handles the single OAuth redirect and captures the `code` parameter."""

    auth_code: str | None = None
    _event = threading.Event()

    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (params.get("code") or [""])[0]

        body = b"User validated with identity provider."
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

        _AuthCallbackHandler.auth_code = code
        _AuthCallbackHandler._event.set()

    def log_message(self, *_):  # silence access logs
        pass


def _open_browser(url: str) -> None:
    """Try to open the URL in the default browser (best-effort)."""
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["/usr/bin/open", url])
        elif sys.platform.startswith("linux"):
            subprocess.Popen(["xdg-open", url])
        elif sys.platform == "win32":
            os.startfile(url)  # type: ignore[attr-defined]
    except Exception:
        pass  # user will open manually


def authenticate(props_path: str = "./server.properties") -> str | None:
    props = load_server_properties(props_path)

    authorization_url = props["server.authorization-url"]
    token_url = props["server.token-url"]
    client_id = props["server.client-id"]
    client_secret = props["server.client-secret"]

    port = find_available_port(props)
    redirect_uri = f"http://localhost:{port}"

    # Reset handler state for this run.
    _AuthCallbackHandler.auth_code = None
    _AuthCallbackHandler._event.clear()

    server = HTTPServer(("", port), _AuthCallbackHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Listening on port: {port}")

    state = secrets.token_hex(16)
    auth_params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "state": state,
    })
    auth_url = f"{authorization_url}?{auth_params}"

    print("Attempting to open the authorization page in your default browser.")
    print("If the browser does not open, you can manually open the following URL:")
    print()
    print(auth_url)
    print()

    _open_browser(auth_url)

    # Block until the callback arrives.
    _AuthCallbackHandler._event.wait()
    auth_code = _AuthCallbackHandler.auth_code

    server.shutdown()

    if not auth_code:
        print("No authorization code received.", file=sys.stderr)
        return None

    print("Received authentication response.")

    # Exchange auth code for tokens.
    token_body = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": auth_code,
        "redirect_uri": redirect_uri,
    }).encode()

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        token_url,
        data=token_body,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {credentials}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            token_response = json.loads(resp.read())
            print("Received token response.")
            return token_response.get("id_token")
    except urllib.request.HTTPError as e:
        error_body = e.read().decode()
        print(f"Token exchange failed ({e.code}): {error_body}", file=sys.stderr)
        return None


if __name__ == "__main__":
    props_path = sys.argv[1] if len(sys.argv) > 1 else "./server.properties"
    token = authenticate(props_path)
    if token:
        print(f"\nid_token: {token}")
    else:
        sys.exit(1)
