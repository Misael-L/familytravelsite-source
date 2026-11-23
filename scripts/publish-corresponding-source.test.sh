#!/usr/bin/env bash
# Disposable-remote tests for corresponding-source atomic publication.
# Never uses the operator remotes. Cleans up all temp dirs on exit.
set -euo pipefail
umask 077
# Never inherit operator publication identity or a remote/lease from the environment.
unset WORKERS_BUILD_UUID DEPLOYMENT_ORIGIN EXPECTED_MAIN_OID SOURCE_MIRROR_REMOTE
export WORKERS_VERSION_ID=00000000-0000-4000-8000-000000000001

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLISH="$SCRIPT_ROOT/scripts/publish-corresponding-source.sh"
PASS=0
FAIL=0
WORKDIR=""

cleanup() {
  if [[ -n "${WORKDIR:-}" && -d "$WORKDIR" ]]; then
    rm -rf "$WORKDIR"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  FAIL=$((FAIL + 1))
}

pass() {
  echo "PASS: $*"
  PASS=$((PASS + 1))
}

require() {
  local name="$1"
  shift
  if "$@"; then
    pass "$name"
  else
    fail "$name"
  fi
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/fta-source-pub.XXXXXX")"
SRC="$WORKDIR/src"
BARE="$WORKDIR/bare.git"
OUT1="$WORKDIR/out1"
OUT2="$WORKDIR/out2"
OUT3="$WORKDIR/out3"
CLONE="$WORKDIR/clone"
LEASE_WT="$WORKDIR/lease-wt"

git_ident() {
  git -C "$1" config user.name 'Publisher Test'
  git -C "$1" config user.email 'publisher-test@invalid'
}

init_source() {
  mkdir -p "$SRC"
  git -C "$SRC" init -b main >/dev/null
  git_ident "$SRC"
  printf 'safe-source-v1\n' > "$SRC/README.md"
  printf '22\n' > "$SRC/.node-version"
  git -C "$SRC" add -- README.md .node-version
  git -C "$SRC" commit -q -m 'v1'
}

git init --bare "$BARE" >/dev/null
init_source

echo "== check-only artifact scan =="
mkdir -p "$OUT1"
if bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --check --out "$OUT1" --remote "$BARE"; then
  pass "check-only"
else
  fail "check-only"
fi

echo "== publisher invokes archive and dist identity =="
if grep -q -- '--repo=FamilyTravelSite --kind=archive' "$PUBLISH" && grep -q -- '--repo=FamilyTravelSite --kind=dist' "$PUBLISH"; then
  pass "publisher archive and dist flags"
else
  fail "publisher archive and dist flags"
fi

echo "== scanner flags fail closed =="
SCANNER="$SCRIPT_ROOT/client/tests/unit/family/secretScan.ts"
set +e
NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --root="$OUT1/extract" >/dev/null 2>&1
MISSING_EC=$?
NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --root="$OUT1/extract" --repo=Other --kind=archive >/dev/null 2>&1
BAD_REPO_EC=$?
NODE_NO_WARNINGS=1 node --experimental-strip-types "$SCANNER" --mode=artifact --root="$OUT1/extract" --repo=FamilyTravelSite --kind=bundle >/dev/null 2>&1
BAD_KIND_EC=$?
set -e
require "missing repo/kind fails" test "$MISSING_EC" -ne 0
require "invalid repo fails" test "$BAD_REPO_EC" -ne 0
require "invalid kind fails" test "$BAD_KIND_EC" -ne 0

echo "== first atomic publication =="
mkdir -p "$OUT1/push"
if bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT1/push" --remote "$BARE"; then
  pass "first push"
else
  fail "first push"
fi

MAIN1="$(git -C "$BARE" rev-parse refs/heads/main)"
TAG1="$(git -C "$BARE" for-each-ref --format='%(refname:short)' refs/tags | head -n 1)"
require "first main exists" test -n "$MAIN1"
require "first tag exists" test -n "$TAG1"
require "exactly one tag after first" test "$(git -C "$BARE" for-each-ref refs/tags | wc -l | tr -d ' ')" = "1"

echo "== clone equivalence (file:// unauthenticated) =="
git clone --quiet "file://${BARE}" "$CLONE"
git -C "$CLONE" checkout --quiet "$TAG1"
if diff -rq --exclude=.git "$CLONE" "$OUT1/push/extract" >/dev/null; then
  pass "clone tree equals extract"
else
  fail "clone tree equals extract"
fi
require "clone HEAD is published main" test "$(git -C "$CLONE" rev-parse refs/heads/main)" = "$MAIN1"

echo "== disposable git add -A stayed inside mirror =="
if git -C "$OUT1/push/mirror" ls-files | grep -q 'FamilyTravelSite/client/src'; then
  fail "mirror add did not leak operator paths"
else
  pass "mirror add bounded to extract"
fi

echo "== repeat publication =="
printf 'safe-source-v2\n' > "$SRC/README.md"
git -C "$SRC" add -- README.md
git -C "$SRC" commit -q -m 'v2'
mkdir -p "$OUT2"
if bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT2" --remote "$BARE" --expected-main-oid "$MAIN1"; then
  pass "repeat push"
else
  fail "repeat push"
fi
MAIN2="$(git -C "$BARE" rev-parse refs/heads/main)"
TAG_COUNT="$(git -C "$BARE" for-each-ref refs/tags | wc -l | tr -d ' ')"
require "main advanced on repeat" test "$MAIN2" != "$MAIN1"
require "repeat is child of first" test "$(git -C "$BARE" rev-parse "$MAIN2"^)" = "$MAIN1"
require "two tags after repeat" test "$TAG_COUNT" = "2"

echo "== lease failure when remote main moved =="
git clone --quiet "$BARE" "$LEASE_WT"
git_ident "$LEASE_WT"
printf 'foreign\n' >> "$LEASE_WT/README.md"
git -C "$LEASE_WT" add -- README.md
git -C "$LEASE_WT" commit -q -m 'foreign'
git -C "$LEASE_WT" push --quiet origin HEAD:refs/heads/main
FOREIGN="$(git -C "$BARE" rev-parse refs/heads/main)"
TAG_BEFORE_LEASE="$TAG_COUNT"
printf 'safe-source-v3\n' > "$SRC/README.md"
git -C "$SRC" add -- README.md
git -C "$SRC" commit -q -m 'v3'
mkdir -p "$OUT3"
set +e
LEASE_OUT="$(bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT3" --remote "$BARE" --expected-main-oid "$MAIN2" 2>&1)"
LEASE_EC=$?
set -e
if [[ "$LEASE_EC" -ne 0 ]] && printf '%s' "$LEASE_OUT" | grep -q 'lease_failure'; then
  pass "lease failure reported"
