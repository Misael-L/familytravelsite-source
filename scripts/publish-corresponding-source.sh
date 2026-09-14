#!/usr/bin/env bash
# FamilyTravelSite §39 / §47 — sanitized AGPL corresponding-source snapshot.
# Tracked files only (git archive). Never copies .env*, .wrangler, dist, or untracked plans.
# Mirror publication is atomic (main + source tag). Never a partial main/tag state.
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="$SCRIPT_ROOT"
COMMIT="HEAD"
CHECK_ONLY=0
VERIFY_BUILD=0
PUSH=0
ORPHAN=0
OUT_DIR=""
REMOTE="${SOURCE_MIRROR_REMOTE:-https://github.com/Misael-L/familytravelsite-source.git}"
WORKERS_BUILD_UUID="${WORKERS_BUILD_UUID:-}"
WORKERS_VERSION_ID="${WORKERS_VERSION_ID:-}"
EXPECTED_MAIN_OID="${EXPECTED_MAIN_OID:-}"
SCANNER="$SCRIPT_ROOT/client/tests/unit/family/secretScan.ts"

usage() {
  cat <<'EOF'
Usage: scripts/publish-corresponding-source.sh [options]

  --commit <rev>              Tracked commit to archive (default: HEAD)
  --source-repo <dir>         Git repository to archive (default: this FamilyTravelSite tree)
  --check                     Archive + artifact secret scan only (default when --push is omitted)
  --verify-build              Run npm ci && npm run build:web in a clean extract, then scan dist
  --push                      Atomically push mirror main and source tag to SOURCE_MIRROR_REMOTE
  --expected-main-oid <sha>   Required when the mirror already has main (lease)
  --orphan                    Replace mirror main; requires --expected-main-oid; force-with-lease only
  --out <dir>                 Working directory (default: a temp dir)
  --remote <url>              Public mirror remote

Env: WORKERS_BUILD_UUID, WORKERS_VERSION_ID, SOURCE_MIRROR_REMOTE, EXPECTED_MAIN_OID
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      COMMIT="${2:?}"
      shift 2
      ;;
    --source-repo)
      SOURCE_ROOT="$(cd "${2:?}" && pwd)"
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
    --expected-main-oid)
      EXPECTED_MAIN_OID="${2:?}"
      shift 2
      ;;
    --orphan)
      ORPHAN=1
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

if [[ "$ORPHAN" -eq 1 && -z "$EXPECTED_MAIN_OID" ]]; then
  echo "Refusing orphan replacement without --expected-main-oid" >&2
  exit 2
fi

if [[ ! -f "$SCANNER" ]]; then
  echo "Missing artifact scanner at $SCANNER" >&2
  exit 1
fi

cd "$SOURCE_ROOT"
FULL_SHA="$(git rev-parse "$COMMIT")"
SHORT_SHA="$(git rev-parse --short=7 "$FULL_SHA")"
SUBJECT="$(git log -1 --format='%s' "$FULL_SHA")"
STAMP="$(date -u +%Y%m%d)"
TAG="source-${STAMP}-${SHORT_SHA}"
NODE_PIN="$(tr -d '[:space:]' < "$SOURCE_ROOT/.node-version" 2>/dev/null || echo 22)"

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/familytravelsite-source.XXXXXX")"
fi
EXTRACT="$OUT_DIR/extract"
mkdir -p "$EXTRACT"

echo "Archiving $FULL_SHA ($SHORT_SHA) → $EXTRACT"

git archive --format=tar "$FULL_SHA" | tar -xf - -C "$EXTRACT"

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

scan_archive() {
  NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --repo=FamilyTravelSite --kind=archive --root="$1"
}

scan_dist() {
  NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --repo=FamilyTravelSite --kind=dist --root="$1"
}

scan_archive "$EXTRACT"

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
  if [[ ! -d "$EXTRACT/client/dist" ]]; then
    echo "verify-build produced no client/dist" >&2
    exit 1
  fi
  scan_dist "$EXTRACT/client/dist"
  echo "Build + dist scan clean"
fi

remote_main_oid() {
  git ls-remote --exit-code "$REMOTE" refs/heads/main 2>/dev/null | awk '{print $1}'
}

if [[ "$PUSH" -eq 1 ]]; then
  PUSH_DIR="$OUT_DIR/mirror"
  rm -rf "$PUSH_DIR"
  mkdir -p "$PUSH_DIR"

  existing_main=""
  set +e
  existing_main="$(remote_main_oid)"
  ls_ec=$?
  set -e
  if [[ "$ls_ec" -eq 0 && -n "$existing_main" ]]; then
    if [[ -z "$EXPECTED_MAIN_OID" ]]; then
      echo "Mirror main exists; pass --expected-main-oid <current-oid>" >&2
      exit 2
    fi
    if [[ "$existing_main" != "$EXPECTED_MAIN_OID" ]]; then
      echo "lease_failure remote_main_moved" >&2
      exit 1
    fi
  elif [[ -n "$EXPECTED_MAIN_OID" && "$ORPHAN" -eq 0 ]]; then
    echo "expected-main-oid set but mirror has no refs/heads/main" >&2
    exit 1
  fi

  (
    cd "$PUSH_DIR"
    git init -q
    git config user.name 'Family Travel Source Offer'
    git config user.email 'source-offer@invalid'
    git remote add origin "$REMOTE"

    if [[ -n "$existing_main" && "$ORPHAN" -eq 0 ]]; then
      git fetch --quiet origin "+refs/heads/main:refs/remotes/origin/main"
      git checkout --quiet -B main origin/main
      git rm -rfq --ignore-unmatch . >/dev/null 2>&1 || true
      find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    else
      git checkout --quiet --orphan main
    fi

    cp -R "$EXTRACT"/. .
    # git add -A is permitted only inside this disposable mirror (not operator repos).
    git add -A -- .
    if git diff --cached --quiet; then
      echo "Nothing to publish; extract matches current mirror tree" >&2
      exit 1
    fi
    git -c user.name='Family Travel Source Offer' -c user.email='source-offer@invalid' \
      commit -q -m "Corresponding source $SHORT_SHA ($TAG)"
    git tag -a "$TAG" -m "AGPL corresponding source for $FULL_SHA"

    push_args=(--atomic origin "refs/heads/main:refs/heads/main" "refs/tags/${TAG}:refs/tags/${TAG}")
    if [[ -n "$existing_main" ]]; then
      push_args=(--atomic "--force-with-lease=refs/heads/main:${EXPECTED_MAIN_OID}" origin "refs/heads/main:refs/heads/main" "refs/tags/${TAG}:refs/tags/${TAG}")
    fi
    if ! git push "${push_args[@]}"; then
      echo "Atomic mirror push failed; remote main/tag left unchanged" >&2
      exit 1
    fi
  )
  echo "Pushed $TAG to $REMOTE"
else
  echo "Check-only complete. Snapshot at $EXTRACT"
  echo "Re-run with --push to publish $TAG to $REMOTE"
fi
