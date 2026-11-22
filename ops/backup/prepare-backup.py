#!/usr/bin/env python3
"""Run as root on VM, no secret output, preserves an existing encryption key."""
import os
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, unquote

os.umask(0o077)
directory=Path('/etc/ritmo-saude')
if not directory.is_dir():
    raise SystemExit('Protected maintenance directory missing.')
values={}
for line in (directory/'maintenance.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1)
        values[key.strip()]=value.strip().strip('"').strip("'")
parts=urlsplit(values['DATABASE_URL'])
if parts.scheme not in ('postgres','postgresql'):
    raise SystemExit('Expected PostgreSQL URL.')
settings={'PGHOST':parts.hostname,'PGPORT':str(parts.port or 5432),
          'PGDATABASE':unquote(parts.path.lstrip('/')), 'PGUSER':unquote(parts.username or ''),
          'PGPASSWORD':unquote(parts.password or ''), 'PGSSLMODE':'verify-full',
          'PGSSLROOTCERT':'/run/certs/supabase.crt','PGCONNECT_TIMEOUT':'15'}
if any(not value or '\n' in value or '\r' in value for value in settings.values()):
    raise SystemExit('Unexpected PostgreSQL connection fields.')
(directory/'backup.env').write_text(''.join(key+'='+value+'\n' for key,value in settings.items()))
(directory/'backup.env').chmod(0o600)
key=directory/'backup.key'
if not key.exists():
    volume = subprocess.run(['docker','volume','inspect','ritmo-saude-backups'],capture_output=True)
    if volume.returncode == 0:
        mount = Path(json.loads(volume.stdout)[0]['Mountpoint'])
        if any(mount.glob('ritmo-saude-*.tar.gz.aesgcm')):
            raise SystemExit('Existing encrypted copies require the original key. Refusing to replace a lost key.')
    descriptor=os.open(key,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o400)
    with os.fdopen(descriptor,'wb') as output:
        output.write(os.urandom(32))
if len(key.read_bytes())!=32:
    raise SystemExit('Existing backup key has unexpected size.')
key.chmod(0o400)
print('Dedicated DB credentials prepared with TLS verification; backup encryption key preserved/created; no values printed.')
