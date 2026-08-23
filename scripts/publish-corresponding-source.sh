#!/usr/bin/env bash
# FamilyTravelSite §39 — sanitized AGPL corresponding-source snapshot.
# Tracked files only (git archive). Never copies .env*, .wrangler, dist, or untracked plans.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMMIT="HEAD"
CHECK_ONLY=0
VERIFY_BUILD=0
PUSH=0
OUT_DIR=""
REMOTE="${SOURCE_MIRROR_REMOTE:-https://github.com/Misael-L/familytravelsite-source.git}"
WORKERS_BUILD_UUID="${WORKERS_BUILD_UUID:-}"
WORKERS_VERSION_ID="${WORKERS_VERSION_ID:-}"

usage() {
  cat <<'EOF'
Usage: scripts/publish-corresponding-source.sh [options]

  --commit <rev>     Tracked commit to archive (default: HEAD)
  --check            Archive + secret scan only (default when --push is omitted)
  --verify-build     Run npm ci && npm run build:web in a clean extract, then scan dist
  --push             Push an orphan commit + tag to SOURCE_MIRROR_REMOTE
  --out <dir>        Working directory (default: a temp dir)
  --remote <url>     Public mirror remote

Env: WORKERS_BUILD_UUID, WORKERS_VERSION_ID, SOURCE_MIRROR_REMOTE
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      COMMIT="${2:?}"
      shift 2
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    --verify-build)
      VERIFY_BUILD=1
      shift
      ;;
    --push)
      PUSH=1
      shift
      ;;
    --out)
      OUT_DIR="${2:?}"
      shift 2
      ;;
    --remote)
      REMOTE="${2:?}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$PUSH" -eq 0 ]]; then
  CHECK_ONLY=1
fi

FULL_SHA="$(git rev-parse "$COMMIT")"
SHORT_SHA="$(git rev-parse --short=7 "$FULL_SHA")"
SUBJECT="$(git log -1 --format='%s' "$FULL_SHA")"
STAMP="$(date -u +%Y%m%d)"
TAG="source-${STAMP}-${SHORT_SHA}"
NODE_PIN="$(tr -d '[:space:]' < "$ROOT/.node-version" 2>/dev/null || echo 22)"

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/familytravelsite-source.XXXXXX")"
fi
EXTRACT="$OUT_DIR/extract"
mkdir -p "$EXTRACT"

echo "Archiving $FULL_SHA ($SHORT_SHA) → $EXTRACT"

git archive --format=tar "$FULL_SHA" | tar -xf - -C "$EXTRACT"

# Refuse known secret / artifact paths if they somehow were tracked.
forbidden_paths="$(
  (
    cd "$EXTRACT"
    find . -type f \( \
      -name '.env' -o -name '.env.local' -o -name '.env.*.local' -o \
      -name '.dev.vars' -o -name '*.pem' -o -name 'id_rsa' -o \
      -name '.npmrc' \
    \) ! -name '*.example'
    find . -type d \( -name '.wrangler' -o -name 'node_modules' \)
    find . \( -path './client/dist/*' -o -path './dist/*' \) -type f
    find . -path './.cursor/plans/*' -type f
  ) | sed 's|^\./||' || true
)"
if [[ -n "$forbidden_paths" ]]; then
  echo "Refusing snapshot; forbidden paths present:" >&2
  echo "$forbidden_paths" >&2
  exit 1
fi

scan_tree() {
  local target="$1"
  local hits
  hits="$(
    grep -R -I -n -E \
      'service_role|SERVICE_ROLE|CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY|BEGIN (RSA |OPENSSH )?PRIVATE KEY' \
      "$target" \
      --exclude-dir=.git \
      --exclude-dir=node_modules \
      --exclude='*.map' \
      || true
  )"
  # Allow the checker itself and the locks/docs that name the forbidden strings.
  hits="$(
    printf '%s\n' "$hits" | grep -v -E \
      'scripts/publish-corresponding-source\.sh|docs/web-trek-supabase-locks\.md|docs/corresponding-source\.md|SOURCE\.md|README\.md|wiki/Development-environment\.md|client/src/legal/sourceOffer\.ts' \
      || true
  )"
  if [[ -n "$hits" ]]; then
    echo "Secret scan failed in $target:" >&2
    echo "$hits" >&2
    exit 1
  fi
}

scan_tree "$EXTRACT"

cat > "$EXTRACT/RELEASE_MANIFEST.json" <<EOF
{
  "privateProductionCommit": "$FULL_SHA",
  "privateCommitSubject": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$SUBJECT"),
  "publicSourceTag": "$TAG",
  "publicSourceRemote": "$REMOTE",
  "workersBuildUuid": $(python3 -c 'import json,os; print(json.dumps(os.environ.get("WORKERS_BUILD_UUID") or None))' ),
  "workersVersionId": $(python3 -c 'import json,os; print(json.dumps(os.environ.get("WORKERS_VERSION_ID") or None))' ),
  "node": "$NODE_PIN",
  "buildCommand": "npm run build:web",
  "origin": "https://familytravelsite.lmisael0721.workers.dev",
  "license": "AGPL-3.0-only",
  "createdAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Secret scan clean. Manifest tag $TAG"

if [[ "$VERIFY_BUILD" -eq 1 ]]; then
  echo "Verifying npm ci + npm run build:web in $EXTRACT"
  (
    cd "$EXTRACT"
    npm ci
    npm run build:web
  )
  scan_tree "$EXTRACT/client/dist"
  echo "Build + dist scan clean"
fi

if [[ "$PUSH" -eq 1 ]]; then
  PUSH_DIR="$OUT_DIR/mirror"
  rm -rf "$PUSH_DIR"
  mkdir -p "$PUSH_DIR"
  (
    cd "$PUSH_DIR"
    git init -b main
    git checkout --orphan main
    cp -R "$EXTRACT"/. .
    git add -A
    git -c user.name='Family Travel Source Offer' -c user.email='source-offer@invalid' \
      commit -m "Corresponding source $SHORT_SHA ($TAG)"
    git tag -a "$TAG" -m "AGPL corresponding source for $FULL_SHA"
    git remote add origin "$REMOTE"
    git push -u origin "HEAD:main"
    git push origin "$TAG"
  )
  echo "Pushed $TAG to $REMOTE"
else
  echo "Check-only complete. Snapshot at $EXTRACT"
  echo "Re-run with --push to publish $TAG to $REMOTE"
fi
