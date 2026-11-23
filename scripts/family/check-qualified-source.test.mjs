import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  APPLICATION_ROOTS,
  applicationPath,
  sourceTree,
  verifyQualifiedSource,
} from "./check-qualified-source.mjs";

const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function put(root, path, data) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "family-source-contract-"));
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@invalid");
  put(root, ".gitignore", ".env\n");
  put(root, "client/src/exact.ts", "exact target\n");
  put(root, "client/src/bridge.ts", "target connector\n");
  put(root, "server/removed.ts", "deliberately omitted source\n");
  git(root, "add", "--all");
  git(root, "commit", "-m", "Upstream target");
  const target = git(root, "rev-parse", "HEAD");
  put(root, "client/src/bridge.ts", "qualified connector\n");
  put(root, "family-backend/src/own.ts", "qualified backend\n");
  rmSync(join(root, "server/removed.ts"));
  git(root, "add", "--all");
  git(root, "commit", "-m", "Qualified Family source");
  const accepted = git(root, "rev-parse", "HEAD");
  const upstream = sourceTree(root, target),
    qualified = sourceTree(root, accepted);
  const row = (path) => ({
    path,
    upstream: upstream.get(path) ?? null,
    qualified: qualified.get(path) ?? null,
    purpose: "Explicit qualified connector/source reconciliation",
  });
  const contract = {
    schemaVersion: 1,
    sourceRepository: "https://github.com/liketrek/TREK",
    sourceVersion: "5.1.2",
    targetCommit: target,
    qualifiedCommit: accepted,
    applicationRoots: [...APPLICATION_ROOTS],
    exceptions: [row("client/src/bridge.ts"), row("server/removed.ts")],
    additions: [row("family-backend/src/own.ts")],
  };
  const pin = {
    trekCommit: target,
    qualificationCommit: accepted,
    trekVersion: "5.1.2",
  };
  return {
    root,
    contract,
    pin,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function checked(name, fn) {
  test(name, () => {
    const f = fixture();
    try {
      fn(f);
    } finally {
      f.cleanup();
    }
  });
}
checked(
  "verifies all upstream paths, exact Family exceptions, additions and committed removals",
  (f) => {
    const before = git(f.root, "status", "--porcelain"),
      head = git(f.root, "rev-parse", "HEAD");
    const r = verifyQualifiedSource(f.root, f.contract, f.pin);
    assert.equal(r.upstreamPaths, 4);
    assert.equal(r.explicitExceptions, 2);
    assert.equal(r.explicitApplicationAdditions, 1);
    assert.equal(git(f.root, "status", "--porcelain"), before);
    assert.equal(git(f.root, "rev-parse", "HEAD"), head);
  },
);
for (const name of [
  "client/src/exact.ts",
  "client/src/bridge.ts",
  "family-backend/src/own.ts",
])
  checked(`rejects byte drift in ${name}`, (f) => {
    put(f.root, name, "unqualified code\n");
    assert.throws(() => verifyQualifiedSource(f.root, f.contract, f.pin));
  });
for (const [label, mutate] of [
  ["missing native exception", (c) => c.exceptions.pop()],
  ["missing addition", (c) => c.additions.pop()],
  [
    "duplicate exception",
    (c) => c.exceptions.push(structuredClone(c.exceptions[0])),
  ],
  [
    "uncommitted hash approval",
    (c) => {
      c.exceptions[0].qualified.oid = "0".repeat(40);
    },
  ],
  [
    "wrong target hash",
    (c) => {
      c.exceptions[0].upstream.oid = "0".repeat(40);
    },
  ],
  [
    "blank purpose",
    (c) => {
      c.exceptions[0].purpose = " ";
    },
  ],
  [
    "path traversal",
    (c) => {
      c.exceptions[0].path = "../outside";
    },
  ],
  ["removed execution root", (c) => c.applicationRoots.pop()],
  [
    "different target",
    (c) => {
      c.targetCommit = "0".repeat(40);
    },
  ],
  [
    "future schema",
    (c) => {
      c.schemaVersion = 2;
    },
  ],
])
  checked(`rejects ${label}`, (f) => {
    mutate(f.contract);
    assert.throws(() => verifyQualifiedSource(f.root, f.contract, f.pin));
  });
checked(
  "rejects untracked application additions without leaking ignored credentials",
  (f) => {
    put(f.root, ".env", "DO_NOT_REPORT_SECRET");
    verifyQualifiedSource(f.root, f.contract, f.pin);
    put(f.root, "client/src/new.ts", "new code\n");
    assert.throws(
      () => verifyQualifiedSource(f.root, f.contract, f.pin),
      /Unreviewed application source addition/,
    );
  },
);
checked(
  "rejects restored deleted native source and executable mode drift",
  (f) => {
    put(f.root, "server/removed.ts", "unexpected restored file");
    assert.throws(() => verifyQualifiedSource(f.root, f.contract, f.pin));
    rmSync(join(f.root, "server/removed.ts"));
    chmodSync(join(f.root, "client/src/exact.ts"), 0o755);
    assert.throws(
      () => verifyQualifiedSource(f.root, f.contract, f.pin),
      /mode/,
    );
  },
);
checked(
  "does not follow a file or directory symlink outside the checkout",
  (f) => {
    const outside = mkdtempSync(join(tmpdir(), "family-outside-source-"));
    try {
      put(outside, "exact.ts", "exact target\n");
      rmSync(join(f.root, "client/src/exact.ts"));
      symlinkSync(
        join(outside, "exact.ts"),
        join(f.root, "client/src/exact.ts"),
      );
      assert.throws(
        () => verifyQualifiedSource(f.root, f.contract, f.pin),
        /mode/,
      );
      rmSync(join(f.root, "client/src"), { recursive: true });
      symlinkSync(outside, join(f.root, "client/src"));
      assert.throws(
        () => verifyQualifiedSource(f.root, f.contract, f.pin),
        /symlink/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  },
);
checked(
  "rejects a stale qualification snapshot that would discard accepted connectors",
  (f) => {
    f.pin.qualificationCommit = f.pin.trekCommit;
    f.contract.qualifiedCommit = f.pin.trekCommit;
    assert.throws(() => verifyQualifiedSource(f.root, f.contract, f.pin));
  },
);
test("application roots contain actual runtime/build/test support, not documentation/tooling overrides", () => {
  for (const p of [
    "client/src/main.tsx",
    "client/public/_headers",
    "family-backend/package.json",
    "shared/src/types.ts",
    "server/assets/map.gz",
  ])
    assert.ok(applicationPath(p));
  assert.equal(
    applicationPath("docs/family-integration/qualified-source.json"),
    false,
  );
  assert.equal(
    applicationPath("scripts/family/check-qualified-source.mjs"),
    false,
  );
});
