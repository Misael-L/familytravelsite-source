# Family Map Settings cutover

## Verified behavior

On the integration source at `68de9a7fd`, both native Map Settings views can report “Map settings saved” when the Family adapter has only updated an in-memory copy. A local probe through the actual views, Axios adapter and application handler showed this sequence.

1. The Family map read returns the member's `openfreemap-bright` choice. Native Settings opens with Leaflet because `GET /settings` does not project the Family choice.
2. The user picks the enabled OpenStreetMap DE template. `POST /settings/bulk` succeeds and the native store shows the new template. The Family preference stays on `openfreemap-bright`, and the save makes no call to `update_my_map_preference`.
3. A fresh native settings load after resetting both in-memory settings stores loses the saved template. The member's original named map remains available in the Family map store.
4. Calling the existing Family map store sends `osm-de` to `update_my_map_preference`. Sending `null` restores the family default. The native store does not follow either change.

The probes use a simulated Supabase response at the SDK boundary and stub map drawing. The active form, settings stores, request adapter, server-facing method and payload, and map store were exercised in process.

On an isolated Supabase database, a rollback-only SQL fixture confirmed the existing member RPC's default read, named save, subsequent read, reset, disabled-option refusal and unrelated-family refusal. The database confirmed removal of the fixture rows after rollback. The broader historical `phase47_family_maps.sql` smoke stopped earlier because its two expected MFA coverage-registry rows were absent on that database. The focused result qualifies the named choice behavior at the SQL role and claims boundary.

## Implementation contract

Use the Family's named map catalog as the source for the member's choice. The shared schema already defines the required operations in `FamilyTravelApp/supabase/migrations/20260905050119_family_map_settings.sql`. The database derives the member, validates the catalog and credentials, and writes a member override for the supplied family. The RPC accepts an enabled and usable option ID, or `null` to inherit the family default. Each successful reply carries the effective map, selected choice, source and credential revision.

An adapter that translates TREK's raw URL and credential fields would preserve their appearance while exposing choices that the Family catalog cannot store. Giving personal Settings its own tile and credential columns would introduce a second map policy. Use the existing catalog and preference store with the native settings shells instead. The protected desktop Map Settings component and map-renderer layouts can stay byte-exact by placing the Family controls at the settings entry points.

1. **Native settings entry points.** Use [desktop Settings](../../../client/src/pages/SettingsPage.tsx) and [phone Settings](../../../client/src/mobile/screens/settings/MSettings.tsx) to mount Family-appropriate controls in the existing shell. Reuse the [Family catalog policy](../../../client/src/integrations/family/legacy/components/Map/mapRegistry.ts) and [member map store](../../../client/src/integrations/family/legacy/store/familyMapStore.ts). The [old picker](../../../client/src/integrations/family/legacy/components/Settings/FamilyMapPicker.tsx) documents the allowed choices, missing credentials, displayed source and reset behavior. Offer enabled, credential-usable IDs and the inherit action, with existing translations. Keep the 3D and quality choices device-local. Show the signed-in user's last confirmed choice during a save and apply the returned effective choice on success.
2. **Native renderer inputs.** Project the authorized effective engine, raster template, GL style and rendering credentials from a single Family snapshot to the native consumers. Start from [the Family render resolver](../../../client/src/integrations/family/legacy/components/Map/resolveMapRender.ts) and [the application settings adapter](../../../client/src/integrations/family/applicationSettings.ts). The adapter and [Family startup boundary](../../../client/src/integrations/family/bootstrap.ts) own the handoff to signed-in native state. Apply the same projection on initial load, successful pick/reset and a relevant family settings refresh. Use normalized templates and keep credential values in separate render inputs. Verify that public/shared maps get public defaults and that their paths do not read or retain another account's credential-bearing projection.
3. **Request and lifecycle rules.** Send one choice mutation at a time through the existing actor-scoped store. Report success on a current, confirmed reply. A rejected selection leaves the previous effective map visible and reports an error. Fence late success and late read responses when the account, family, or source changes. Handle an unavailable catalog with the existing built-in fallback. Guard direct generic settings requests for Family-managed provider fields so old clients cannot get a false success. Keep device-local toggles and unrelated settings writable through their existing paths.
4. **Legacy cleanup follows the repaired contract.** Re-run the import scan after the controls and renderer projection are wired. The wrapper and standard-server tab are candidates for retirement. Review the old Family picker after any reuse or extraction. The reachable GL preview module is outside the three-file omission simulation.

## Acceptance and execution order

- Turn the three characterization probes into regression coverage. Test that an existing `openfreemap-bright` selection loads, choosing `osm-de` sends the exact scoped payload, and a fresh load still uses `osm-de`. Test a `null` reset back to the family default. Use the normal desktop and phone settings routes.
- Exercise a disabled option, missing credentials, a rejected save, a slow refresh, and a pending selection during logout or account/family switch. Verify the previous confirmed choice on a failure and absence of the old account's map inputs on the new owner.
- Verify the selected map reaches the native trip map and signed-in Journey with the expected provider and style. Check the Family Atlas consumer and keep the existing Leaflet/WebGL and offline fallback behavior. Public sharing uses its own configuration. Use synthetic credentials and intercept tile traffic in fixtures.
- Rehearse the unchanged read/write RPC on the isolated Supabase schema with an authenticated synthetic member. Verify a stored option after reconnect and the authorization refusal for an unrelated family. Use the documented isolated backend and source-bound local build. Hosted validation belongs to the later preview acceptance.
- Run the recorded 16 focused client suites, source guards, typecheck, build and artifact binding. Verify the seven upstream-exact native files through the existing presentation guard. Review the exact post-fix legacy deletion as a separate source comparison.

The implementation task is the settings-to-renderer contract. The review checkpoint keeps the known defect visible in the release handoff.

## Local implementation result

The Family picker now serves both native settings shells, using the existing confirmed member selection and Family default. A scoped projection sends that choice to the native trip and Journey renderers and keeps the public Journey renderer isolated. The build and automated route fixtures passed on the private integration branch. [Verification and follow-up](legacy-reservation-retirement-audit.md#durable-family-map-settings)
