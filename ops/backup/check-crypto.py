#!/usr/bin/env python3
"""Run on VM; verifies round-trip, tamper/truncation rejection, secret-file modes."""
import importlib.machinery
import importlib.util
from pathlib import Path
import tempfile
from cryptography.exceptions import InvalidTag

loader=importlib.machinery.SourceFileLoader('ritmo_backup','/usr/local/sbin/ritmo-saude-backup')
spec=importlib.util.spec_from_loader(loader.name,loader)
module=importlib.util.module_from_spec(spec)
loader.exec_module(module)
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary)
    module.KEY=root/'key'
    module.KEY.write_bytes(bytes(range(32)))
    source=root/'source';source.write_bytes(b'synthetic backup record\n'*200)
    encrypted=root/'sealed';module.seal(source,encrypted)
    decoded=root/'decoded';module.unseal(encrypted,decoded)
    assert source.read_bytes()==decoded.read_bytes()
    raw=bytearray(encrypted.read_bytes());raw[len(module.MAGIC)+15]^=1
    corrupted=root/'tampered';corrupted.write_bytes(raw)
    try: module.unseal(corrupted,root/'rejected')
    except InvalidTag: pass
    else: raise AssertionError('Tampered archive accepted')
    truncated=root/'truncated';truncated.write_bytes(encrypted.read_bytes()[:-3])
    try: module.unseal(truncated,root/'truncated-result')
    except (InvalidTag,RuntimeError): pass
    else: raise AssertionError('Truncated archive accepted')
assert Path('/etc/ritmo-saude/backup.key').stat().st_mode & 0o777 == 0o400
assert Path('/etc/ritmo-saude/backup.env').stat().st_mode & 0o777 == 0o600
print('PASS: AES-GCM round trip, tamper/truncation rejected, key 400 and connection file 600')
