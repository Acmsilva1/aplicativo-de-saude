#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:-}"
if [[ ! "$sha" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "Uso: deploy-ritmo-saude <git-sha>" >&2
  exit 2
fi

app_dir=/opt/ritmo-saude
inbox=/opt/ritmo-deploy-inbox
archive="${inbox}/ritmo-saude-${sha}.tar.gz"

test -f "${app_dir}/.env" || { echo "Arquivo ${app_dir}/.env ausente." >&2; exit 1; }
test -f "${archive}" || { echo "Arquivo ${archive} ausente." >&2; exit 1; }

tmp="$(mktemp -d /tmp/ritmo-deploy.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

tar -xzf "${archive}" -C "${tmp}"
rsync -a --delete \
  --exclude '.env' \
  --exclude '.deployed-revision' \
  "${tmp}/" "${app_dir}/"

printf '%s\n' "$sha" > "${app_dir}/.deployed-revision"
chmod 600 "${app_dir}/.env"
chown root:root "${app_dir}/.env"

cd "${app_dir}"
docker compose up -d --build --force-recreate --remove-orphans
docker compose ps