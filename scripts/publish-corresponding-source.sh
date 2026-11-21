#!/usr/bin/env bash
# FamilyTravelSite §39 / §47 — sanitized AGPL corresponding-source snapshot.
# Tracked files only (git archive). Never copies .env*, .wrangler, dist, or untracked plans.
# Mirror publication is atomic (main + source tag). Never a partial main/tag state.
set -euo pipefail
umask 077

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
DEPLOYMENT_ORIGIN="${DEPLOYMENT_ORIGIN:-https://familytravelsite.lmisael0721.workers.dev}"
SCANNER="$SCRIPT_ROOT/client/tests/unit/family/secretScan.ts"

usage() {
  cat <<'EOF'
Usage: scripts/publish-corresponding-source.sh [options]

  --commit <rev>              Tracked commit to archive (default: HEAD)
  --source-repo <dir>         Git repository to archive (default: this FamilyTravelSite tree)
  --check                     Archive + artifact secret scan only (default when --push is omitted)
  --origin <url>              Exact approved production or integration-preview origin
  --verify-build              Run npm ci && npm run build:web in a clean extract, then scan dist
  --push                      Atomically push mirror main and source tag to SOURCE_MIRROR_REMOTE
  --expected-main-oid <sha>   Required when the mirror already has main (lease)
  --orphan                    Replace mirror main; requires --expected-main-oid; force-with-lease only
  --out <dir>                 Working directory (default: a temp dir)
  --remote <url>              Public mirror remote

Env: WORKERS_BUILD_UUID, WORKERS_VERSION_ID, DEPLOYMENT_ORIGIN, SOURCE_MIRROR_REMOTE, EXPECTED_MAIN_OID
Each invocation requires a fresh extract/mirror under --out. --push requires WORKERS_VERSION_ID.
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
    --origin)
      DEPLOYMENT_ORIGIN="${2:?}"
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
FULL_SHA="$(git rev-parse --verify --end-of-options "${COMMIT}^{commit}")"
SHORT_SHA="$(git rev-parse --short=7 "$FULL_SHA")"
SUBJECT="$(git log -1 --format='%s' "$FULL_SHA")"
STAMP="$(date -u +%Y%m%d)"
TAG="source-${STAMP}-${SHORT_SHA}"
if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/familytravelsite-source.XXXXXX")"
fi

# Inspect the immutable Git tree and all tar members before creating source files.
# Only this reviewed operational plan may be omitted; changed content needs review.
OUT_DIR="$(python3 - "$SOURCE_ROOT" "$FULL_SHA" "$OUT_DIR" "$DEPLOYMENT_ORIGIN" "$PUSH" "$REMOTE" <<'ARCHIVE_PY'
from pathlib import Path, PurePosixPath
import hashlib, json, os, re, subprocess, sys, tarfile, tempfile
from urllib.parse import urlsplit
source, commit, output, origin, push, remote = sys.argv[1:]
# Public metadata must not embed remote credentials or signed query strings.
if any(c in remote for c in ('\n', '\r', '\x00')):
    raise SystemExit('Invalid source mirror remote')
if not Path(remote).is_absolute():
    parsed = urlsplit(remote)
    if (parsed.scheme not in ('https', 'file') or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not parsed.path
            or (parsed.scheme == 'https' and not parsed.hostname)
            or (parsed.scheme == 'file' and (parsed.netloc or not parsed.path.startswith('/')))):
        raise SystemExit('Source mirror remote must be credential-free HTTPS or a local test path')
allowed = {
    'https://familytravelsite.lmisael0721.workers.dev',
    'https://familytravelsite-integration-preview.lmisael0721.workers.dev',
}
if origin not in allowed:
    raise SystemExit('Unsupported deployment origin; use an exact approved HTTPS origin')
uuid = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')
for key in ('WORKERS_VERSION_ID', 'WORKERS_BUILD_UUID'):
    value = os.environ.get(key, '')
    if value and not uuid.fullmatch(value):
        raise SystemExit('Invalid ' + key + '; expected a canonical UUID')
