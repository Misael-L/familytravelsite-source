import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook } from "__ROOT__/client/tests/helpers/render";
import { resetAllStores } from "__ROOT__/client/tests/helpers/store";
import { resetOfflineTestDatabase } from "__ROOT__/client/tests/helpers/offlineDb";
import {
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from "__ROOT__/client/tests/helpers/familyPacking";
import { buildTrip, buildUser } from "__ROOT__/client/tests/helpers/factories";
import { useTripStore } from "__ROOT__/client/src/store/tripStore";
import { useAuthStore } from "__ROOT__/client/src/store/authStore";
import { useAddonStore } from "__ROOT__/client/src/store/addonStore";
import { setAuthed } from "__ROOT__/client/src/sync/authGate";
import {
  _resetNetworkMode,
  setForcedOffline,
} from "__ROOT__/client/src/sync/networkMode";
import {
  offlineDb,
  invalidateOfflineSession,
} from "__ROOT__/client/src/db/offlineDb";
import { installReadOnlySession } from "__ROOT__/client/src/db/readOnlySession";
import {
  installPlannerPackingPort,
  packingGroupActionsAvailable,
  packingActionAvailable,
  packingCategoryCreateAvailable,
  type PlannerPackingPort,
} from "__ROOT__/client/src/repo/plannerPackingPort";
import { packingBagActionsAvailable } from "__ROOT__/client/src/repo/plannerPackingBagPort";
import { FamilyIdentityRegistry } from "__ROOT__/client/src/integrations/family/identity";
import { projectPacking } from "__ROOT__/client/src/integrations/family/plannerPacking";
import { FamilyFrontendRepository } from "__ROOT__/client/src/integrations/family/repository";
import { createFamilyPlannerCohort } from "__ROOT__/client/src/integrations/family/plannerCohort";
import { usePackingTemplates } from "__ROOT__/client/src/components/Packing/usePackingTemplates";
import { usePackingImport } from "__ROOT__/client/src/components/Packing/usePackingImport";
import { usePackingExport } from "__ROOT__/client/src/components/Packing/usePackingExport";
import { usePackingBagTracking } from "__ROOT__/client/src/components/Packing/usePackingSnapshot";
import { packingApi } from "__ROOT__/client/src/api/client";
import { downloadBlob } from "__ROOT__/client/src/utils/fileDownload";
vi.mock("__ROOT__/client/src/utils/fileDownload", () => ({
  downloadBlob: vi.fn(),
}));
let stop: () => void,
  native: number,
  view: ReturnType<typeof projectPacking> & { unassigned_weight_grams: number },
  port: PlannerPackingPort;
const raw = vi.fn(),
  toast = { success: vi.fn(), error: vi.fn() };
const names = [
  "bulkImport",
  "applyTemplate",
  "saveAsTemplate",
  "setSharing",
  "clone",
  "addContributor",
  "removeContributor",
  "listTemplates",
  "listBags",
] as const;
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  vi.clearAllMocks();
  const packet = canonicalPackingList();
  packet.items = [
    canonicalPackingRow({
      name: "Audit coat",
      bag_id: packet.bags[0].id,
      is_private: false,
      owner_person_id: null,
    }),
    canonicalPackingRow({
      id: id(88),
      name: "Audit personal diary",
      is_private: true,
      owner_person_id: packet.scope.person_id,
      bag_id: null,
    }),
  ];
  const ids = new FamilyIdentityRegistry(packet.scope.user_id);
  native = ids.register("trip", packet.scope.trip_id);
  view = {
    ...projectPacking(packet, ids, [
      { personId: packet.scope.person_id, displayName: "Audit owner" },
    ]),
    unassigned_weight_grams: 0,
  };
  useTripStore.setState({
    trip: buildTrip({ id: native, title: "Audit old Trip" }),
    packingItems: view.items,
  });
  useAuthStore.setState({
    user: buildUser({ id: ids.register("person", packet.scope.person_id) }),
    isAuthenticated: true,
  });
  useAddonStore.setState({ bagTracking: false });
  port = {
    bind: raw,
    packed: raw,
    reorder: raw,
    snapshot: () => view,
    subscribe: () => () => {},
    trashPage: raw,
    restore: raw,
    reconcile: raw,
    observeGroup: raw,
    categoryIdentityMode: () => true,
    bindNewCategory: raw,
    bags: {
      available: () => true,
      bind: raw,
      people: async () => [],
      trashPage: raw,
      restore: raw,
    },
  };
  stop = installPlannerPackingPort(port);
  for (const name of names) vi.spyOn(packingApi, name).mockImplementation(raw);
});
afterEach(async () => {
  cleanup();
  stop();
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
const template = () =>
  renderHook(() =>
    usePackingTemplates({
      tripId: native,
      view: "common",
      t: (k) => k,
      toast,
      onApplied: raw,
      onSaved: raw,
    }),
  );
const importing = () =>
  renderHook(() =>
    usePackingImport({ tripId: native, t: (k) => k, toast, onImported: raw }),
  );
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
describe("unsupported capability contracts", () => {
  it("bag, group and category authority cannot grant unrelated import/template/sharing authority", () => {
    expect(packingBagActionsAvailable(native, true)).toBe(true);
    expect(packingActionAvailable("packed-state", true)).toBe(true);
    expect(packingCategoryCreateAvailable(true)).toBe(true);
    expect(packingGroupActionsAvailable(true)).toBe(false);
    expect(packingGroupActionsAvailable(false)).toBe(false);
  });
  it("templates are not read through the legacy adapter under a qualified owner", () => {
    expect(template().result.current.templates).toEqual([]);
    expect(raw).not.toHaveBeenCalled();
  });
  for (const action of ["apply", "save", "import", "file"] as const)
    it(
      action + " refuses before HTTP, local append or FileReader",
      async () => {
        const old = structuredClone(useTripStore.getState().packingItems),
          t = template(),
          i = importing();
        act(() => {
          i.result.current.setText("Audit new row");
          t.result.current.setSaveTemplateName("Audit template");
        });
        const work = () =>
          action === "apply"
            ? t.result.current.applyTemplate(7)
            : action === "save"
              ? t.result.current.saveAsTemplate()
              : action === "import"
                ? i.result.current.runImport()
                : i.result.current.readFile({
                    target: { files: [new File(["Audit row"], "fixture.csv")] },
                  } as never);
        await expect(async () => work()).rejects.toThrow("group action");
        expect(raw).not.toHaveBeenCalled();
        expect(useTripStore.getState().packingItems).toEqual(old);
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      },
    );
  for (const action of ["sharing", "clone", "join", "leave"] as const)
    for (const retired of [false, true])
      it(
        action +
          (retired ? " retired" : " live") +
          " store callback refuses without raw writes or cache/queue effects",
        async () => {
          const old = structuredClone(view.items);
          if (retired) stop();
          const s = useTripStore.getState(),
            item = view.items[0].id;
          const work = () =>
            action === "sharing"
              ? s.setPackingItemSharing(native, item, "shared", [2])
              : action === "clone"
                ? s.clonePackingItem(native, item)
                : action === "join"
                  ? s.addPackingContributor(native, item)
                  : s.removePackingContributor(native, item, 2);
          await expect(work()).rejects.toThrow("group action");
          expect(raw).not.toHaveBeenCalled();
          expect(useTripStore.getState().packingItems).toEqual(old);
          expect(await offlineDb.mutationQueue.count()).toBe(0);
        },
      );
  it("retired import and template callbacks cannot fall back to ordinary writers", async () => {
    const t = template(),
      i = importing();
    act(() => i.result.current.setText("Audit row"));
    stop();
    await expect(i.result.current.runImport()).rejects.toThrow("group action");
    await expect(t.result.current.applyTemplate(3)).rejects.toThrow(
      "group action",
    );
    expect(raw).not.toHaveBeenCalled();
  });
  it("read-only gates deny bag and aggregate controls", () => {
    const release = installReadOnlySession();
    try {
      expect(packingBagActionsAvailable(native, true)).toBe(false);
      expect(packingActionAvailable("packed-state", true)).toBe(false);
      expect(packingCategoryCreateAvailable(true)).toBe(false);
      expect(packingGroupActionsAvailable(true)).toBe(false);
    } finally {
      release();
    }
  });
  it("ordinary no-Family gate and native personal-template API arguments stay intact", async () => {
    stop();
    useTripStore.setState({ packingItems: [] });
    raw.mockResolvedValue({
      templates: [{ id: 4, name: "Native template", item_count: 1 }],
      items: [],
      count: 0,
    });
    const h = renderHook(() =>
      usePackingTemplates({
        tripId: native,
        view: "personal",
        t: (k) => k,
        toast,
        onApplied: () => {},
        onSaved: () => {},
      }),
    );
    await act(async () => h.result.current.applyTemplate(4));
    expect(packingGroupActionsAvailable(true)).toBe(true);
    expect(packingApi.applyTemplate).toHaveBeenCalledExactlyOnceWith(
      native,
      4,
      "personal",
    );
  });
});
describe("actual cohort rejects legacy paths before legacy adapters", () => {
  const routes = [
    ["POST", "/import"],
    ["POST", "/apply-template/1"],
    ["POST", "/save-as-template"],
    ["PUT", "/1/sharing"],
    ["POST", "/1/clone"],
    ["POST", "/1/contributors"],
    ["DELETE", "/1/contributors/2"],
    ["PUT", "/bags/1/members"],
    ["POST", "/bags"],
    ["PUT", "/reorder"],
  ] as const;
  for (const [method, suffix] of routes)
    it(method + " " + suffix, async () => {
      stop();
      const s = canonicalPackingList().scope;
      const repo = new FamilyFrontendRepository(async () => ({
        userId: s.user_id,
        familyId: s.family_id,
        personId: s.person_id,
        user: {
          username: "Audit",
          email: "fixture@fixture.invalid",
          avatar_url: null,
          created_at: "2026-11-12",
        },
      }));
      await repo.session();
      const legacy = vi
        .spyOn(repo.readers.packing, "upsertPackingItem")
        .mockImplementation(raw);
      const cohort = createFamilyPlannerCohort(repo, {
        source: () => "http://127.0.0.1:56041",
        reportError: () => {},
      });
      try {
        await expect(
          cohort.handle({
            pathname: "/trips/" + s.trip_id + "/packing" + suffix,
            method,
            body: { items: [{ name: "Blocked" }] },
            query: new URLSearchParams(),
          }),
        ).rejects.toMatchObject({ code: "planner_writer_not_cut_over" });
        expect(legacy).not.toHaveBeenCalled();
        expect(raw).not.toHaveBeenCalled();
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      } finally {
        cohort.dispose();
      }
    });
});
describe("current export gaps: witnesses, not desired regression behavior", () => {
  for (const offline of [false, true])
    it(
      "qualified " +
        (offline ? "offline" : "online") +
        " bags are visible but CSV omits labels when global add-on is off",
      async () => {
        setForcedOffline(offline);
        const h = renderHook(() => ({
          enabled: usePackingBagTracking(native),
          export: usePackingExport(native, "common"),
        }));
        expect(h.result.current.enabled).toBe(true);
        await act(async () => h.result.current.export.exportCsv());
        const blob = vi.mocked(downloadBlob).mock.calls.at(-1)![0];
        const body = await blob.text();
        expect(body).toContain("Audit coat");
        expect(body).not.toContain(view.bags[0].name);
        expect(packingApi.listBags).not.toHaveBeenCalled();
      },
    );
  it("current export does filter out the personal list from common Markdown", async () => {
    const h = renderHook(() => usePackingExport(native, "common"));
    act(() => h.result.current.exportMarkdown());
    expect(downloadBlob).toHaveBeenCalledOnce();
    const text = await vi.mocked(downloadBlob).mock.calls[0][0].text();
    expect(text).toContain("Audit coat");
    expect(text).not.toContain("Audit personal diary");
  });
  it("reproduces an already-open print surviving a Trip replacement", async () => {
    const h = renderHook(({ trip }) => usePackingExport(trip, "common"), {
      initialProps: { trip: native },
    });
    await act(async () => h.result.current.openPrint());
    stop();
    await invalidateOfflineSession();
    act(() =>
      useTripStore.setState({
        trip: buildTrip({ id: native + 99, title: "Audit new Trip" }),
        packingItems: [],
      }),
    );
    h.rerender({ trip: native + 99 });
    expect(h.result.current.printHtml).toContain("Audit old Trip");
  });
  for (const action of ["csv", "print"] as const)
    it(
      "reproduces late " +
        action +
        " completion after the originating Trip and session retire",
      async () => {
        useAddonStore.setState({ bagTracking: true });
        const pending = deferred<{ bags: never[] }>();
        vi.mocked(packingApi.listBags).mockReturnValue(pending.promise);
        const h = renderHook(({ trip }) => usePackingExport(trip, "common"), {
          initialProps: { trip: native },
        });
        let flight: Promise<void>;
        act(() => {
          flight =
            action === "csv"
              ? h.result.current.exportCsv()
              : h.result.current.openPrint();
        });
        stop();
        await invalidateOfflineSession();
        act(() =>
          useTripStore.setState({
            trip: buildTrip({ id: native + 99, title: "Audit new Trip" }),
            packingItems: [],
          }),
        );
        h.rerender({ trip: native + 99 });
        await act(async () => {
          pending.reject(Error("The original read owner retired"));
          await flight!;
        });
        if (action === "csv") expect(downloadBlob).toHaveBeenCalledOnce();
        else expect(h.result.current.printHtml).toContain("Audit old Trip");
      },
    );
});
