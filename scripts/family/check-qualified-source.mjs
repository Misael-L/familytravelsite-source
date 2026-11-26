import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleasePins } from "./release-contract.mjs";

export const APPLICATION_ROOTS = Object.freeze([
  "client/",
  "server/",
  "shared/",
  "family-backend/",
  "family-shared/",
]);
const git = (root, args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
export function sourceTree(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  return new Map(
    git(root, ["ls-tree", "-r", "-z", "-l", commit])
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf("\t"),
          [mode, kind, oid, size] = line.slice(0, tab).trim().split(/\s+/);
        assert.equal(
          kind,
          "blob",
          "Gitlinks require explicit qualification, not implicit source traversal",
        );
        return [line.slice(tab + 1), { mode, oid, bytes: Number(size) }];
      }),
  );
}
const same = (a, b) => a?.mode === b?.mode && a?.oid === b?.oid;
export const applicationPath = (name) =>
  APPLICATION_ROOTS.some((prefix) => name.startsWith(prefix));
function safePath(root, name) {
  assert.ok(
    typeof name === "string" &&
      !path.isAbsolute(name) &&
      !name.split("/").some((p) => !p || p === "." || p === ".."),
    "Invalid source path",
  );
  const absolute = path.resolve(root, name);
  assert.ok(absolute.startsWith(root + path.sep), "Source escaped checkout");
  let parent = root;
  for (const part of name.split("/").slice(0, -1)) {
    parent = path.join(parent, part);
    try {
      assert.ok(
        !lstatSync(parent).isSymbolicLink(),
        `Source directory is a symlink: ${name}`,
      );
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return absolute;
}
function verifyFile(root, name, expected) {
  const absolute = safePath(root, name),
    stat = lstatSync(absolute);
  const mode = stat.isSymbolicLink()
    ? "120000"
    : stat.isFile()
      ? stat.mode & 0o111
        ? "100755"
        : "100644"
      : null;
  assert.equal(mode, expected.mode, `Source mode/type changed: ${name}`);
  assert.ok(
    Number.isSafeInteger(expected.bytes) &&
      expected.bytes >= 0 &&
      expected.bytes <= 32 * 1024 * 1024,
    "Unsupported qualified source size",
  );
  if (!stat.isSymbolicLink())
    assert.equal(stat.size, expected.bytes, `Source size changed: ${name}`);
  const bytes = stat.isSymbolicLink()
    ? readlinkSync(absolute, { encoding: "buffer" })
    : readFileSync(absolute);
  assert.equal(bytes.length, expected.bytes, `Source size changed: ${name}`);
  const oid = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  assert.equal(oid, expected.oid, `Unqualified source drift: ${name}`);
}

/** Every upstream path and every qualified Family application addition is checked. */
export function verifyQualifiedSource(root, contract, pin) {
  root = path.resolve(root);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.sourceRepository, "https://github.com/liketrek/TREK");
  assert.equal(contract.targetCommit, pin.trekCommit);
  assert.equal(contract.sourceVersion, pin.trekVersion);
  assert.equal(contract.qualifiedCommit, pin.qualificationCommit);
  assert.deepEqual(contract.applicationRoots, APPLICATION_ROOTS);
  for (const ref of [pin.trekCommit, pin.qualificationCommit])
    git(root, ["merge-base", "--is-ancestor", ref, "HEAD"]);
  git(root, [
    "merge-base",
    "--is-ancestor",
    pin.trekCommit,
    pin.qualificationCommit,
  ]);
  const target = sourceTree(root, pin.trekCommit),
    qualified = sourceTree(root, pin.qualificationCommit);
  const expectedExceptions = new Map(
    [...target].filter(([name, entry]) => !same(entry, qualified.get(name))),
  );
  const expectedAdditions = new Map(
    [...qualified].filter(
      ([name]) => !target.has(name) && applicationPath(name),
    ),
  );
  const checkedRows = (rows, expected, kind) => {
    assert.ok(Array.isArray(rows));
    const seen = new Set();
    for (const row of rows) {
      safePath(root, row.path);
      assert.ok(
        !seen.has(row.path) && expected.has(row.path),
        `Unexpected/duplicate ${kind}: ${row.path}`,
      );
      seen.add(row.path);
      assert.ok(
        typeof row.purpose === "string" && row.purpose.trim().length >= 12,
        `Missing purpose: ${row.path}`,
      );
      assert.deepEqual(
        row.upstream,
        target.get(row.path) ?? null,
        `Wrong upstream identity: ${row.path}`,
      );
      assert.deepEqual(
        row.qualified,
        qualified.get(row.path) ?? null,
        `Exception is not committed qualified source: ${row.path}`,
      );
    }
    assert.equal(seen.size, expected.size, `Incomplete ${kind} coverage`);
  };
  checkedRows(contract.exceptions, expectedExceptions, "native exception");
  checkedRows(
    contract.additions,
    expectedAdditions,
    "Family application addition",
  );
  let exact = 0;
  for (const [name, entry] of target) {
    const accepted = expectedExceptions.has(name) ? qualified.get(name) : entry;
    if (!accepted) {
      assert.throws(() => lstatSync(safePath(root, name)), { code: "ENOENT" });
      continue;
    }
    verifyFile(root, name, accepted);
    if (!expectedExceptions.has(name)) exact++;
  }
  for (const [name, entry] of expectedAdditions) verifyFile(root, name, entry);
  const owned = git(root, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  for (const name of owned)
    if (applicationPath(name))
      assert.ok(
        target.has(name) || expectedAdditions.has(name),
        `Unreviewed application source addition: ${name}`,
      );
  return {
    upstreamPaths: target.size,
    exactUpstreamPaths: exact,
    explicitExceptions: expectedExceptions.size,
    explicitApplicationAdditions: expectedAdditions.size,
    qualifiedCommit: pin.qualificationCommit,
  };
}

function main(args) {
  assert.equal(
    args.length,
    0,
    "No mutable source overrides are accepted by this guard",
  );
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const config = JSON.parse(
    readFileSync(path.join(root, ".github/family-release.json"), "utf8"),
  );
  const presentation = JSON.parse(
    readFileSync(
      path.join(root, "docs/family-integration/native-presentation.json"),
      "utf8",
    ),
  );
  const { pin } = validateReleasePins(config, presentation);
  const contract = JSON.parse(
    readFileSync(
      path.join(root, "docs/family-integration/qualified-source.json"),
      "utf8",
    ),
  );
  console.log(JSON.stringify(verifyQualifiedSource(root, contract, pin)));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}
