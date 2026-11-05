#!/usr/bin/env bash
# Production update — runs ON the server: ssh toyoshima '~/Toyoshima_Invertory/scripts/deploy.sh'
#
#   deploy.sh             pull origin/main, rebuild what changed, restart, health-check
#   deploy.sh --migrate   same, and also apply new migrations (after a pg_dump backup)
#
# Without --migrate the script stops BEFORE pulling if new migrations are incoming, so a
# table-dropping migration (e.g. 0048_delete_board) never runs by accident.
# Restarts need the narrow NOPASSWD rule in /etc/sudoers.d/toyoshima-deploy (docs/DEPLOY.md).
set -euo pipefail

main() {
  local allow_migrate=0
  [[ "${1:-}" == "--migrate" ]] && allow_migrate=1

  cd ~/Toyoshima_Invertory

  # npm install rewrites the lockfile on this box; that drift is never meant to be kept
  git checkout -- frontend/package-lock.json
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "ABORT: server working tree has local changes:"; git status --short --untracked-files=no
    exit 1
  fi

  git fetch --quiet origin main
  local old new
  old=$(git rev-parse HEAD)
  new=$(git rev-parse origin/main)
  if [[ "$old" == "$new" ]]; then
    echo "Already at $(git log -1 --oneline). Nothing to deploy."
    exit 0
  fi

  local changed new_migrations
  changed=$(git diff --name-only "$old" "$new")
  new_migrations=$(git diff --name-only --diff-filter=A "$old" "$new" -- 'backend/server/*/migrations/0*.py')
  if [[ -n "$new_migrations" && $allow_migrate -eq 0 ]]; then
    echo "STOP: incoming migrations (nothing pulled, nothing restarted):"
    echo "$new_migrations"
    echo "Review them, then rerun with --migrate."
    exit 2
  fi

  echo "== Deploying $(git log -1 --oneline "$old") -> $(git log -1 --oneline "$new")"
  git merge --ff-only --quiet "$new"

  if grep -q '^backend/' <<<"$changed"; then
    echo "== Backend"
    cd backend/server
    # shellcheck disable=SC1091
    source venv/bin/activate
    if grep -qx 'backend/server/requirements.txt' <<<"$changed"; then
      pip install --quiet -r requirements.txt
    fi
    if [[ -n "$new_migrations" ]]; then
      backup_db
      python manage.py migrate --no-input
    fi
    python manage.py check >/dev/null
    deactivate
    cd ../..
    sudo -n systemctl restart toyoshima-backend
  fi

  if grep -q '^frontend/' <<<"$changed"; then
    echo "== Frontend"
    cd frontend
    if grep -qE '^frontend/package(-lock)?\.json$' <<<"$changed"; then
      npm install --no-audit --no-fund
      git checkout -- package-lock.json
    fi
    npm run build
    cd ..
    sudo -n systemctl restart toyoshima-frontend
  fi

  health_check
  echo "== Deployed $(git log -1 --oneline)"
}

backup_db() {
  local name user host port pw file
  IFS=$'\t' read -r name user host port pw < <(python manage.py shell -c \
    "from django.conf import settings as s; d=s.DATABASES['default']; print(d['NAME'], d['USER'], d['HOST'] or 'localhost', d['PORT'] or 5432, d['PASSWORD'], sep='\t')")
  mkdir -p ~/backups
  file=~/backups/backup_$(date +%F_%H%M%S).sql
  PGPASSWORD="$pw" pg_dump -U "$user" -h "$host" -p "$port" "$name" > "$file"
  echo "DB backed up to $file ($(du -h "$file" | cut -f1))"
}

health_check() {
  sleep 3
  local unit code
  for unit in toyoshima-backend toyoshima-frontend; do
    systemctl is-active --quiet "$unit" || { echo "FAIL: $unit not active"; journalctl -u "$unit" -n 30 --no-pager; exit 3; }
  done
  # any HTTP answer (even 404) means the process is serving; 000 means it is not
  for port in 8000 3000; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$port/" || true)
    [[ "$code" != "000" ]] || { echo "FAIL: nothing answering on port $port"; exit 3; }
    echo "port $port -> HTTP $code"
  done
}

main "$@"
