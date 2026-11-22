#!/usr/bin/env python3
"""Root-only encrypted app backups; credentials never enter argv or reports."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from zoneinfo import ZoneInfo
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

APP = Path('/opt/ritmo-saude')
CONFIG = Path('/etc/ritmo-saude')
STATE = Path('/var/lib/ritmo-saude-backup')
VOLUME = 'ritmo-saude-backups'
IMAGE = 'postgres:18-alpine'
MAGIC = b'RITMO-AESGCM-1\n'
KEY = CONFIG / 'backup.key'
STATUS = STATE / 'status.json'
os.umask(0o077)

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=600, stderr=subprocess.PIPE, **kwargs)

def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)

def volume_path():
    run(['docker', 'volume', 'create', '--driver', 'local', '--label', 'app=ritmo-saude', VOLUME], stdout=subprocess.DEVNULL)
    data = json.loads(run(['docker', 'volume', 'inspect', VOLUME], stdout=subprocess.PIPE).stdout)[0]
    if data['Driver'] != 'local':
        raise RuntimeError('Backup requires a local volume')
    path = Path(data['Mountpoint']).resolve()
    path.chmod(0o700)
    return path

def seal(source, destination):
    nonce = os.urandom(12)
    cipher = Cipher(algorithms.AES(KEY.read_bytes()), modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(MAGIC)
    with source.open('rb') as src, destination.open('xb') as dst:
        dst.write(MAGIC + nonce)
        for chunk in iter(lambda: src.read(1024 * 1024), b''):
            dst.write(cipher.update(chunk))
        dst.write(cipher.finalize())
        dst.write(cipher.tag)
        dst.flush()
        os.fsync(dst.fileno())

def unseal(source, destination):
    size = source.stat().st_size
    with source.open('rb') as src:
        if src.read(len(MAGIC)) != MAGIC:
            raise RuntimeError('Unknown archive format')
        nonce = src.read(12)
        src.seek(-16, 2)
        tag = src.read(16)
        cipher = Cipher(algorithms.AES(KEY.read_bytes()), modes.GCM(nonce, tag)).decryptor()
        cipher.authenticate_additional_data(MAGIC)
        src.seek(len(MAGIC) + 12)
        remaining = size - len(MAGIC) - 12 - 16
        with destination.open('xb') as dst:
            while remaining:
                chunk = src.read(min(remaining, 1024 * 1024))
                if not chunk:
                    raise RuntimeError('Truncated archive')
                remaining -= len(chunk)
                dst.write(cipher.update(chunk))
            dst.write(cipher.finalize())

def backup(stage, destination):
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime('%Y%m%dT%H%M%SZ')
    dump = stage / 'database.dump'
    with dump.open('xb') as output:
        run(['docker', 'run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
             '--memory=128m', '--cpus=0.5', '--pids-limit=64', '--env-file', str(CONFIG / 'backup.env'),
             '--mount', f'type=bind,src={CONFIG / "supabase-ca.crt"},dst=/run/certs/supabase.crt,readonly',
             '--entrypoint', 'pg_dump', IMAGE, '--format=custom', '--no-owner', '--no-acl',
             '--schema=public', '--schema=auth', '--lock-wait-timeout=10s'], stdout=output)
    if dump.stat().st_size < 100:
        raise RuntimeError('Empty database dump')
    with dump.open('rb') as source:
        run(['docker', 'run', '--rm', '-i', '--network=none', '--entrypoint', 'pg_restore', IMAGE, '--list'], stdin=source, stdout=subprocess.DEVNULL)
    manifest = {'created_at': now.isoformat(), 'local_time': now.astimezone(ZoneInfo('America/Sao_Paulo')).isoformat(),
                'schemas': ['public', 'auth'], 'format': 'pg_dump custom + AES-256-GCM',
                'revision': (APP / '.deployed-revision').read_text().strip(),
                'retention_days': 30, 'includes_storage_objects': False}
    atomic_json(stage / 'manifest.json', manifest)
    archive = stage / 'snapshot.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for file, name in [(dump, 'database.dump'), (stage / 'manifest.json', 'manifest.json'),
                           (APP / '.env', 'config/runtime.env'), (CONFIG / 'maintenance.env', 'config/maintenance.env'),
                           (APP / 'docker-compose.yml', 'deploy/docker-compose.yml'), (APP / 'Dockerfile', 'deploy/Dockerfile')]:
            tar.add(file, arcname=name, recursive=False)
        tar.add(APP / 'supabase/migrations', arcname='deploy/migrations')
    final = destination / f'ritmo-saude-{stamp}.tar.gz.aesgcm'
    partial = final.with_suffix('.partial')
    try:
        seal(archive, partial)
        # Authentication must pass before declaring the encrypted copy valid.
        verified = stage / 'verified.tar.gz'
        unseal(partial, verified)
        with tarfile.open(verified, 'r:gz') as tar:
            if 'database.dump' not in tar.getnames():
                raise RuntimeError('Database missing from backup')
        partial.replace(final)
    finally:
        partial.unlink(missing_ok=True)
    digest = hashlib.sha256(final.read_bytes()).hexdigest()
    final.with_suffix(final.suffix + '.sha256').write_text(digest + '  ' + final.name + '\n')
    # Only completed archives belonging to this app in its dedicated volume.
    cutoff = now.timestamp() - 30 * 86400
    for old in destination.glob('ritmo-saude-*.tar.gz.aesgcm'):
        if old.stat().st_mtime < cutoff:
            old.unlink()
            old.with_suffix(old.suffix + '.sha256').unlink(missing_ok=True)
    value = {'last_success': now.isoformat(), 'status': 'ok', 'archive': final.name,
             'bytes': final.stat().st_size, 'sha256': digest, 'retention_days': 30, 'timezone': 'America/Sao_Paulo'}
    atomic_json(STATUS, value)
    (STATE / 'last-error.log').unlink(missing_ok=True)
    print(json.dumps(value))

def restore_test(stage, destination):
    archives = sorted(destination.glob('ritmo-saude-*.tar.gz.aesgcm'))
    if not archives:
        raise RuntimeError('No completed backup')
    encrypted = archives[-1]
    checksum = encrypted.with_suffix(encrypted.suffix + '.sha256').read_text().split()[0]
    if hashlib.sha256(encrypted.read_bytes()).hexdigest() != checksum:
        raise RuntimeError('Checksum mismatch')
    plain = stage / 'restore.tar.gz'
    unseal(encrypted, plain)
    with tarfile.open(plain, 'r:gz') as tar, (stage / 'database.dump').open('xb') as output:
        shutil.copyfileobj(tar.extractfile('database.dump'), output)
    name = f'ritmo-saude-restore-{os.getpid()}'
    started = False
    try:
        run(['docker', 'run', '-d', '--name', name, '--network=none', '--memory=256m', '--cpus=0.5', '--pids-limit=128',
             '--tmpfs', '/var/lib/postgresql:rw,size=256m', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE], stdout=subprocess.DEVNULL)
        started = True
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Restore sandbox did not become ready')
        sql = b'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;'
        run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, stdout=subprocess.DEVNULL)
        with (stage / 'database.dump').open('rb') as source:
            run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'postgres', '-d', 'postgres',
                 '--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error'], stdin=source, stdout=subprocess.DEVNULL)
        query = "select json_build_object('health_tables', count(*), 'all_health_rls',bool_and(c.relrowsecurity),'auth_users',(select count(*) from auth.users)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'health_%' and c.relkind='r';"
        result = run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-tAc', query], stdout=subprocess.PIPE)
        restored = json.loads(result.stdout)
        if restored['health_tables'] != 9 or not restored['all_health_rls']:
            raise RuntimeError('Restored schema validation failed')
        report = {'tested_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'ok', 'archive': encrypted.name,
                  'isolated_network': True, 'restored': restored, 'production_database_modified': False}
        atomic_json(STATE / 'restore-test.json', report)
        print(json.dumps(report))
    finally:
        if started:
            run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--restore-test', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Root required')
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE.chmod(0o700)
    with (STATE / 'backup.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        destination = volume_path()
        with tempfile.TemporaryDirectory(prefix='stage-', dir=STATE) as work:
            if args.restore_test:
                restore_test(Path(work), destination)
            else:
                backup(Path(work), destination)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No raw subprocess stderr/connection strings in journal or dashboard.
        if STATE.exists():
            target = STATE / 'restore-test.json' if '--restore-test' in sys.argv else STATUS
            previous = json.loads(target.read_text()) if target.exists() else {}
            atomic_json(target, {**previous, 'status': 'failed', 'failed_at': dt.datetime.now(dt.timezone.utc).isoformat()})
            # Private diagnostic only; never publish raw DB stderr to monitoring.
            (STATE / 'last-error.log').write_text(str(error) + '\n' + getattr(error, 'stderr', b'').decode(errors='replace'))
        print('Ritmo backup/check failed; credentials suppressed. Previous completed copies are preserved.')
        raise SystemExit(1)
