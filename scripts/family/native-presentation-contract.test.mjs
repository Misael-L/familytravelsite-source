import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  EXACT_NATIVE_FILES,
  FAMILY_TRANSPORT_NATIVE_OVERLAYS,
  PROTECTED_NATIVE_FILES,
  SIDEBAR_REORDER_OVERLAY,
  deriveSidebarReorderTypeOverlay,
  validateNativePresentationManifest,
  verifyNativePresentation,
} from "./native-presentation-contract.mjs";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(
    new URL("docs/family-integration/native-presentation.json", root),
    "utf8",
  ),
);
const original = execFileSync(
  "git",
  [
    "show",
    `${SIDEBAR_REORDER_OVERLAY.upstream_commit}:${SIDEBAR_REORDER_OVERLAY.path}`,
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
// Independent expected edit; never generate the fixture with the verifier under test.
const reviewed = Buffer.from(
  original
    .toString("utf8")
    .replace(
      "  onReorder: (dayId: number, orderedIds: number[]) => void\n",
      "  onReorder: (dayId: number, orderedIds: number[]) => void | Promise<void>\n",
    ),
);
const sidebarWithTimeline = readFileSync(new URL(SIDEBAR_REORDER_OVERLAY.path, root));
const transportUpstream = FAMILY_TRANSPORT_NATIVE_OVERLAYS.map(({ path }) => [
  path,
  execFileSync("git", ["show", `${manifest.upstream_commit}:${path}`], { cwd: root }),
]);
const transportReviewed = FAMILY_TRANSPORT_NATIVE_OVERLAYS.map(({ path }) => [
  path,
  readFileSync(new URL(path, root)),
]);
function fixture() {
  const upstream = new Map(
    EXACT_NATIVE_FILES.map((name) => [
      name,
      Buffer.from(`Exact fixture ${name}`),
    ]),
  );
  upstream.set(SIDEBAR_REORDER_OVERLAY.path, original);
  for (const [path, bytes] of transportUpstream) upstream.set(path, bytes);
  const current = new Map(upstream);
  current.set(SIDEBAR_REORDER_OVERLAY.path, sidebarWithTimeline);
  for (const [path, bytes] of transportReviewed) current.set(path, bytes);
  return {
    current,
    upstream,
    io: {
      readUpstream: (commit, name) => {
        assert.equal(commit, "2bcfc1bfcbbff0affd097c0f789c835396389572");
        return upstream.get(name);
      },
      readCurrent: (name) => current.get(name),
    },
  };
}
test("retains all twelve protected files with fixed, reviewed overlays", () => {
  const covered = [
    ...EXACT_NATIVE_FILES,
    SIDEBAR_REORDER_OVERLAY.path,
    ...FAMILY_TRANSPORT_NATIVE_OVERLAYS.map(({ path }) => path),
  ];
  assert.equal(PROTECTED_NATIVE_FILES.length, 12);
  assert.equal(new Set(covered).size, 12);
  assert.deepEqual(covered.sort(), [...PROTECTED_NATIVE_FILES].sort());
  assert.deepEqual(verifyNativePresentation(manifest, fixture().io), {
    protectedFiles: 12,
    exactUpstreamFiles: 7,
    fixedTypeOnlyOverlays: 1,
    fixedFamilyTransportOverlays: 4,
    fixedFamilyTimelineOverlays: 1,
  });
});
test("the reviewed type edit produces byte-identical emitted JavaScript", () => {
  const options = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  };
  const emit = (data) =>
    ts.transpileModule(data.toString("utf8"), {
      fileName: "DayPlanSidebar.tsx",
      compilerOptions: options,
    }).outputText;
  assert.ok(reviewed.equals(deriveSidebarReorderTypeOverlay(original)));
  assert.equal(emit(reviewed), emit(original));
});
test("the old declaration cannot silently stand in for the required async contract", () => {
  const f = fixture();
  f.current.set(SIDEBAR_REORDER_OVERLAY.path, original);
  assert.throws(() => verifyNativePresentation(manifest, f.io));
});
test("refuses the Sidebar with only the type edit and no Family timeline guard", () => {
  const f = fixture();
  f.current.set(SIDEBAR_REORDER_OVERLAY.path, reviewed);
  assert.throws(() => verifyNativePresentation(manifest, f.io), /Sidebar differs/);
});
for (const [label, mutate] of [
  ["removed exact file", (p) => p.exact_files.pop()],
  ["removed timeline overlay", (p) => delete p.family_timeline_overlay],
  [
    "self-approved timeline digest",
    (p) => {
      p.family_timeline_overlay.derived_sha256 = "0".repeat(64);
    },
  ],
  ["removed Transport overlay", (p) => p.family_transport_overlays.pop()],
  [
    "wildcard Transport overlay",
    (p) => {
      p.family_transport_overlays[0].path = "client/src/**";
    },
  ],
  [
    "self-approved Transport digest",
    (p) => {
      p.family_transport_overlays[0].derived_sha256 = "0".repeat(64);
    },
  ],
  [
    "duplicate exact file",
    (p) => {
      p.exact_files[1] = p.exact_files[0];
    },
  ],
  [
    "removed overlay",
    (p) => {
      p.type_only_overlays = [];
    },
  ],
  [
    "missing overlay field",
    (p) => {
      delete p.type_only_overlays;
    },
  ],
  [
    "duplicate overlay",
    (p) => p.type_only_overlays.push(structuredClone(p.type_only_overlays[0])),
  ],
  [
    "overlay path traversal",
    (p) => {
      p.type_only_overlays[0].path = "../outside.tsx";
    },
  ],
  [
    "wildcard overlay",
    (p) => {
      p.type_only_overlays[0].path = "client/src/**";
    },
  ],
  [
    "different overlay ID",
    (p) => {
      p.type_only_overlays[0].id = "arbitrary";
    },
  ],
  [
    "self-approved upstream digest",
    (p) => {
      p.type_only_overlays[0].upstream_sha256 = "0".repeat(64);
    },
  ],
  [
    "self-approved result digest",
    (p) => {
      p.type_only_overlays[0].derived_sha256 = "0".repeat(64);
    },
  ],
  [
    "configurable replacement",
    (p) => {
      p.type_only_overlays[0].replacement = "anything";
    },
  ],
  [
    "unrecognized ignore field",
    (p) => {
      p.ignored_files = [SIDEBAR_REORDER_OVERLAY.path];
    },
  ],
  [
    "retargeted upstream",
    (p) => {
      p.upstream_commit = "0".repeat(40);
    },
  ],
  [
    "unreviewed upstream version",
    (p) => {
      p.source_version = "5.1.5";
    },
  ],
])
  test(`rejects ${label} before reading any files`, () => {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(() => validateNativePresentationManifest(changed));
    assert.throws(() =>
      verifyNativePresentation(changed, {
        readUpstream: () => assert.fail("must reject metadata first"),
        readCurrent: () => assert.fail("must reject metadata first"),
      }),
    );
  });
for (const [label, mutate] of [
  [
    "changed layout class",
    (s) => s.replace('className="', 'className="unreviewed '),
  ],
  [
    "discarded async save",
    (s) => s.replace("await onReorder(", "void onReorder("),
  ],
  [
    "changed Undo behavior",
    (s) => s.replace("pushUndo?.(", "pushUndo?.('unreviewed', "),
  ],
  [
    "unrelated callback type",
    (s) =>
      s.replace(
        "onReorderDays?: (orderedIds: number[]) => void",
        "onReorderDays?: (orderedIds: number[]) => any",
      ),
  ],
  [
    "any return-type escape",
    (s) => s.replace("=> void | Promise<void>", "=> any"),
  ],
  ["comment-only drift", (s) => s + "\n// unreviewed\n"],
  ["import drift", (s) => "import 'unreviewed';\n" + s],
])
  test(`rejects ${label} beyond the fixed Sidebar overlays`, () => {
    const f = fixture(),
      changed = mutate(sidebarWithTimeline.toString("utf8"));
    assert.ok(
      changed !== sidebarWithTimeline.toString("utf8"),
      "Mutation did not reach actual source",
    );
    f.current.set(SIDEBAR_REORDER_OVERLAY.path, Buffer.from(changed));
    assert.throws(() => verifyNativePresentation(manifest, f.io));
  });
for (const name of EXACT_NATIVE_FILES)
  test(`still rejects any byte drift in ${name}`, () => {
    const f = fixture();
    f.current.set(
      name,
      Buffer.concat([f.current.get(name), Buffer.from(" drift")]),
    );
    assert.throws(() => verifyNativePresentation(manifest, f.io));
  });
for (const { path } of FAMILY_TRANSPORT_NATIVE_OVERLAYS)
  test(`checks both upstream and reviewed source for ${path}`, () => {
    const f = fixture();
    const expected = f.current.get(path);
    f.current.set(path, f.upstream.get(path));
    assert.throws(() => verifyNativePresentation(manifest, f.io), /differs from reviewed source/);
    f.current.set(path, Buffer.concat([expected, Buffer.from("\n// unreviewed\n")]));
    assert.throws(() => verifyNativePresentation(manifest, f.io), /differs from reviewed source/);
    f.current.set(path, expected);
    f.upstream.set(path, Buffer.concat([f.upstream.get(path), Buffer.from("\n")]));
    assert.throws(() => verifyNativePresentation(manifest, f.io), /unreviewed upstream source/);
  });
test("rejects source from a different upstream byte identity", () => {
  assert.throws(() =>
    deriveSidebarReorderTypeOverlay(
      Buffer.concat([original, Buffer.from("\n")]),
    ),
  );
});
test("rejects missing files rather than reporting partial preservation", () => {
  const f = fixture();
  f.current.delete(EXACT_NATIVE_FILES[0]);
  assert.throws(() => verifyNativePresentation(manifest, f.io));
});
