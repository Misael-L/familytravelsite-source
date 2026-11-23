import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const PROTECTED_NATIVE_FILES = Object.freeze([
  "client/src/pages/TripPlannerPage.tsx",
  "client/src/components/Planner/DayPlanSidebar.tsx",
  "client/src/components/Map/MapViewAuto.tsx",
  "client/src/pages/tripPlanner/PlanMapStage.tsx",
  "client/src/mobile/screens/trip/MTripShell.tsx",
  "client/src/mobile/screens/trip/map/MMapArea.tsx",
  "client/src/mobile/screens/trip/plan/MPlanTimeline.tsx",
  "client/src/mobile/screens/trip/sheets/MTripSheets.tsx",
  "client/src/mobile/screens/trip/sheets/MMehrSheet.tsx",
  "client/src/components/Journey/JourneyMapAuto.tsx",
  "client/src/components/Settings/MapSettingsTab.tsx",
  "client/src/pages/sharedTrip/SharedMap.tsx",
]);

// This Sidebar type edit has a fixed derivation from the reviewed upstream source.
export const SIDEBAR_REORDER_OVERLAY = Object.freeze({
  id: "sidebar-onReorder-awaitable-v1",
  path: "client/src/components/Planner/DayPlanSidebar.tsx",
  upstream_commit: "2bcfc1bfcbbff0affd097c0f789c835396389572",
  upstream_sha256:
    "fdbb934b0ebe02190b3b68b8cf7c4eec526ad6d387970e44ec7b3e634a94340d",
  derived_sha256:
    "fc9f3da5c00e543afea019aee34e44c116bd6b2814ce9d6ef67347de9f3a26f2",
});
export const TYPE_ONLY_NATIVE_OVERLAYS = Object.freeze([
  SIDEBAR_REORDER_OVERLAY,
]);
// Layer the narrow Family reorder change over the verified async callback type.
export const FAMILY_TIMELINE_SIDEBAR_OVERLAY = Object.freeze({
  id: "family-visit-only-timeline-reorder-v1",
  path: SIDEBAR_REORDER_OVERLAY.path,
  base_sha256: SIDEBAR_REORDER_OVERLAY.derived_sha256,
  derived_sha256:
    "897d7c0e4fb9660ca027828f831ab294c45eee16ddd29ecc834a58fdc0ae8efc",
});
// Both hashes pin each reviewed Transport change independently of manifest metadata.
export const FAMILY_TRANSPORT_NATIVE_OVERLAYS = Object.freeze([
  Object.freeze({
    id: "family-transport-desktop-planner-v1",
    path: "client/src/pages/TripPlannerPage.tsx",
    upstream_sha256:
      "fba01c173d850fa91719ea4692df5357fa2d11395eb05404e6328d5b5dd01179",
    derived_sha256:
      "2bc0af21413b6088f11f4b2ce317b8b8c425711168358d5a81b1e90829c644a2",
  }),
  Object.freeze({
    id: "family-transport-phone-trip-shell-v1",
    path: "client/src/mobile/screens/trip/MTripShell.tsx",
    upstream_sha256:
      "09a75fc09b538232b923596c98232761de838a6d749da1e8d5dd6c97ec0ca3db",
    derived_sha256:
      "4c65c00478885b38d4f666b2c0d9e39e51e34f390f075fed0ac631ed077839b4",
  }),
  Object.freeze({
    id: "family-transport-phone-day-timeline-v1",
    path: "client/src/mobile/screens/trip/plan/MPlanTimeline.tsx",
    upstream_sha256:
      "7b291d2ee80fe219c9a26c197de3fbaf5a0a676c490407bf4491d5df3fc7627a",
    derived_sha256:
      "6808585c553dae4503d0799a61de08d0cb991e6ffe21381d938d757953d9647f",
  }),
  Object.freeze({
    id: "family-transport-phone-trip-sheets-v1",
    path: "client/src/mobile/screens/trip/sheets/MTripSheets.tsx",
    upstream_sha256:
      "51bc9d0494e879b8d70fb8df2c2029f49282f831b219e5d53abe52c89bae1ae3",
    derived_sha256:
      "5093ad215e10c4197ed278aec4ed41a6cba55894ef4346b68b9db2858443241d",
  }),
]);
export const EXACT_NATIVE_FILES = Object.freeze(
  PROTECTED_NATIVE_FILES.filter(
    (name) =>
      name !== SIDEBAR_REORDER_OVERLAY.path &&
      !FAMILY_TRANSPORT_NATIVE_OVERLAYS.some(({ path }) => path === name),
  ),
);

