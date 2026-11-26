import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../../", import.meta.url));
let fixture;
const manifestPath = "docs/family-backend-carryover.json";
const original = readFileSync(resolve(root, manifestPath));
const manifest = JSON.parse(original);
const hash = (b) => createHash("sha256").update(b).digest("hex");
before(() => {
  fixture = mkdtempSync(resolve(tmpdir(), "carryover-command-test-"));
  execFileSync("git", [
    "clone",
    "--quiet",
    "--shared",
    "--no-checkout",
    "--",
    root,
    fixture,
  ]);
  // Git supplies immutable history; only the audited source/manifest/patches are copied.
  for (const path of [
    "family-backend/src",
    "family-backend/package.json",
    "docs/family-backend-patches",
    manifestPath,
  ]) {
    mkdirSync(dirname(resolve(fixture, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(fixture, path), { recursive: true });
  }
});
after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
function run() {
  return spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/family/check-backend-carryover.mjs"),
      "--root",
      fixture,
    ],
    { encoding: "utf8" },
  );
}
function edit(path, bytes, action) {
  const full = resolve(fixture, path),
    previous = readFileSync(full);
  writeFileSync(full, bytes);
  try {
    action();
  } finally {
    writeFileSync(full, previous);
  }
}
function reject(action, message) {
  action();
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}
test("actual carryover command reconstructs recorded patches against trusted Git history", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /9 verified local patches; 38 recorded additions/);
});
test("rejects changed carried source", () => {
  const path = manifest.files.find(
    (e) => !manifest.localPatches.some((p) => p.path === e.path),
  ).path;
  edit(path, "// changed\n", () => reject(() => {}, /Modified import/));
});
test("rejects modified patch bytes", () => {
  const p = manifest.localPatches[0];
  edit(p.patch, "changed\n", () => reject(() => {}, /Modified patch/));
});
test("rejects a patch applied against a different base", () => {
  const m = structuredClone(manifest);
  m.localPatches[0].baseSha256 = "0".repeat(64);
  edit(manifestPath, JSON.stringify(m), () =>
    reject(() => {}, /Wrong patch base/),
  );
});
test("rejects a changed patch target even with a matching patch checksum", () => {
  const m = structuredClone(manifest),
    p = m.localPatches[0],
    bytes = readFileSync(resolve(fixture, p.patch), "utf8").replaceAll(
      p.path,
      "family-backend/src/other.ts",
    );
  p.patchSha256 = hash(bytes);
  edit(p.patch, bytes, () =>
    edit(manifestPath, JSON.stringify(m), () =>
      reject(() => {}, /Patch target mismatch/),
    ),
  );
});
test("rejects unrecorded source additions", () => {
  const f = resolve(fixture, "family-backend/src/unrecorded.ts");
  writeFileSync(f, "export const x = 1;");
  try {
    reject(() => {}, /Unrecorded source file/);
  } finally {
    rmSync(f);
  }
});
test("rejects a modified recorded addition", () => {
  edit(manifest.additions[0].path, "// changed\n", () =>
    reject(() => {}, /Modified addition/),
  );
});
for (const addition of manifest.additions.slice(1)) {
  test(`rejects modified recorded addition ${addition.path}`, () => {
    edit(addition.path, "// changed\n", () =>
      reject(() => {}, /Modified addition/),
    );
  });
}
test("rejects dependency drift", () => {
  const p = "family-backend/package.json",
    m = JSON.parse(readFileSync(resolve(fixture, p)));
  m.dependencies["@supabase/supabase-js"] = "latest";
  edit(p, JSON.stringify(m), () => reject(() => {}, /latest/));
});
test("rejects a patch without a baseline entry", () => {
  const m = structuredClone(manifest);
  m.localPatches.push({
    ...m.localPatches[0],
    path: "family-backend/src/missing.ts",
  });
  edit(manifestPath, JSON.stringify(m), () =>
    reject(() => {}, /unrecorded baseline/),
  );
});

test("default command resolves its checkout independently of caller cwd", () => {
  const r = spawnSync(
    process.execPath,
    [resolve(root, "scripts/family/check-backend-carryover.mjs")],
    {
      cwd: fixture,
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /9 verified local patches/);
});

for (const name of ["nagerHolidays.ts", "nagerHolidays.test.ts"]) {
  test(`rejects modified holiday patch ${name}`, () => {
    const patch = manifest.localPatches.find(
      (p) => p.path === "family-backend/src/data/supabase/" + name,
    );
    assert.ok(patch, "The reviewed holiday patch must exist");
    edit(patch.patch, "changed\n", () => reject(() => {}, /Modified patch/));
  });
  test(`rejects modified qualified holiday source ${name}`, () => {
    edit("family-backend/src/data/supabase/" + name, "// changed\n", () =>
      reject(() => {}, /Modified import/),
    );
  });
}

for (const name of ["catalogDiscovery.ts", "catalogDiscovery.test.ts"]) {
  test(`rejects omitted catalog registration ${name}`, () => {
    const m = structuredClone(manifest);
    const path = "family-backend/src/data/supabase/" + name;
    assert.ok(
      m.additions.some((entry) => entry.path === path),
      "Reviewed catalog registration must exist",
    );
    m.additions = m.additions.filter((entry) => entry.path !== path);
    edit(manifestPath, JSON.stringify(m), () => {
      const r = run();
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Unrecorded source file/);
      assert.ok(
        r.stderr.includes(name),
        "The missing catalog registration must be the rejected path",
      );
    });
  });
}

for (const name of [
  "collectionLibrary.ts",
  "collectionLibraryRpc.ts",
  "collectionLibrary.test.ts",
  "collectionRpc.ts",
  "collectionRpc.test.ts",
]) {
  const path = "family-backend/src/data/supabase/" + name;
  test(`rejects omitted Collection library registration ${name}`, () => {
    const m = structuredClone(manifest);
    assert.ok(
      m.additions.some((entry) => entry.path === path),
      "Reviewed Collection registration must exist",
    );
    m.additions = m.additions.filter((entry) => entry.path !== path);
    edit(manifestPath, JSON.stringify(m), () => {
      const r = run();
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Unrecorded source file/);
      assert.ok(
        r.stderr.includes(name),
        "The missing library registration must be the rejected path",
      );
    });
  });
  test(`rejects modified Collection library source ${name}`, () => {
    edit(path, "// changed\n", () => reject(() => {}, /Modified addition/));
  });
}