if push == '1' and not os.environ.get('WORKERS_VERSION_ID'):
    raise SystemExit('Publication requires the actual WORKERS_VERSION_ID')
root = Path(output).absolute()
if root.is_symlink() or (root.exists() and not root.is_dir()):
    raise SystemExit('Output root must be a real directory')
root.mkdir(parents=True, exist_ok=True)
root = root.resolve(strict=True)
extract = root / 'extract'
if any(os.path.lexists(root / name) for name in ('extract', 'mirror', 'build', 'source-archive.json')):
    raise SystemExit('Output already contains publication work; choose a fresh --out')
plan = '.cursor/plans/existing-family-backend-integration.plan.md'
plan_hash = 'c4677c13b949e3f714fe3f07f58f10c0a54af72a23537d7bb43e356240512449'
raw = subprocess.check_output(['git', '-C', source, 'ls-tree', '-r', '-z', commit])
files = {}
def safe(name):
    p = PurePosixPath(name)
    return bool(name) and not p.is_absolute() and all(x not in ('', '.', '..', '.git') for x in name.split('/')) and not any(x in name for x in ('\\', '\n', '\r', '\x00'))
for entry in raw.split(b'\0'):
    if not entry:
        continue
    meta, name = entry.split(b'\t', 1)
    mode, kind, oid = meta.decode('ascii').split()
    name = name.decode('utf-8')
    if mode not in ('100644', '100755') or kind != 'blob' or not safe(name) or name in files:
        raise SystemExit('Source tree contains a link, nonregular, duplicate or unsafe path')
    files[name] = (mode, oid)
if 'RELEASE_MANIFEST.json' in files:
    raise SystemExit('Tracked RELEASE_MANIFEST.json conflicts with generated release metadata')
omissions = []
with tempfile.TemporaryFile(dir=root) as archive:
    subprocess.run(['git', '-C', source, 'archive', '--format=tar', commit], stdout=archive, check=True)
    archive.seek(0)
    with tarfile.open(fileobj=archive, mode='r:') as tar:
        members = tar.getmembers()
        seen = set()
        regular = set()
        for member in members:
            name = member.name.rstrip('/') if member.isdir() else member.name
            if not safe(name) or name in seen or not (member.isdir() or member.isfile()):
                raise SystemExit('Archive contains a link, nonregular, duplicate or unsafe path')
            seen.add(name)
            if member.isfile():
                regular.add(name)
        if regular != set(files):
            raise SystemExit('Archive omitted or added tracked source; review export attributes')
        # No link/directory traversal is possible under this newly created root.
        extract.mkdir(mode=0o700)
        for member in members:
            name = member.name.rstrip('/') if member.isdir() else member.name
            target = extract / name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            mode, oid = files[name]
            stream = tar.extractfile(member)
            if stream is None:
                raise SystemExit('Archive file body missing')
            body = stream.read()
            algorithm = 'sha1' if len(oid) == 40 else 'sha256'
            actual = hashlib.new(algorithm, b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
            if actual != oid or bool(member.mode & 0o111) != (mode == '100755') or member.mode & 0o7000:
                raise SystemExit('Archive source bytes/mode differ from immutable Git object')
            if name == plan:
                digest = hashlib.sha256(body).hexdigest()
                if mode != '100644' or digest != plan_hash:
                    raise SystemExit('Reviewed private plan changed; omission needs explicit review')
                omissions.append({'path': name, 'sha256': digest, 'bytes': len(body),
                                  'reason': 'Private operational plan; not required to build or run the application'})
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as out:
                out.write(body)
            target.chmod(0o755 if mode == '100755' else 0o644)
(root / 'source-archive.json').write_text(json.dumps({
    'policy': 'family.private-operational-plan.v1', 'privateCommit': commit,
    'trackedFiles': len(files), 'sourceFilesRetained': len(files) - len(omissions),
    'allRetainedBytesAndModesMatchGit': True, 'omissions': omissions,
}, indent=2) + '\n')
print(root)
ARCHIVE_PY
)"
EXTRACT="$OUT_DIR/extract"
echo "Archived $FULL_SHA ($SHORT_SHA) → $EXTRACT"

