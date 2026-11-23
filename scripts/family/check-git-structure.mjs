#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyPinnedHistory } from "./release-contract.mjs";
import { verifyNativePresentation } from "./native-presentation-contract.mjs";
import { verifyQualifiedSource } from "./check-qualified-source.mjs";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const config = JSON.parse(
  readFileSync(resolve(root, ".github/family-release.json"), "utf8"),
);
const presentation = JSON.parse(
  readFileSync(
    resolve(root, "docs/family-integration/native-presentation.json"),
    "utf8",
  ),
);
const { initial: base, pin } = verifyPinnedHistory(config, presentation, git);
const source = JSON.parse(
  readFileSync(
    resolve(root, "docs/family-integration/qualified-source.json"),
    "utf8",
  ),
);
const qualified = verifyQualifiedSource(root, source, pin);
verifyNativePresentation(presentation, {
  readUpstream: (commit, name) =>
    execFileSync("git", ["show", `${commit}:${name}`], { cwd: root }),
  readCurrent: (name) => readFileSync(resolve(root, name)),
});
const hook = resolve(root, ".githooks/pre-push");
assert.ok(statSync(hook).mode & 0o111, "pre-push hook must be executable");
const line = (ref) =>
  `refs/heads/test ${base.importCommit} ${ref} ${"0".repeat(40)}\n`;
const guard = (remote, url, ref) =>
  spawnSync("sh", [hook, remote, url], { input: line(ref), encoding: "utf8" });
assert.equal(
  guard(
    "origin",
    "https://github.com/Misael-L/FamilyTravelSite.git",
    "refs/heads/codex/test",
  ).status,
  0,
);
assert.equal(
  guard(
    "origin",
    "https://github.com/Misael-L/FamilyTravelSite.git",
    "refs/tags/family-2026.10.29.1-rc.1",
  ).status,
  0,
);
for (const [remote, url, ref] of [
  [
    "origin",
    "https://github.com/Misael-L/FamilyTravelSite.git",
    "refs/heads/main",
  ],
  ["upstream", "https://github.com/liketrek/TREK", "refs/heads/codex/test"],
  ["origin", "https://github.com/another/repo.git", "refs/heads/codex/test"],
  [
    "origin",
    "https://github.com/Misael-L/FamilyTravelSite.git",
    "refs/tags/v5.0.1",
  ],
  [
    "origin",
    "https://github.com/Misael-L/FamilyTravelSite.git",
    "refs/tags/plugin-sdk-v1.0.0",
  ],
])
  assert.notEqual(
    guard(remote, url, ref).status,
    0,
    `push guard accepted ${remote} ${ref}`,
  );
if (process.argv.includes("--local")) {
  assert.equal(
    git("remote", "get-url", "origin"),
    "https://github.com/Misael-L/FamilyTravelSite.git",
  );
  assert.equal(
    git("remote", "get-url", "--push", "upstream"),
    "disabled://upstream-read-only",
  );
  assert.equal(git("config", "--get", "core.hooksPath"), ".githooks");
  assert.equal(git("config", "--get", "remote.pushDefault"), "origin");
}
console.log(
  `Family migration guard passed: original import, ${pin.trekVersion} ancestry/pins, ${qualified.upstreamPaths} upstream paths, ${qualified.explicitExceptions} explicit source exceptions, ${qualified.explicitApplicationAdditions} application additions and seven push-guard cases.`,
);
