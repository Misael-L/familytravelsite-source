#!/usr/bin/env bash
# Disposable-remote tests for corresponding-source atomic publication.
# Never uses the operator remotes. Cleans up all temp dirs on exit.
set -euo pipefail

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
if bash "$PUBLISH" --source-repo "$SRC" --commit HEAD --push --out "$OUT1" --remote "$BARE"; then
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
if diff -rq --exclude=.git "$CLONE" "$OUT1/extract" >/dev/null; then
  pass "clone tree equals extract"
else
  fail "clone tree equals extract"
fi
require "clone HEAD is published main" test "$(git -C "$CLONE" rev-parse refs/heads/main)" = "$MAIN1"

echo "== disposable git add -A stayed inside mirror =="
if git -C "$OUT1/mirror" ls-files | grep -q 'FamilyTravelSite/client/src'; then
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

echo
echo "passed=$PASS failed=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
