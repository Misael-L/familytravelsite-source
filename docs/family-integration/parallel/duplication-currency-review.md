# PA-02 currency catalog duplication review

The full duplication check on `74475c13eb1c404628a1ada6eb41d29174c899b6` reported 17,619 copied lines across 285 files. The two currency modules accounted for 374 scanned lines between them. Both have live callers. The [proposed patch](proposals/currency-catalog.patch) changes only the retained module and is ready for a separate implementation packet.

## Dependencies

- Native `App.tsx` renders `TripPlannerPage` on the desktop trip route. Its `CostsPanel` and the costs model use the native `components/Budget/BudgetPanel.constants.ts` currency data. The dashboard converter, display settings, trip forms and native phone settings/form surfaces import that module too.
- The Family admin route renders `FamilyAdminPage`, which loads the retained `AdminPage`. Its Defaults tab renders `FamilyDefaultPreferencesManager` in the Supabase data plane. That manager uses `currenciesWith` and `SYMBOLS` from `integrations/family/legacy/components/Budget/BudgetPanel.constants.ts`. Other retained importers include settings, the trip form and budget helpers.
- Both modules currently have zero imports. The patch adds one dependency from the retained module to the native data module. The native source and importers stay in place. Current callers read the catalog data. The patch keeps separate arrays and maps for the two modules, plus each module’s own fallback function and palettes.

## Prototype result

The [prototype receipt](proposals/currency-catalog-prototype.json) records the source hashes and exact scan counts. The isolated two-file fixture preserved all 165 ordered catalog entries, 165 symbol entries and the results for 174 currency inputs. It verified retained collection identity on known inputs, array and map independence, and byte-for-byte equality of the retained fallback function and both palettes. The duplication check found 374 lines before the patch and zero after. The fixture produced zero offline or layer violations. The global patched-tree scan and build belong to the implementation packet.

## Implementation packet

1. Work from the current private integration tip in the Coordinator A checkout. Confirm the two input hashes in the receipt. From the repository root, run `git apply --check --unidiff-zero docs/family-integration/parallel/proposals/currency-catalog.patch` and then apply the same patch with `git apply --unidiff-zero`. Verify the retained candidate hash. Review any changed input first.
2. Verify ordered exports, symbol formatting, supported-code array identity, archived BGN and HRK fallbacks, unknown and differently cased codes, empty/null/undefined inputs, independent collection mutation and both palettes against the prepatch behavior. Run the existing `formatters.test.ts`, `costsModel.test.ts` and `useCurrencyConverter.test.ts` suites and cover the retained Family Admin Defaults currency selector through its component or a focused test fixture.
3. Run the actual full duplication, strict, layer and offline checks under the coordinator lease. Compare the full duplication report by path and block to the measured prepatch report. Require the two identified blocks to disappear, with any remaining findings explained and no new diagnostics or dependency violations. Keep the existing scanner configuration and allowances.
4. Run client typecheck, typed lint, the four source guards and the isolated source-bound production build and artifact checks. Exercise the native currency selector and Family Admin Defaults with the existing isolated fixture into which historical codes can be seeded. Confirm the displayed values, option order and saved code preservation.
5. Record the results and source qualification, then push the integration checkpoint under the existing policy. The packet scope is one runtime file, focused evidence and ordinary qualification records. It requires no schema or feature-flag changes.

Peer integration in PA-02 included two test-only edits. Their tests and strict diagnostic results are recorded in the [coordinator status](coordinator-status.json).

## Implementation result

Commit `cff3356b33b9cf9a4adf2852cc8dfcc52b5b1c2f` applies the reviewed patch to the retained currency module. It removes 374 duplicated lines. The full scanner reports 17,245 across 283 files, and all remaining duplicate blocks are identical to the prior scan. The strict report is identical at 632 diagnostics. Client typecheck, typed lint, formatting, layer and offline checks, four source checks and all 142 focused tests pass. The committed module reproduces all 174 value comparisons from the prototype.

The source-bound build at `012d3bbff61e1ed79fa470864c84f5ecbaa89549` passes the artifact scanner, including the wrong-source and missing-source refusal checks. The 14 CSS files, fixture configuration and writer profile match the previous build.

A Chromium comparison with synthetic responses verified the trip Costs display with an archived BGN trip currency and the native General settings selector with a saved BGN preference. Family Admin Defaults opened with HRK, saved that same value, then saved EUR and displayed it after reload. Both 167-option menus had identical labels and order before and after. The native checks use the existing planner profile. Admin Defaults uses ordinary synthetic builds because the planner profile refuses admin RPCs. The prepatch Admin artifact is `cf58fbdbe6de9e69de8bd64c71124db29a566442`. Its Admin manager, hook, dropdown, adapter and retained catalog match the prepatch checkout byte for byte. The existing supported profile gates expense editing, so the browser ran the Costs read and the native General settings selector. The existing expense form tests exercised the Costs editor. All responses were synthetic and all live requests were blocked.
