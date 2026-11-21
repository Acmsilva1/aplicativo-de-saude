import json
import os
import sys
import urllib.request

email = os.environ.get('BOOTSTRAP_ADMIN_EMAIL', '').strip()
password = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD', '')
if not email or not password:
    print('Configure BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD no ambiente.', file=sys.stderr)
    sys.exit(2)

req = urllib.request.Request(
    "http://127.0.0.1:5199/api/auth?resource=login",
    data=json.dumps({
        "email": email,
        "password": password,
    }).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as response:
        body = response.read().decode()
        print("status", response.status)
        print(body[:400])
except Exception as exc:
    code = getattr(exc, "code", None)
    print("status", code)
    if hasattr(exc, "read"):
        print(exc.read().decode()[:400])
    else:
        print("err", exc)