else
  fail "lease failure reported"
fi
require "lease left foreign main" test "$(git -C "$BARE" rev-parse refs/heads/main)" = "$FOREIGN"
require "lease added no tag" test "$(git -C "$BARE" for-each-ref refs/tags | wc -l | tr -d ' ')" = "$TAG_BEFORE_LEASE"

echo "== restore main to last successful publisher commit for atomic test =="
git -C "$BARE" update-ref refs/heads/main "$MAIN2"
require "restored main for atomic test" test "$(git -C "$BARE" rev-parse refs/heads/main)" = "$MAIN2"

echo "== atomic: rejecting tag hook leaves no partial main =="
cat > "$BARE/hooks/update" <<'HOOK'
#!/bin/sh
refname="$1"
case "$refname" in
  refs/tags/*)
    echo "reject tag" >&2
    exit 1
    ;;
esac
exit 0
HOOK
chmod +x "$BARE/hooks/update"
printf 'safe-source-v4\n' > "$SRC/README.md"
git -C "$SRC" add -- README.md
git -C "$SRC" commit -q -m 'v4'
OUT4="$WORKDIR/out4"
mkdir -p "$OUT4"
set +e
ATOMIC_OUT="$(bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT4" --remote "$BARE" --expected-main-oid "$MAIN2" 2>&1)"
ATOMIC_EC=$?
set -e
if [[ "$ATOMIC_EC" -ne 0 ]]; then
  pass "atomic push rejected"
else
  fail "atomic push rejected"
fi
require "no partial main after rejected atomic" test "$(git -C "$BARE" rev-parse refs/heads/main)" = "$MAIN2"
require "no extra tag after rejected atomic" test "$(git -C "$BARE" for-each-ref refs/tags | wc -l | tr -d ' ')" = "$TAG_BEFORE_LEASE"

rm -f "$BARE/hooks/update"

echo "== empty remote atomic failure leaves no refs =="
EMPTY="$WORKDIR/empty.git"
git init --bare "$EMPTY" >/dev/null
cat > "$EMPTY/hooks/update" <<'HOOK'
#!/bin/sh
echo "reject all" >&2
exit 1
HOOK
chmod +x "$EMPTY/hooks/update"
OUT5="$WORKDIR/out5"
mkdir -p "$OUT5"
set +e
bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT5" --remote "$EMPTY" >/dev/null 2>&1
EMPTY_EC=$?
set -e
require "empty reject failed" test "$EMPTY_EC" -ne 0
if git -C "$EMPTY" rev-parse --verify --quiet refs/heads/main; then
  fail "no partial main on empty reject"
else
  pass "no partial main on empty reject"
fi
if git -C "$EMPTY" for-each-ref refs/tags | grep -q .; then
  fail "no partial tag on empty reject"
else
  pass "no partial tag on empty reject"
fi

echo "== orphan replacement uses force-with-lease, never plain --force =="
if grep -E -n -- '--force([^-]|$)' "$PUBLISH" | grep -v force-with-lease >/dev/null; then
  fail "publisher must not use plain --force"
else
  pass "no plain --force"
fi
if grep -q -- '--atomic' "$PUBLISH" && grep -q -- 'force-with-lease' "$PUBLISH"; then
  pass "atomic and force-with-lease present"
else
  fail "atomic and force-with-lease present"
fi

echo "== immutable archive and metadata contract =="
# Python cases use real Git archives and the real strict artifact scanner. Only
# the two build-sequencing cases substitute npm; these do not prove an app build.
python3 - "$PUBLISH" "$SRC" "$WORKDIR" "$SCRIPT_ROOT" <<'CASES_PY'
from pathlib import Path
import hashlib, json, os, shutil, stat, subprocess, sys
publisher, base, work, script_root = map(Path, sys.argv[1:])
work = (work / 'contracts').resolve()
work.mkdir()
count = 0
preview = 'https://familytravelsite-integration-preview.lmisael0721.workers.dev'
production = 'https://familytravelsite.lmisael0721.workers.dev'
version = os.environ['WORKERS_VERSION_ID']
# Construct the intentional scanner hit only in the private disposable fixture.
negative = 'pk.' + 'unreviewedpublicationnegative' + 'x' * 24

def run(args, cwd=None, env=None):
    return subprocess.run(list(map(str, args)), cwd=cwd, env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

def git(repo, *args):
    r = run(['git', '-C', repo, *args])
    assert r.returncode == 0, 'fixture Git operation failed'
    return r.stdout.strip()

def fixture(name):
    repo = work / name
    git(work, 'clone', '--quiet', '--no-hardlinks', base, repo)
    git(repo, 'config', 'user.name', 'Publisher Test')
    git(repo, 'config', 'user.email', 'publisher-test@invalid')
    for name in ('LICENSE', 'package.json', 'package-lock.json', 'client/src/runtime.ts',
                 'server/runtime.ts', 'shared/types.ts', 'family-backend/runtime.ts',
                 '.env.example', 'scripts/build.sh'):
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('safe retained source\n')
    (repo/'scripts/build.sh').chmod(0o755)
    commit(repo)
    return repo

def commit(repo, subject='contract fixture'):
    git(repo, 'add', '-A', '--', '.')
    git(repo, 'commit', '--quiet', '--allow-empty', '-m', subject)

def publish(repo, name, args=(), environment=None):
    out = work / ('out-' + name)
    env = dict(os.environ) if environment is None else environment
    r = run(['bash', publisher, '--source-repo', repo, '--commit', 'HEAD',
             '--out', out, '--remote', work/'unused-local.git', *args], env=env)
    return r, out

def check(name, condition):
    global count
    assert condition, name
    count += 1
    print('PASS: ' + name, flush=True)

def refused(repo, name, args=(), environment=None, reason=None):
    r, out = publish(repo, name, args, environment)
    check(name, r.returncode != 0 and (reason is None or reason in r.stdout))
    check(name + ' created no mirror', not (out/'mirror').exists())
    return out

repo = fixture('safe')
r, out = publish(repo, 'preview', ['--check', '--origin', preview])
check('preview check succeeds', r.returncode == 0)
m = json.loads((out/'extract/RELEASE_MANIFEST.json').read_text())
check('preview immutable identity', m['origin'] == preview and m['workersVersionId'] == version
      and m['privateSourceCommit'] == m['privateProductionCommit'] == git(repo, 'rev-parse', 'HEAD')
      and m['publicSourceTag'].endswith('-'+git(repo, 'rev-parse', '--short=7', 'HEAD')))
check('no fabricated Workers Build ID', m['workersBuildUuid'] is None)
# Manifest is the only generated source addition; every original blob/mode remains.
files = [p for p in git(repo, 'ls-files', '-z').split('\0') if p]
check('all runtime build license bytes retained', all((out/'extract'/p).read_bytes() == (repo/p).read_bytes() for p in files))
check('executable mode retained', bool((out/'extract/scripts/build.sh').stat().st_mode & stat.S_IXUSR))
(repo/'.node-version').write_text('99\n')
r, nodeout = publish(repo, 'archived-node', ['--check'])
check('Node comes from commit not dirty worktree', r.returncode == 0 and json.loads((nodeout/'extract/RELEASE_MANIFEST.json').read_text())['node'] == '22')
(repo/'.node-version').write_text('22\n')
env = dict(os.environ)
env.pop('WORKERS_VERSION_ID', None)
r, unbound = publish(repo, 'unbound', ['--check'], env)
m = json.loads((unbound/'extract/RELEASE_MANIFEST.json').read_text())
check('production default and honest unbound check', r.returncode == 0 and m['origin'] == production and m['workersVersionId'] is None and m['deploymentBinding'] == 'check-only-unbound')
refused(repo, 'push-without-version', ['--push'], env, 'Publication requires')
for i, origin in enumerate(('http://'+preview[8:], preview+'/', preview+'/dashboard',
                            preview+'?token=x', preview+'#fragment', preview+':443',
                            'https://user:pass@'+preview[8:], preview+'.invalid', 'https://example.com')):
    refused(repo, 'invalid-origin-'+str(i), ['--check', '--origin', origin], reason='Unsupported deployment origin')
for i, remote in enumerate(('https://user:pass@example.com/source.git', 'https://example.com/source.git?token=x', 'https://example.com/source.git#fragment', 'ssh://user@example.com/source.git')):
    refused(repo, 'credential-remote-'+str(i), ['--remote', remote], reason='credential-free HTTPS')
for key in ('WORKERS_VERSION_ID', 'WORKERS_BUILD_UUID'):
    invalid = dict(os.environ); invalid[key] = 'invalid-value'
    refused(repo, 'invalid-'+key, ['--check'], invalid, 'Invalid '+key)
r = run(['bash', publisher, '--source-repo', repo, '--check', '--out', out, '--remote', work/'unused-local.git'])
check('reusing output fails closed', r.returncode != 0 and 'fresh --out' in r.stdout)

plan = '.cursor/plans/existing-family-backend-integration.plan.md'
if (script_root/plan).is_file():
    reviewed = fixture('reviewed')
    p = reviewed/plan; p.parent.mkdir(parents=True); p.write_bytes((script_root/plan).read_bytes())
    plan_digest = hashlib.sha256(p.read_bytes()).hexdigest()
    commit(reviewed)
    r, clean = publish(reviewed, 'reviewed-plan', ['--check'])
    check('reviewed plan omitted only from extract', r.returncode == 0 and not (clean/'extract'/plan).exists() and p.is_file())
    m = json.loads((clean/'extract/RELEASE_MANIFEST.json').read_text())
    a = m['sanitization']
    check('omission receipt exact path hash size reason', len(a['omissions']) == 1 and a['omissions'][0]['path'] == plan
          and a['omissions'][0]['sha256'] == plan_digest and a['omissions'][0]['bytes'] == len(p.read_bytes()) and bool(a['omissions'][0]['reason'])
          and a['sourceFilesRetained'] == a['trackedFiles'] - 1 and a['allRetainedBytesAndModesMatchGit'])
    check('private source plan unchanged', hashlib.sha256(p.read_bytes()).hexdigest() == plan_digest)
    p.write_text(p.read_text()+'changed\n'); commit(reviewed)
    refused(reviewed, 'changed-reviewed-plan', reason='Reviewed private plan changed')
    p.write_bytes((script_root/plan).read_bytes()); p.chmod(0o755); commit(reviewed)
    refused(reviewed, 'executable-reviewed-plan', reason='Reviewed private plan changed')
else:
    print('SKIP: exact private-plan cases require the private qualification checkout', flush=True)

for i, name in enumerate(('.cursor/plans/unexpected.md', '.env.production', '.env.local', '.dev.vars.preview',
                          '.npmrc', 'private.pem', '.wrangler/config.json', 'node_modules/fixture/index.js', 'client/dist/index.js')):
    other = fixture('forbidden-'+str(i)); f = other/name; f.parent.mkdir(parents=True, exist_ok=True); f.write_text('safe\n'); commit(other)
    refused(other, 'forbidden-'+str(i), reason='forbidden paths')
for name, subject in (('body', 'safe subject'), ('subject', negative)):
    other = fixture('negative-'+name)
    if name == 'body': (other/'innocent.txt').write_text(negative+'\n')
    commit(other, subject)
    refused(other, 'secret-'+name, reason='MAPBOX_PK')

sentinel = work/'outside'; sentinel.mkdir(); (sentinel/'keep').write_text('untouched\n')
for name, target in (('external-leaf', sentinel/'keep'), ('parent-link', sentinel), ('internal-link', 'README.md')):
    other = fixture(name); (other/'link').symlink_to(target); commit(other)
    refused(other, name, reason='Source tree contains a link')
check('source links never traversed', (sentinel/'keep').read_text() == 'untouched\n' and list(sentinel.iterdir()) == [sentinel/'keep'])
(work/'out-root-link').symlink_to(sentinel, target_is_directory=True)
refused(repo, 'root-link', reason='Output root must be a real directory')
rootlink = work/'out-extract-link'; rootlink.mkdir(); (rootlink/'extract').symlink_to(sentinel, target_is_directory=True)
refused(repo, 'extract-link', reason='fresh --out')
check('output links never traversed', list(sentinel.iterdir()) == [sentinel/'keep'])
other = fixture('gitlink'); git(other, 'update-index', '--add', '--cacheinfo', '160000,'+git(other,'rev-parse','HEAD')+',vendor/module')
git(other, 'commit', '--quiet', '-m', 'gitlink fixture')
refused(other, 'gitlink', reason='Source tree contains a link')
other = fixture('export-ignore'); (other/'.gitattributes').write_text('client/src/runtime.ts export-ignore\n'); commit(other)
refused(other, 'export-ignore', reason='Archive omitted or added tracked source')
other = fixture('manifest-collision'); (other/'RELEASE_MANIFEST.json').write_text('{}\n'); commit(other)
refused(other, 'manifest-collision', reason='conflicts with generated release metadata')

# Deterministic sequencing only. Real Node scanner still inspects both artifacts.
shim = work/'shim'; shim.mkdir()
(shim/'npm').write_text("""#!/usr/bin/env python3
import os, pathlib, sys
with open(os.environ['PUBLISH_TEST_LOG'], 'a') as log:
    log.write(str(pathlib.Path.cwd()) + '|' + ' '.join(sys.argv[1:]) + '\\n')
if sys.argv[1:] == ['run', 'build:web']:
    with open(os.environ['PUBLISH_TEST_SOURCE_LOG'], 'a') as log:
        log.write(os.environ.get('FAMILY_SOURCE_COMMIT', '<missing>') + '\\n')
    dependencies = pathlib.Path('node_modules'); dependencies.mkdir(exist_ok=True)
    (dependencies/'generated.txt').write_text('generated dependency fixture')
    p = pathlib.Path('client/dist'); p.mkdir(parents=True, exist_ok=True)
    (p/'index.js').write_text(os.environ.get('PUBLISH_TEST_DIST', 'safe build sequence'))
""")
(shim/'npm').chmod(0o755)
env = dict(os.environ); env['PATH'] = str(shim)+os.pathsep+env['PATH']; env['PUBLISH_TEST_LOG'] = str(work/'npm.log')
env['PUBLISH_TEST_SOURCE_LOG'] = str(work/'source-commit.log')
env['FAMILY_SOURCE_COMMIT'] = 'b'*40  # Operator input must not override immutable build identity.
r, build = publish(repo, 'build-sequence', ['--check', '--verify-build'], env)
lines = (work/'npm.log').read_text().splitlines()
check('build commands execute only in separate clean build copy in order', r.returncode == 0 and lines == [str(build/'build')+'|ci', str(build/'build')+'|run build:web'])
check('build source binding overrides inherited value with exact immutable commit',
      (work/'source-commit.log').read_text().splitlines() == [git(repo, 'rev-parse', 'HEAD')])
check('dist scan passes immutable expected source commit explicitly',
      '--source-commit="$FULL_SHA"' in publisher.read_text())
check('build artifacts never enter source snapshot', not (build/'extract/client/dist').exists() and not (build/'extract/node_modules').exists())
bare = work/'build-publication.git'; git(work, 'init', '--bare', bare)
r, published = publish(repo, 'build-publish', ['--push', '--verify-build', '--remote', str(bare)], env)
check('verified build publishes source only', r.returncode == 0 and not any(p.startswith(('node_modules/', 'client/dist/')) for p in git(bare, 'ls-tree', '-r', '--name-only', 'refs/heads/main').splitlines()))
env['PUBLISH_TEST_DIST'] = negative
refused(repo, 'dist-secret', ['--check', '--verify-build'], env, 'MAPBOX_PK')
print('contract_cases_passed='+str(count), flush=True)
CASES_PY

echo
echo "passed=$PASS failed=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
