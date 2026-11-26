import assert from "node:assert/strict";
import { validateNativePresentationManifest } from "./native-presentation-contract.mjs";

export const INITIAL_IMPORT = Object.freeze({
  trekVersion: "5.0.1",
  trekCommit: "a0943f8226269bc192c1cda992fbac33333337a1",
  trekTag: "trek-v5.0.1",
  familyCommit: "247b76ea94942e511a663f3f840c81821c556fc5",
  familyTag: "family-before-trek-v5-20261029",
  importCommit: "06e89f16d2ed9946403243d89d688d535b070265",
  integrationBranch: "codex/trek-v5-family-integration",
});
export {
  EXACT_NATIVE_FILES,
  PROTECTED_NATIVE_FILES,
} from "./native-presentation-contract.mjs";
export function validateReleasePins(config, presentation) {
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.repository, "Misael-L/FamilyTravelSite");
  assert.equal(config.branches.production, "main");
  assert.equal(
    config.branches.integration,
    "codex/trek-v5.1.4-family-reconcile",
  );
  assert.equal(config.upstream.repository, "liketrek/TREK");
  assert.equal(config.upstream.remote, "upstream");
  assert.equal(config.deployment.productionBranch, "main");
  assert.equal(config.deployment.integrationAutoDeploy, false);
  assert.equal(config.releases.familyTagPattern, "family-YYYY.MM.DD.N");
  assert.equal(config.releases.candidateTagPattern, "family-YYYY.MM.DD.N-rc.K");
  assert.equal(
    config.releases.sourceMirror,
    "Misael-L/familytravelsite-source",
  );
  assert.equal(config.releases.sourceTagPattern, "source-YYYYMMDD-SHORTSHA");
  assert.equal(
    config.releases.mergeMethod,
    "merge commit; preserve upstream ancestry",
  );
  assert.deepEqual(
    config.initialImport,
    INITIAL_IMPORT,
    "Original import provenance cannot change",
  );
  const pin = config.baseline;
  assert.deepEqual(Object.keys(pin).sort(), [
    "qualificationCommit",
    "trekCommit",
    "trekTag",
    "trekVersion",
  ]);
  assert.match(pin.trekVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(pin.trekTag, `trek-v${pin.trekVersion}`);
  for (const key of ["trekCommit", "qualificationCommit"])
    assert.match(pin[key], /^[a-f0-9]{40}$/);
  assert.equal(
    presentation.source_repository,
    "https://github.com/liketrek/TREK",
  );
  assert.equal(presentation.source_version, pin.trekVersion);
  assert.equal(presentation.upstream_commit, pin.trekCommit);
  validateNativePresentationManifest(presentation);
  return { initial: config.initialImport, pin };
}

/** The original exact import and current qualified source have different proofs. */
export function verifyPinnedHistory(config, presentation, git) {
  const { initial, pin } = validateReleasePins(config, presentation);
  assert.equal(
    git("show", "-s", "--format=%P", initial.importCommit),
    `${initial.familyCommit} ${initial.trekCommit}`,
  );
  assert.equal(
    git("rev-parse", `${initial.importCommit}^{tree}`),
    git("rev-parse", `${initial.trekCommit}^{tree}`),
  );
  for (const sha of [
    initial.familyCommit,
    initial.trekCommit,
    initial.importCommit,
    pin.trekCommit,
    pin.qualificationCommit,
  ])
    git("merge-base", "--is-ancestor", sha, "HEAD");
  git("merge-base", "--is-ancestor", initial.trekCommit, pin.trekCommit);
  git("merge-base", "--is-ancestor", pin.trekCommit, pin.qualificationCommit);
  for (const [tag, sha] of [
    [initial.trekTag, initial.trekCommit],
    [initial.familyTag, initial.familyCommit],
    [pin.trekTag, pin.trekCommit],
  ])
    assert.equal(
      git("rev-parse", `${tag}^{commit}`),
      sha,
      `Incorrect immutable reference: ${tag}`,
    );
  for (const name of [
    "package.json",
    "client/package.json",
    "server/package.json",
    "shared/package.json",
  ]) {
    assert.equal(
      JSON.parse(git("show", `${pin.trekCommit}:${name}`)).version,
      pin.trekVersion,
    );
  }
  return { initial, pin };
}