forbidden_paths="$(
  (
    cd "$EXTRACT"
    find . -type f \( \
      -name '.env*' -o \
      -name '.dev.vars*' -o -name '*.pem' -o -name 'id_rsa' -o \
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
  NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --repo=FamilyTravelSite --kind=dist --root="$1" --source-commit="$FULL_SHA"
}

scan_archive "$EXTRACT"

# Serialize every metadata value as data, then scan it as part of the archive too.
python3 - "$EXTRACT" "$FULL_SHA" "$SUBJECT" "$TAG" "$REMOTE" "$DEPLOYMENT_ORIGIN" "$OUT_DIR/source-archive.json" <<'MANIFEST_PY'
from pathlib import Path
import datetime, json, os, re, sys
extract, commit, subject, tag, remote, origin, receipt = sys.argv[1:]
root = Path(extract)
node = (root / '.node-version').read_text().strip() if (root / '.node-version').is_file() else '22'
if not re.fullmatch(r'v?[0-9]+(?:\.[0-9]+){0,2}', node):
    raise SystemExit('Invalid archived Node version')
version = os.environ.get('WORKERS_VERSION_ID') or None
manifest = {
    'privateSourceCommit': commit, 'privateProductionCommit': commit, 'privateCommitSubject': subject,
    'publicSourceTag': tag, 'publicSourceRemote': remote,
    'workersBuildUuid': os.environ.get('WORKERS_BUILD_UUID') or None,
    'workersVersionId': version, 'node': node, 'buildCommand': 'npm run build:web',
    'origin': origin, 'license': 'AGPL-3.0-only',
    'createdAtUtc': datetime.datetime.now(datetime.UTC).isoformat(),
    'deploymentBinding': 'caller-supplied-version' if version else 'check-only-unbound',
    'sanitization': json.loads(Path(receipt).read_text()),
}
(root / 'RELEASE_MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
MANIFEST_PY
scan_archive "$EXTRACT"

echo "Secret scan clean. Manifest tag $TAG"

if [[ "$VERIFY_BUILD" -eq 1 ]]; then
  BUILD_DIR="$OUT_DIR/build"
  mkdir "$BUILD_DIR"
  cp -R "$EXTRACT"/. "$BUILD_DIR"/
  echo "Verifying npm ci + npm run build:web in $BUILD_DIR"
  (
    cd "$BUILD_DIR"
    npm ci
    FAMILY_SOURCE_COMMIT="$FULL_SHA" npm run build:web
  )
  if [[ ! -d "$BUILD_DIR/client/dist" ]]; then
    echo "verify-build produced no client/dist" >&2
    exit 1
  fi
  scan_dist "$BUILD_DIR/client/dist"
  echo "Build + dist scan clean"
fi

remote_main_oid() {
  git ls-remote --exit-code "$REMOTE" refs/heads/main 2>/dev/null | awk '{print $1}'
}

if [[ "$PUSH" -eq 1 ]]; then
  PUSH_DIR="$OUT_DIR/mirror"
  mkdir "$PUSH_DIR"

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
  elif [[ "$ls_ec" -ne 2 ]]; then
    echo "Unable to read mirror main; refusing publication" >&2
    exit 1
  elif [[ -n "$EXPECTED_MAIN_OID" ]]; then
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

    push_args=(--atomic "--force-with-lease=refs/heads/main:${EXPECTED_MAIN_OID}" origin "refs/heads/main:refs/heads/main" "refs/tags/${TAG}:refs/tags/${TAG}")
    if ! git push "${push_args[@]}"; then
      echo "Atomic mirror push failed; remote main/tag left unchanged" >&2
      exit 1
    fi
  )
  echo "Pushed $TAG to $REMOTE"
else
  echo "Check-only complete. Snapshot at $EXTRACT"
  echo "For publication, use a fresh --out, actual Worker version and current mirror-main lease."
fi
