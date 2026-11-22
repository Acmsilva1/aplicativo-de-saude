"""Run as root on the authorized VM; never output environment values."""
import os
from pathlib import Path

runtime = Path('/opt/ritmo-saude/.env')
private_dir = Path('/etc/ritmo-saude')
private_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(private_dir, 0o700)
private = private_dir / 'maintenance.env'
lines = runtime.read_text().splitlines(keepends=True)
keys = {'DATABASE_URL', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_PASSWORD'}
maintenance, keep = [], []
for line in lines:
    key = line.split('=', 1)[0].strip()
    (maintenance if key in keys else keep).append(line)
if maintenance:
    # Preserve a previous maintenance file when re-running the separation.
    existing = private.read_text().splitlines(keepends=True) if private.exists() else []
    replaced = {line.split('=', 1)[0].strip() for line in maintenance}
    preserved = [line for line in existing if line.split('=', 1)[0].strip() not in replaced]
    descriptor = os.open(private, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.writelines(preserved + maintenance)
    os.chmod(private, 0o600)
    descriptor = os.open(runtime, os.O_WRONLY | os.O_TRUNC)
    with os.fdopen(descriptor, 'w') as output:
        output.writelines(keep)
os.chmod(runtime, 0o600)
print('Maintenance credentials separated; runtime file mode 600; values not displayed.')
