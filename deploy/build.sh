#!/bin/sh
# Pull the vault, rebuild the blog if it changed, publish to the directory Caddy serves.
# Usage: build.sh [app-commit]  (CI passes the tested commit; the timer passes nothing)
set -eu
BLOG=${BLOG:-$HOME/blog}
APP=$BLOG/app
VAULT=$BLOG/vault

exec 9>"$BLOG/.lock"
if [ -n "${1:-}" ]; then
  flock 9
  git -C "$APP" fetch -q origin
  git -C "$APP" merge -q --ff-only "$1"
else
  flock -n 9 || exit 0
fi

git -C "$VAULT" pull -q --ff-only
head="$(git -C "$VAULT" rev-parse HEAD) $(git -C "$APP" rev-parse HEAD)"
[ "$head" = "$(cat "$BLOG/.last-built" 2>/dev/null || true)" ] && exit 0

docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e TZ=Asia/Seoul -v "$BLOG:$BLOG" -w "$APP" node:22 sh -c '
  [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci --no-audit --no-fund
  node scripts/collect.mjs "$0" && node quartz/bootstrap-cli.mjs build' "$VAULT"

# shortcut: not atomic, readers can see a mixed tree for the second rsync runs; switch to a symlink swap if that matters.
rsync -a --delete "$APP/public/" "$BLOG/site/"
echo "$head" > "$BLOG/.last-built"
