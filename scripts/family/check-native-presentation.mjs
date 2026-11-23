import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateReleasePins } from "./release-contract.mjs";
import { verifyNativePresentation } from "./native-presentation-contract.mjs";

assert.equal(
  process.argv.length,
  2,
  "No mutable presentation overrides are accepted",
);

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(
    resolve(root, "docs/family-integration/native-presentation.json"),
    "utf8",
  ),
);
const release = JSON.parse(
  readFileSync(resolve(root, ".github/family-release.json"), "utf8"),
);
validateReleasePins(release, manifest);
const result = verifyNativePresentation(manifest, {
  readUpstream: (commit, path) =>
    execFileSync("git", ["show", `${commit}:${path}`], { cwd: root }),
  readCurrent: (path) => readFileSync(resolve(root, path)),
});
process.stdout.write(
  `native_presentation_ok files=${result.protectedFiles} upstream_exact=${result.exactUpstreamFiles} fixed_type_overlays=${result.fixedTypeOnlyOverlays} fixed_family_transport_overlays=${result.fixedFamilyTransportOverlays} fixed_family_timeline_overlays=${result.fixedFamilyTimelineOverlays} upstream=${manifest.upstream_commit}\n`,
);