export function validateNativePresentationManifest(manifest) {
  assert.deepEqual(Object.keys(manifest).sort(), [
    "exact_files",
    "family_timeline_overlay",
    "family_transport_overlays",
    "reason",
    "source_repository",
    "source_version",
    "type_only_overlays",
    "upstream_commit",
  ]);
  assert.equal(manifest.source_repository, "https://github.com/liketrek/TREK");
  assert.equal(
    manifest.source_version,
    "5.1.4",
    "Review the fixed overlays before adopting another TREK version",
  );
  assert.equal(
    manifest.upstream_commit,
    SIDEBAR_REORDER_OVERLAY.upstream_commit,
  );
  assert.ok(
    typeof manifest.reason === "string" && manifest.reason.trim().length > 0,
  );
  assert.deepEqual(
    manifest.exact_files,
    EXACT_NATIVE_FILES,
    "Protected exact files cannot be removed or replaced",
  );
  assert.deepEqual(
    manifest.type_only_overlays,
    TYPE_ONLY_NATIVE_OVERLAYS,
    "Only the reviewed Sidebar type overlay is accepted",
  );
  assert.deepEqual(
    manifest.family_timeline_overlay,
    FAMILY_TIMELINE_SIDEBAR_OVERLAY,
    "Only the reviewed Family timeline overlay is accepted",
  );
  assert.deepEqual(
    manifest.family_transport_overlays,
    FAMILY_TRANSPORT_NATIVE_OVERLAYS,
    "Only the four reviewed Family Transport overlays are accepted",
  );
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function deriveSidebarReorderTypeOverlay(upstream) {
  assert.ok(Buffer.isBuffer(upstream));
  assert.equal(
    sha256(upstream),
    SIDEBAR_REORDER_OVERLAY.upstream_sha256,
    "Sidebar upstream bytes differ from the reviewed source",
  );
  const before = "  onReorder: (dayId: number, orderedIds: number[]) => void\n";
  const after =
    "  onReorder: (dayId: number, orderedIds: number[]) => void | Promise<void>\n";
  const text = upstream.toString("utf8");
  assert.equal(
    text.split(before).length,
    2,
    "The reviewed declaration must occur exactly once",
  );
  const derived = Buffer.from(text.replace(before, after));
  assert.equal(sha256(derived), SIDEBAR_REORDER_OVERLAY.derived_sha256);
  return derived;
}

/** Used by both the presentation CLI and the Git/release gate. No mutable overrides. */
export function verifyNativePresentation(
  manifest,
  { readUpstream, readCurrent },
) {
  validateNativePresentationManifest(manifest);
  for (const name of EXACT_NATIVE_FILES) {
    const expected = readUpstream(manifest.upstream_commit, name);
    const current = readCurrent(name);
    assert.ok(Buffer.isBuffer(expected) && Buffer.isBuffer(current));
    assert.ok(current.equals(expected), `Native presentation changed: ${name}`);
  }
  const overlay = SIDEBAR_REORDER_OVERLAY;
  const expected = deriveSidebarReorderTypeOverlay(
    readUpstream(overlay.upstream_commit, overlay.path),
  );
  const current = readCurrent(overlay.path);
  assert.ok(Buffer.isBuffer(current));
  assert.equal(sha256(expected), FAMILY_TIMELINE_SIDEBAR_OVERLAY.base_sha256);
  assert.equal(
    sha256(current),
    FAMILY_TIMELINE_SIDEBAR_OVERLAY.derived_sha256,
    `Sidebar differs from the reviewed Family timeline source: ${overlay.path}`,
  );
  for (const { path, upstream_sha256, derived_sha256 } of
    FAMILY_TRANSPORT_NATIVE_OVERLAYS) {
    const upstream = readUpstream(manifest.upstream_commit, path);
    const current = readCurrent(path);
    assert.ok(Buffer.isBuffer(upstream) && Buffer.isBuffer(current));
    assert.equal(
      sha256(upstream),
      upstream_sha256,
      `Family Transport overlay has an unreviewed upstream source: ${path}`,
    );
    assert.equal(
      sha256(current),
      derived_sha256,
      `Family Transport overlay differs from reviewed source: ${path}`,
    );
  }
  return {
    protectedFiles: PROTECTED_NATIVE_FILES.length,
    exactUpstreamFiles: EXACT_NATIVE_FILES.length,
    fixedTypeOnlyOverlays: TYPE_ONLY_NATIVE_OVERLAYS.length,
    fixedFamilyTransportOverlays: FAMILY_TRANSPORT_NATIVE_OVERLAYS.length,
    fixedFamilyTimelineOverlays: 1,
  };
}
