import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  INITIAL_IMPORT,
  EXACT_NATIVE_FILES,
  validateReleasePins,
  verifyPinnedHistory,
} from "./release-contract.mjs";

const config = JSON.parse(
  readFileSync(
    new URL("../../.github/family-release.json", import.meta.url),
    "utf8",
  ),
);
const presentation = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/family-integration/native-presentation.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const clone = (value) => structuredClone(value);
function history(fault) {
  const calls = [];
  const git = (...args) => {
    calls.push(args);
    if (fault?.(...args)) throw Error("Deliberate missing reference/ancestry");
    if (args[0] === "merge-base") return "";
    if (args[0] === "show" && args[2] === "--format=%P")
      return `${INITIAL_IMPORT.familyCommit} ${INITIAL_IMPORT.trekCommit}`;
    if (args[0] === "show")
      return JSON.stringify({ version: config.baseline.trekVersion });
    if (
      args[1] === `${INITIAL_IMPORT.importCommit}^{tree}` ||
      args[1] === `${INITIAL_IMPORT.trekCommit}^{tree}`
    )
      return "same-original-tree";
    const refs = new Map([
      [`${INITIAL_IMPORT.trekTag}^{commit}`, INITIAL_IMPORT.trekCommit],
      [`${INITIAL_IMPORT.familyTag}^{commit}`, INITIAL_IMPORT.familyCommit],
      [`${config.baseline.trekTag}^{commit}`, config.baseline.trekCommit],
    ]);
    assert.ok(refs.has(args[1]), "Unexpected Git request");
    return refs.get(args[1]);
  };
  return { git, calls };
}
test("adopted baseline and original exact import have separate complete proofs", () => {
  const fake = history();
  const result = verifyPinnedHistory(config, presentation, fake.git);
  assert.deepEqual(result.initial, INITIAL_IMPORT);
  assert.equal(result.pin.trekVersion, "5.1.4");
  assert.ok(
    fake.calls.some(
      (args) =>
        args.join(" ") ===
        `merge-base --is-ancestor ${config.baseline.trekCommit} ${config.baseline.qualificationCommit}`,
    ),
  );
  assert.deepEqual(presentation.exact_files, EXACT_NATIVE_FILES);
});
for (const key of Object.keys(INITIAL_IMPORT))
  test(`rejects altered immutable original import ${key}`, () => {
    const changed = clone(config);
    changed.initialImport[key] += "-changed";
    assert.throws(() => validateReleasePins(changed, presentation));
  });
for (const [label, mutate] of [
  [
    "stale accepted integration branch",
    (c) => {
      c.branches.integration = "codex/trek-v5.1.2-family-reconcile";
    },
  ],
  [
    "old schema",
    (c) => {
      c.schemaVersion = 1;
    },
  ],
  [
    "wrong repository",
    (c) => {
      c.repository = "another/repo";
    },
  ],
  [
    "unreviewed integration branch",
    (c) => {
      c.branches.integration = "main";
    },
  ],
  [
    "production branch change",
    (c) => {
      c.branches.production = "other";
    },
  ],
  [
    "automatic deployment",
    (c) => {
      c.deployment.integrationAutoDeploy = true;
    },
  ],
  [
    "release tag pattern change",
    (c) => {
      c.releases.familyTagPattern = "v*";
    },
  ],
  [
    "source mirror change",
    (c) => {
      c.releases.sourceMirror = "another/mirror";
    },
  ],
  [
    "import fields mixed into current baseline",
    (c) => {
      c.baseline.importCommit = INITIAL_IMPORT.importCommit;
    },
  ],
  [
    "mismatched target tag",
    (c) => {
      c.baseline.trekTag = "trek-v5.0.1";
    },
  ],
  [
    "malformed qualification identity",
    (c) => {
      c.baseline.qualificationCommit = "HEAD";
    },
  ],
])
  test(`rejects ${label}`, () => {
    const c = clone(config);
    mutate(c);
    assert.throws(() => validateReleasePins(c, presentation));
  });
for (const [label, mutate] of [
  ["removed protected file", (p) => p.exact_files.pop()],
  [
    "duplicate protected file",
    (p) => {
      p.exact_files[1] = p.exact_files[0];
    },
  ],
  [
    "outside source path",
    (p) => {
      p.exact_files[0] = "../other.ts";
    },
  ],
  [
    "other upstream repository",
    (p) => {
      p.source_repository = "https://other.invalid";
    },
  ],
  [
    "different source version",
    (p) => {
      p.source_version = "5.0.1";
    },
  ],
  [
    "different source commit",
    (p) => {
      p.upstream_commit = INITIAL_IMPORT.trekCommit;
    },
  ],
])
  test(`rejects ${label}`, () => {
    const p = clone(presentation);
    mutate(p);
    assert.throws(() => validateReleasePins(config, p));
  });
test("missing current or original tags and missing qualification ancestry cannot pass", () => {
  for (const predicate of [
    (...args) => args.includes(`${config.baseline.trekTag}^{commit}`),
    (...args) => args.includes(`${INITIAL_IMPORT.familyTag}^{commit}`),
    (...args) =>
      args[0] === "merge-base" &&
      args.includes(config.baseline.qualificationCommit),
  ])
    assert.throws(() =>
      verifyPinnedHistory(config, presentation, history(predicate).git),
    );
});
test("wrong import parents, altered original tree, moved tag and wrong upstream package version cannot pass", () => {
  for (const corrupt of [
    (args) => args[0] === "show" && args[2] === "--format=%P",
    (args) =>
      args[0] === "rev-parse" &&
      args[1] === `${INITIAL_IMPORT.importCommit}^{tree}`,
    (args) =>
      args[0] === "rev-parse" &&
      args[1] === `${config.baseline.trekTag}^{commit}`,
    (args) => args[0] === "show" && args[1].endsWith(":client/package.json"),
  ]) {
    const fake = history();
    assert.throws(() =>
      verifyPinnedHistory(config, presentation, (...args) =>
        corrupt(args) ? "corrupt" : fake.git(...args),
      ),
    );
  }
});
