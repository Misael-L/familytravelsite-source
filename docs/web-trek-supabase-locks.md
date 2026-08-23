# Family Travel Site — Web program locks (TREK UI → Supabase)

**Status:** Locked (W0–W7.2 implemented; **W2.1 hub writes** implemented; **W2.1b** hub pencil for open proposals implemented; **W2.1c** hub vote/decide/shelf implemented; W6.1 Transport implemented; W6.2 Bookings implemented; W6.3 booking import implemented; **W8.1–W8.7** implemented; **W9.0–W9.1** implemented; W9.2 Realtime deferred; **§18 Plan PDF/ICS + account password** implemented; **§19 trip recorded tracks** implemented; **§20 calendar subscribe** implemented; **§21 hub duplicate** implemented; **§22 hub boarding-pass stats** implemented; **§23 Family Vacay** implemented; **§24 places cover_media_id** implemented; **§25 Workspace Lists + Files** implemented; **§26 Family Collections** phases 0–5 + catalog map-partial Bookmark implemented; **§27 Family Settings + membership admin** implemented; **§28 Family Admin governance foundation** implemented; **§29 / W8.5.1 Web Workspace Change-Request parity** implemented; **§30 / Phase 1B Family permission matrix + product audit** implemented; **§31 / Phase 1C Family packing templates** implemented; **§32 / Phase 1D Family place-category taxonomy** implemented; **§33 / Phase 1E Family defaults + member preference inheritance** implemented; **§34 Family notification delivery** implemented; **§35 Identity assurance + private-file policy** foundation live; **§35.1 enforcement active** (`20260821202732`; cleanup cron POST 200; residual device MFA/file checks unconfirmed); **§36 / Phase 1F Workspace place categories** implemented; **§37 / Phase 1G Family feature rollouts** **live** (`20260822022800`; pilots remain default-on); **§38 / Phase 1H Family-scoped data export** **live** (`20260822044105`; AAL **141**; dispatcher cron POST 200); **§39 Production invitation readiness** — invitations **blocked** until corresponding source, residual §35.1 device/browser assurance, and §38 24-hour export expiry all pass)
**Audience:** Agents and humans implementing web phases W8–W9  
**Repo:** This repository (`FamilyTravelSite`) — sibling to the iOS app  
**Canonical domain / schema:** Family Travel App (`FamilyTravelApp`) — Supabase migrations, RLS, product docs, iOS  
**Non-goals of this file:** Feature work for W3+ starts against these locks only.

If a later plan conflicts with this document, **update this file first** (new explicit lock), then implement. Do not silently reopen A/B decisions in code.

---

## 1. Purpose

Freeze how the TREK-derived Vite/React shell becomes the **Family Travel member web client** so that:

- One Supabase project is shared with iOS (Auth, RLS, RPCs, Storage, Realtime).
- Nest + SQLite are **not** the system of record for family domain data.
- Trip Places, Explore discovery, and personal saved picks stay distinct (same product locks as iOS).
- TREK visual/interaction language remains the member-web UX source of truth (adapters behind the same chrome).

---

## 2. Sibling layout

| Repo | Owns |
|------|------|
| **FamilyTravelSite** (this repo) | Web UI (TREK shell), web adapters, this locks file, AGPL LICENSE/NOTICE |
| **FamilyTravelApp** | iOS SwiftUI, `supabase/` migrations, product/architecture docs, schema DBML |

Do **not** add a `web/` tree under FamilyTravelApp. Do **not** treat `/Users/Misael/Downloads/TREK` as the product tree (reference only).

**Git:** `https://github.com/Misael-L/FamilyTravelSite`  
**Day-to-day:** `npm run dev` (alias `dev:web`) with `client/.env.local` (Supabase URL + **anon** key). Unset `VITE_DATA_PLANE` defaults to **`supabase`**. Family host: Cloudflare Workers Static Assets (asset-only Worker). Cloudflare Access is **not** member login. See §7 and §38.  
**Legacy TREK/SQLite:** `npm run dev:nest` (sets `VITE_DATA_PLANE=nest`). Do not delete `server/`.

---

## 3. Target architecture

```text
┌─────────────────────────────────────────┐
│  FamilyTravelSite (Vite / React)        │
│  pages / components / store (UI shell)  │
│  client/src/repo/* → Supabase adapters  │
│  client/src/data/supabase/*             │
└──────────────────┬──────────────────────┘
                   │ @supabase/supabase-js + JWT
                   ▼
┌─────────────────────────────────────────┐
│  Same Supabase project as iOS           │
│  Auth · RLS · RPCs · Storage · Realtime │
└─────────────────────────────────────────┘

Nest / SQLite / axios baseURL `/api`  →  retired for domain data (temporary proxy only)
```

**Seam:** Prefer rewriting `client/src/repo/*` implementations over spraying Supabase calls through components.  
**BFF:** Do not keep Nest as a long-term translation layer. Thin Edge Functions only when the browser must not hold secrets.  
**IDs:** New code is UUID-first (`auth.uid()`, `people.id`, trip UUIDs). Do not leak TREK numeric user/trip ids into new adapters.

**Data-plane flag:** `VITE_DATA_PLANE=nest|supabase`. Unset defaults to **`supabase`**. Nest is only active when `VITE_DATA_PLANE=nest` (see §17). Dual-mode UI branches stay; do not delete Nest.

---

## 3.1 Sources of truth (do not conflate)

| Layer | Source of truth | Architect may… |
|-------|-----------------|----------------|
| **Member web chrome / interaction language** | TREK UI (Dashboard, Navbar `trek-nav-pill`, TripPlanner layout, map chrome) | Improve a11y, perf, adapters behind the same pixels — **not** invent a new workspace/hub UX |
| **Domain / schema / RLS / product splits** | FamilyTravelApp Supabase + product/explore locks | Normalize, migrate, RPC, indexes, security — preserve **business intent**, not Nest/SQLite shapes |
| **Data plane** | Supabase Auth + RLS | Replace Nest calls with `client/src/data/supabase/*` and `repo/*` adapters |

**Rule of chrome:** Prefer **empty / zero / toast** over deleting TREK structure when Nest-backed data is missing. Proven W2 regressions: missing `trek-nav-pill` (addons never loaded), shorter `.atlas` (no travel stats → empty flags). Fix by **feeding or stubbing data**, not by hiding sections.

---

## 4. Compliance map

| Layer | TREK today | Compliant end state | Phase |
|--------|------------|---------------------|--------|
| Identity | `/api/auth/*`, own users JWT | Supabase Auth; `people` + membership; request-access gate | **W1 implemented** |
| Authz | permissionsStore / addons | RLS + governance RPCs; hub chrome from `canMutateTrips` (patriarch/parent); **workspace published writes** from RPC `can_mutate_trip` (HOF only) | **W2 hub helper**; **W4 Places**; **W5 Plan** |
| Data | SQLite via Nest | Family schema (`trips`, `trip_places`, `schedule_items`, expenses, catalog, `person_catalog_saves`, …) | W2–W6 |
| Maps | Leaflet / Mapbox / MapLibre settings | **Default Mapbox GL**; Leaflet and MapLibre **remain** selectable; family layers on Mapbox path first | W3, W7–W8 |
| Discovery | Search → trip place; Collections addon | **Not the same** as Explore — catalog/OSM ladder, hearts, purview | W8 |
| Realtime | TREK WebSocket | Supabase Realtime (selective) or refresh until needed | **W9.2 deferred** |
| Hosting | Docker all-in-one | Static/SPA + Supabase; CF Access optional for admin only | W0 / deploy |

---

## 5. Product splits (never merge)

| Concept | Meaning | Not |
|---------|---------|-----|
| **Trip Places** | `trip_places` — destinations on this trip (Places sidebar / PlaceInspector). Optional Family palette on the association (`family_place_category_id`, §36) | Explore Saved, Collections, catalog `place_type_id` |
| **Explore** | Country-scoped catalog + ephemeral OSM; callout → partial → detail | Silent add to trip; OSM save |
| **Saved picks** | `person_catalog_saves` (person-scoped hearts) | Atlas `user_place_marks`; `lists` / `list_items`; TREK Nest Collections |
| **Named lists** | `lists` / `list_items` — family Collections wishlists (Idea/Want/Visited) | packing/todos; hearts; Nest `/addons/collections` |
| **Add to trip** | P5/P5.1 rules (purview / governance) | Expanding destinations via heart alone |

iOS Explore locks remain authoritative for ladder behavior: FamilyTravelApp `docs/workspace-explore-locks.md`.

---

## 6. Maps

- **Default** map engine: **Mapbox GL**.
- **Do not remove** Leaflet or MapLibre from settings/variety.
- Family polygons, catalog pins, and Explore layers are explicit work (W7–W8)—not “turn Mapbox on and hope.”

---

## 7. AGPL

This tree derives from TREK (AGPL). Keep root `LICENSE` and `NOTICE`. (Compliance checklist — **not legal advice**.)

- Before any **public** network host of a modified derivative, plan corresponding-source / written-offer obligations.
- Intended Family host: **Cloudflare Workers Static Assets** (asset-only Worker, Workers Free) + the same Supabase project as iOS. Bake `VITE_SUPABASE_URL` and the **anon** key at **build** time. Never put the service-role key or `CRON_SECRET` in Cloudflare, including build variables, Worker `vars`, or secrets.
- SPA fallback: root [`wrangler.jsonc`](../wrangler.jsonc) `assets.not_found_handling = "single-page-application"` serving `client/dist`. No Worker `main`, no assets binding, no Pages Functions, no Cloudflare Access in front of member login. Pin Node 22 via `.node-version` so Workers Builds does not use its Node 24 default.
- Workers Builds: private GitHub repo `FamilyTravelSite`, production branch `main`, root directory blank, build `npm run build:web`, deploy `npx wrangler deploy`. Non-production branch builds stay **off** until a separate preview origin is configured. Client-only build vars from `client/.env.example`. Do not duplicate those as runtime Worker variables.
- Production origin (2026-08-22): `https://familytravelsite.lmisael0721.workers.dev`. That exact origin is the Supabase Auth Site URL; redirect allow-list is `https://familytravelsite.lmisael0721.workers.dev/**` and `http://localhost:5173/**`. A custom domain can come later without changing the data plane.
- Cloudflare Access is **not** member login.
- Hosting rollback: `npx wrangler rollback --name familytravelsite` (previous healthy version `4de80700-1033-47f8-9dc8-c4ea6f24c281`), or disable `workers.dev`; revert Auth Site URL to `http://localhost:3000` and drop the workers.dev allow-list entry if the origin must go dark. Leave the live §38 Supabase backend untouched. Corresponding-source mechanism is a **sanitized public source mirror/tag** matching the live production commit — see §39. Family invitations stay **blocked** until that offer, residual §35.1 device/browser assurance, and §38 24-hour export expiry all pass.
- The Docker / Nest image remains the TREK self-host path, not Family SoR. Pin `VITE_DATA_PLANE=nest` in that image’s client build.

---

## 8. Frozen microplan sequence (W0–W9)

1. **W0** — Program locks + Supabase client bootstrap — **implemented**  
2. **W1** — Identity + membership gate (Supabase Auth; no Nest auth happy path) — **implemented** (`dev:web`, authStore supabase plane, `/request-access`)  
3. **W2** — Trips hub (read) + capability model — **implemented** (Supabase `trips` list active/archived; UUID hub DTO; Nest stats/upcoming skipped; hero enrichment is **§22**; `/trips/:uuid` → W3 workspace). **W2.1 hub writes** — **implemented** (see §10.1). **W2.1b** — **implemented** (see §10.2). **W2.1c** — **implemented** (see §10.3)
4. **W3** — Workspace shell + Map (`trip_places` only) — **implemented** (W3.0 hub parity + TripPlanner shell + Mapbox/`trip_places` pins; see §11)
5. **W4** — Places inventory + TREK rails (`trip_places` list/add/remove; Plan chrome + `trip_days` spine) — **implemented** (see §12)  
6. **W5** — Plan / `schedule_items` — **implemented** (see §13); **W5.1** notes + day titles — **implemented** (see §13.1)  
7. **W6** — Costs — **implemented** (see §14); **W6.1 Transport** — **implemented** (see §14.3); **W6.2 Bookings** — **implemented** (see §14.1); **W6.3 booking import** — **implemented** (see §14.2)  
8. **W7** — Family map layers — **implemented** (see §15); **W7.1** Catalog↔OSM toggle — **implemented**; **W7.2** spatial scope — **implemented**  
9. **W8** — Explore web parity — **implemented** (see §16); **W8.1–W8.7** implemented  
10. **W9** — Cut Nest from default + harden — **W9.0 / W9.1 implemented** (see §17). **W9.2** Realtime deferred (refresh until needed)  
11. **§18** — Family Plan PDF / Download ICS (in-browser) + Settings password — **implemented** (Share still toast; subscribe is §20)  
12. **§19** — Trip recorded tracks (`trip_tracks`) + Places Import file — **implemented** (List Import still toast)  
13. **§20** — Calendar subscribe (all-trips Edge feed) — **implemented**  
14. **§21** — Hub Duplicate (`duplicate_trip` RPC → new proposal) — **implemented**  
15. **§22** — Hub boarding-pass stats (`trip_places` / `trip_travelers` enrichment) — **implemented**  
16. **§23** — Family Vacay on TREK chrome (`family_calendar_entries` + additive settings / family days / PTO) — **implemented** (**QC Stage A** year clamp / paint truth; **QC Stage B** iOS palette fallback + Public holidays copy; **QC Stage C** calendar RLS + PERSONS overlay)  
17. **§24** — Places `cover_media_id` + hub/Explore/Places-rail embeds — **implemented**  
18. **§26** — Family Collections backend (`lists` / `list_items` evolve; RPC writes) — **implemented** (phases 0–5).
19. **§27** — Family Settings + membership admin (TREK `/admin` + `/settings`) — **implemented** (own-avatar `register_person_avatar` + email re-auth)
20. **§28** — Family Admin governance foundation — **implemented** (control-plane split, capability vocabulary, Supabase/Nest isolation)
21. **§29 / W8.5.1** — Web Workspace Change-Request parity — **implemented** (Published / My Draft, five `trip_change_*` modules, Propose / withdraw, HOF inbox)
22. **§30 / Phase 1B** — Family permission matrix + product audit — **implemented** (Postgres-owned matrix, action-aware RLS, append-only audit, Admin panels, per-action Workspace outcomes)
23. **§31 / Phase 1C** — Family packing templates — **implemented** (web Admin authoring; Workspace list/apply/save-from-trip unchanged)
24. **§32 / Phase 1D** — Family place-category taxonomy — **implemented** (web Admin palette; first consumer is §36)
25. **§33 / Phase 1E** — Family defaults and member preference inheritance — **implemented** (portable display prefs only; Nest defaults stay Nest-only)
26. **§34** — Family notification delivery — **implemented** (in-app inbox + iOS APNs for access/proposal/change-request events; Nest webhook/ntfy/plugins stay Nest-only)
27. **§35** — Identity assurance and private-file policy — **implemented** (35A TOTP/bootstrap/link RPCs + 35B finalize-upload/cleanup; Admin Settings active; **§35.1 enforcement active**)
28. **§36 / Phase 1F** — Workspace place categories — **implemented** (nullable `trip_places.family_place_category_id`; TREK Workspace assignment; iOS parity)
29. **§37 / Phase 1G** — Family feature rollouts — **live** (`20260822022800`; product catalog + global rollout + per-family override; web Admin authors; web/iOS consume; Vacay / Collections / Workspace place-category pilots default-on)
30. **§38 / Phase 1H** — Family-scoped data export — **live** (`20260822044105`; web Admin patriarch-gated JSON portability; distinct from platform backup/PITR; iOS capability vocabulary only)
31. **§39** — Production invitation readiness — **in progress; invitations blocked** (public corresponding-source mirror, residual §35.1 device/browser assurance, live-origin export expiry). W0–W9 and Phase 1A–1H stay closed.

**Gate rule:** Do not start W8 until W3–W4 are solid (Places vs Explore confusion is the primary footgun). Do not send family invitations until every §39 mandatory gate passes.

### W8 sub-sequence

| Sub | Scope |
|-----|--------|
| W8.1 | Callout |
| W8.2 | Partial card |
| W8.3 | Explore tab shell |
| W8.4 | Entity detail |
| W8.5 | Add to trip + purview |
| W8.6 | `person_catalog_saves` + Saved filter |
| W8.7 | Proposal hints (P7 on web Propose + vote) |

---

## 9. Out of scope (W0–W9 unless promoted)

- Next.js migration  
- Cloudflare Access as member login  
- Dual-write to SQLite / Nest as SoR  
- TREK MCP, plugins, demo mode, AirTrail  
- Inventing parallel tables “to make TREK shapes happy”  
- Atlas `user_place_marks` dual-write for Explore hearts  
- Redesigning hub/workspace chrome instead of adapting TREK (see §11 anti-patterns)

---

## 10. W0–W2 gate checklist

- [x] W0 locks + supabase client bootstrap  
- [x] FamilyTravelApp architecture pointer  
- [x] `npm run dev:web` (client-only)  
- [x] Supabase Auth login/logout/session restore  
- [x] Membership snapshot + `/request-access` when not a family member  
- [x] Nest skipped on supabase plane (app config / sync triggers)  
- [x] W2 hub lists family trips (active + archived) via Supabase RLS  
- [x] W2 UUID hub DTO (not Nest numeric Trip schema)  
- [x] W2 read-only (superseded by §10.1 W2.1): mutation chrome visible; create/edit/delete/archive/copy toasted until W2.1
- [x] W2.1 Propose via `create_trip_proposal`; reviewer archive/restore/delete; copy toasted in this slice (superseded by §21)
- [x] W2.1b hub pencil: creator of an open proposal → `update_trip_proposal` (see §10.2)
- [x] W2.1c hub vote/decide/shelf: other-member pencil + Pending proposals → live proposal RPCs (see §10.3)  
- [x] W2 Nest travelStats / upcoming skipped (no false outage). Hero bundle on UUID trips is **§22** (not Nest `/api/trips/:id/bundle`)  
- [x] W2 `/trips/:uuid` soft-lands W3 workspace shell (no Nest planner)  
- [x] Web capabilities from membership (`canMutateTrips`), not TREK addons  

---

## 10.1 W2.1 — Hub writes (Propose + archive)

**Status:** Implemented.  
**Scope:** Family My Trips plus / New trip card open TREK New Trip (with Occasion + Travelers), then Countries → Cities → Notes → Review, and save once via `create_trip_proposal`. Reviewer archive / restore / delete use existing `trips` RLS. Duplicate in this slice stayed toast (superseded by **§21**). Pencil → §10.2.

```text
Dashboard (TREK chrome)
  → FAB / add-trip card → FamilyProposeTripModal
       step 1: TREK New Trip (cover, title, dates, reminder, Occasion, Travelers; no currency)
       Continue (no save) → Countries → Cities → Notes → Review
       Submit → RPC create_trip_proposal
  → Archive / Restore / Delete on boarding-pass + trip cards
       UPDATE/DELETE trips (family-wide archived_at / hard delete)
       canMutateTrips toast “Reviewers only”; RLS can_review_access is the lock
  → Pencil → §10.2 (creator edit) / §10.3 (other-member vote) / toast if published
  → Duplicate → §21 (`duplicate_trip` RPC)
```

**Writes**

| Action | Who | How |
|--------|-----|-----|
| Propose | Any active member | `create_trip_proposal` (security definer). Members cannot `INSERT` `trips`. |
| Archive / restore / delete | patriarch / parent / super-admin | Direct `trips` UPDATE/DELETE. Existing `trips_write_reviewers` / `can_review_access`. No new SQL. |
| Pencil | Creator of open proposal | §10.2 `update_trip_proposal` |
| Pencil / shelf | Other members / decide | §10.3 vote / decide / escalate RPCs |
| Duplicate | Any active member | **§21** `duplicate_trip` (wraps `create_trip_proposal`). Not iOS client insert. |

Hub lifecycle is **not** workspace `can_mutate_trip` (HOF). Keep TREK mutation buttons visible; non-reviewers toast. After Propose: reload hub, stay on My Trips. `?create=1` opens the Family modal on supabase.

**Chrome:** TREK New Trip as step 1 ([`TripFormModal`](../client/src/components/Trips/TripFormModal.tsx) visual reference, not the Nest component). Family mods: Occasion chips `trip \| vacation \| weekend \| other`; label Travelers (Family-only copy — do not rename Nest `dashboard.addMembers`). Unsplash via Edge `search-unsplash` (JWT). Local cover file toasts (no Storage). No currency picker.

**iOS blast radius:** none. Call live RPC + existing UPDATE/DELETE only.

**Anti-patterns (do not)**

- Mount Nest `TripFormModal` on UUID hub
- Browser `INSERT` into `trips`
- `can_mutate_trip` for hub archive/delete
- iOS copy-insert from the browser (hub Duplicate is **§21** RPC)
- Persist local cover / Files / `trip-files`
- Add `p_currency_code` / currency picker on Propose
- `person_trip_state` (archive-for-me)
- Workspace Propose drafts (W8.5.1)

### W2.1 checklist

- [x] §10.1 intent locked
- [x] `createTripProposal` / `searchCountries` / family roster / `search-unsplash` / archive/unarchive/delete
- [x] `FamilyProposeTripModal` (TREK New Trip + Occasion + Travelers, then four Family steps)
- [x] `useDashboard` + `DashboardPage`: Propose; archive/delete via existing RLS; copy toast; Nest `TripFormModal` unchanged
- [x] Family propose i18n; `tsc --noEmit`; targeted Vitest

---

## 10.2 W2.1b — Hub pencil for open proposals

**Status:** Implemented.  
**Scope:** TREK hub pencil. If the current member created an **open** trip proposal (`submitted` or `in_review`), reopen the same Propose modal and save via `update_trip_proposal`. Other members → §10.3 vote modal. Published / no open proposal stay toast. Duplicate is **§21**.

```text
Dashboard (TREK chrome)
  → Pencil on a trip card
       load open proposals (proposal_type = trip, status in submitted | in_review)
       creator (proposed_by_person_id === personId) → FamilyProposeTripModal edit mode
            load trip + trip_countries + trip_places + trip_travelers
            Submit → RPC update_trip_proposal (does not reset votes)
       else open proposal → §10.3 vote modal
       else → toast (published / no open proposal)
  → Duplicate → §21
```

**Writes**

| Action | Who | How |
|--------|-----|-----|
| Edit open proposal | Creator only | `update_trip_proposal` (security definer). Payload matches create minus `p_family_id`, plus `p_proposal_id`. RPC does not reset votes. |
| Other-member pencil | Eligible voters | §10.3 |
| Published pencil | — | Toast. Do not PATCH `trips` from the hub. |

Match iOS hub pencil: open + you proposed → edit wizard; open + someone else → vote (§10.3); no open proposal → stub (web: toast). After save: silent reload hub, stay on My Trips. Pencil stays visible.

**iOS blast radius:** none. Call live `update_trip_proposal` only. No migration.

**Anti-patterns (do not)**

- PATCH / UPDATE `trips` from the hub pencil
- Vote / decide / escalate / proposal-shelf UI (that is §10.3, not Explore W8.7)
- Copy RPC / iOS copy-insert in this slice (hub Duplicate is **§21**)
- `can_mutate_trip` for this path
- Mount Nest `TripFormModal` on UUID hub
- Published-trip hub edit (workspace later)

### W2.1b checklist

- [x] §10.2 intent locked
- [x] `listOpenTripProposals` / `fetchTripProposalEditSource` / `updateTripProposal`
- [x] `FamilyProposeTripModal` edit mode (`editingProposalId`)
- [x] `useDashboard` pencil: creator of open proposal → editor; else §10.3 / published toast
- [x] i18n toasts; `tsc --noEmit`; targeted Vitest

---

## 10.3 W2.1c — Hub vote, decide, and proposal shelf

**Status:** Implemented.  
**Scope:** TREK hub pencil for someone else’s open proposal opens a vote/decide modal on live RPCs. A Pending proposals shelf sits above My Trips and opens the same modal. Duplicate is **§21**. This is **not** Explore W8.7 (iOS P7 proposal hints).

```text
Dashboard (TREK chrome)
  → Pencil (open proposal, not creator) → FamilyProposalVoteModal
       Yes / No / Abstain → RPC cast_proposal_vote
       Approve / Reject if can_decide_proposal → RPC decide_trip_proposal
       Escalate if can_escalate_proposal → nested modal → RPC escalate_trip_proposal
  → Pending proposals shelf (open proposals only) → same modal
  → Duplicate → §21
```

**Writes**

| Action | Who | How |
|--------|-----|-----|
| Vote | Eligible audience member | `cast_proposal_vote` only. No client `INSERT`/`UPDATE` on `proposal_votes`. |
| Decide | `can_decide_proposal` | `decide_trip_proposal`. Advisory-all-no requires confirm (`advisory_all_no_confirm_required`). Accept → trip `planning`→`upcoming`. |
| Escalate | `can_escalate_proposal` | `escalate_trip_proposal` (preserves votes). |

Keep TREK pencil pixels (do not swap to iOS thumbs-up). Creator pencil stays edit (§10.2). Creator may still open the vote modal from the shelf. After vote: stay in modal and reload tallies. After accept/reject: close + silent hub reload.

**iOS blast radius:** none. Call live RPCs only. No migration.

**Anti-patterns (do not)**

- PATCH / UPDATE `trips` from the hub
- Direct writes to `proposal_votes`
- Reuse `FamilyProposeTripModal` for voting
- Nest collab polls / `collab.polls.*`
- Explore W8.7 / iOS P7 proposal hints
- Copy RPC / Duplicate in this slice (hub Duplicate is **§21**)
- `can_mutate_trip` for this path
- Invent a parallel Family hub (shelf uses existing `sec-head` / card language)

### W2.1c checklist

- [x] §10.3 intent locked
- [x] Vote/decide/escalate adapters + `hubPencilAction` vote branch
- [x] `FamilyProposalVoteModal` + escalate nested modal + advisory-all-no confirm
- [x] `useDashboard` pencil vote vs edit; Pending proposals shelf
- [x] i18n; `tsc --noEmit`; targeted Vitest

---

## 11. W3 — Workspace shell + Map (locked intent)

**Status:** Intent locked; **implemented**.  
**Principle:** TREK UI is the source of truth for member-web chrome. Work = adapters + UUID routes + family map/POI behavior. Prefer empty/zero/toast over deleting chrome.

```text
Dashboard (TREK chrome)
  → /trips/:uuid
  → TREK TripPlanner shell
  → supabase adapters → trips + trip_places (RLS)
  → Mapbox GL (default) → destination pins from trip_places only
```

### W3.0 hub parity (first implementation gate — before map work)

Do this before replacing the TripPlanner placeholder:

- Restore `trek-nav-pill` structure on the supabase plane (at least **My Trips**; stub or soft-gate Nest addons **without removing the pill**).
- Feed atlas cards from `family_travel_stats` (+ countries when available), matching the iOS hub — so passport flag strip / row height match TREK when data exists; zeros still reserve layout where CSS requires it.

### W3 workspace + map (after W3.0)

- Replace the W2 placeholder with the existing TREK `TripPlannerPage` **shell** on the supabase plane — do **not** invent a new page.
- Load trip by UUID via Supabase (`trips` + membership RLS).
- Map **destination pins** from `trip_places` only.
- Default map engine **Mapbox GL**; keep Leaflet/MapLibre selectable (§6).
- UUID routes end-to-end; no invented numeric Nest ids.
- Preserve TREK map chrome (including POI pill UI if present); catalog foods/experiences/hotels layers stay **off or empty** until W7–W8 — do **not** delete the control.
- Keep mutation toast pattern until dedicated write phases.

### Out of W3

- Places sidebar inventory writes (W4)  
- Plan / `schedule_items` (W5)  
- Costs (W6)  
- Family polygons / catalog Explore pins (W7–W8)  
- Nest planner CRUD as system of record  

### W3+ anti-patterns (forbidden)

- Deleting or gating away TREK chrome because Nest APIs are skipped  
- Building a parallel “Family workspace” UI instead of adapting TripPlanner  
- Coercing UUID trips into `@trek/shared` numeric `Trip` as SoR  
- Merging Trip Places with Explore / Collections / `person_catalog_saves`  

### Implementation note (when coding starts)

Adapters first (`data/supabase/` trip places + stats), then thin TripPlanner early-load branch (remove Nest-only placeholder), then Mapbox pin source = `trip_places`.

### W3 gate checklist

- [x] W3 intent locked in this document  
- [x] W3.0: `trek-nav-pill` visible on supabase (My Trips minimum; no chrome deletion)  
- [x] W3.0: atlas fed from `family_travel_stats` (+ countries when available); layout parity with TREK  
- [x] W3: TripPlanner shell on `/trips/:uuid` (supabase plane; no Nest trip load)  
- [x] W3: Mapbox default; `trip_places` destination pins only  
- [x] W3: POI / catalog pill chrome preserved (layers empty until W7–W8)  

W3+ builds on authenticated membership + trip UUID routes + TREK chrome parity.

---

## 12. W4 — Places inventory + TREK rails (locked intent)

**Status:** Intent locked; **implemented**.  
**Locked write depth:** 1A — list + select/inspector + add existing catalog place + remove + show primary.  
**Locked non-HOF:** 2A for **published** `trip_places` writes (`can_mutate_trip` HOF only). Eligible travelers stage add/remove on **My Draft** via §29 / W8.5.1.  
**Principle:** TREK Plan/Places frosted rails are business intent. W3 placeholder `<aside>`s were a chrome regression (§3.1 / §11). W4 mounts the same pixels as `TripPlannerPage` (blur, collapse, resize, mobile Plan/Places sheets).

```text
/trips/:uuid
  → FamilyTripWorkspaceShell (supabase plane; Nest TripPlannerNestPage untouched)
  → TREK frosted left/right rails + mobile sheets
  → FamilyDayPlanSidebar  ← trip_days spine (empty assignments; writes toast → W5)
  → FamilyPlacesSidebar   ← trip_places inventory (HOF writes via RLS)
  → FamilyPlaceInspector + FamilyCatalogPlacePicker
  → adapters → can_mutate_trip, trip_places, places catalog, sync_trip_days
```

### Capability split (do not conflate)

| Helper | Who | Where |
|--------|-----|--------|
| `canMutateTrips` (client, membership role) | patriarch / parent / super-admin | Hub archive/copy chrome only |
| RPC `can_mutate_trip` (`canMutateTrip(tripId)`) | HOF / `is_family_head` | Workspace **published** writes (Places add/remove; later Plan) |

Do **not** reuse the hub helper for Places add/remove. Do **not** silently narrow `canMutateTrips` to HOF-only (would break hub chrome).

### Chrome correction (W4.0)

- Replace W3 flat placeholder asides with TripPlanner rail geometry: `--sidebar-bg`, `blur(24px) saturate(180%)`, radius 16, `--sidebar-shadow`, collapse buttons (black when collapsed), resize handles.
- Mobile: Plan/Places portal buttons + full-height sheet (`trip.mobilePlan` / `trip.mobilePlaces`). Desktop-only was a W3 gap.
- **Plan spine (read in W4, not W5):** best-effort `sync_trip_days` then `trip_days` ordered by `day_index`. Empty day = TREK `dayplan.emptyDay`, not a phase label. All Plan mutations toast until W5. Zero days still show TREK toolbar + empty list.
- **Plan toolbar Undo:** always mount `Undo2` (PDF → ICS → expand → **Undo** → reorder), matching TREK `DayPlanSidebarToolbar` / iOS `TripPlanToolbar`. Do **not** gate visibility on `onUndo` being passed (Nest did; that deleted chrome on the Family plane). W4: muted/`aria-disabled` + toast; W5 wires real `canUndo`/`onUndo`.
- **Places chrome:** All / Unplanned filter tabs stay (until W5 every destination is unplanned — zero-feed, not chrome deletion). Import GPX / Google-list buttons stay visible and toast.

### Places inventory (W4.1 / 1A)

- UUID DTO `FamilyTripPlace` — **not** `@trek/shared` `Place`. Nest `PlacesSidebar` / `DayPlanSidebar` / `PlaceInspector` / `PlaceFormModal` stay on the Nest plane.
- List + search + count; primary badge display-only (no set-primary write in W4).
- Click row ↔ map `selectedPlaceId` (string UUID).
- Add existing catalog place via `FamilyCatalogPlacePicker` (not Nest `PlaceFormModal`). Scope search to `trips.primary_country_id` ∪ `trip_countries`; if none, require ≥2 search chars.
- Remove: confirm → `DELETE schedule_items` then `DELETE trip_places` (same order as iOS) if HOF; else toast.
- Slim inspector: avatar, name, notes, maps links, delete. Soft-gate edit, photos, Collections, Nest enrichment, assign-to-day.
- Nest extras (bulk category, Collections, file/list import, assign-to-day) → toast.

### Out of W4

- `schedule_items` CRUD / assign-to-day (W5)
- Draft change-requests for Places add/remove — **§29 / W8.5.1** (implemented)
- Explore add-to-trip (W8.5); GPX/Google import; Collections
- Creating new catalog places; set-primary write
- Nest planner CRUD as SoR

### W4 anti-patterns (forbidden)

- Mounting Nest sidebars by hashing UUIDs into numeric `@trek/shared` ids
- Reusing hub `canMutateTrips` for workspace Places writes
- Deleting Unplanned / import / Plan toolbar chrome because schedule is empty
- Hiding Plan **Undo** until an undo stack exists (always mount; mute + toast until W5)
- Inventing a third workspace layout besides `FamilyTripWorkspaceShell` / Nest `TripPlannerNestPage`

### W4 gate checklist

- [x] W4 intent locked in this document  
- [x] Frosted TREK rails + collapse/resize + mobile Plan/Places sheets  
- [x] Places list / inspector / add catalog / remove / primary badge  
- [x] HOF writes via `can_mutate_trip`; non-HOF toast  
- [x] Plan empty spine from `trip_days` (no “coming soon”)  
- [x] Nest extras toasted (import, Collections, assign-to-day, Plan mutations)  
- [x] `tsc --noEmit` clean on client  

---

## 13. W5 — Plan schedule (`schedule_items`) (locked intent)

**Status:** Intent locked; **implemented**.  
**Locked write depth:** 1A — load schedule into day rows; assign place→day; remove from day; within-day reorder; Unplanned filter; client Undo.  
**Locked non-HOF:** 2A for **published** `schedule_items` writes (`can_mutate_trip` HOF only). Eligible travelers stage Plan add/remove/reorder on **My Draft** via §29 / W8.5.1.  
**Follow-on:** **W5.1** = `day_notes` upsert + optional `trip_days.title` edit — **implemented** (see §13.1).

```text
/trips/:uuid
  → FamilyTripWorkspaceShell
  → FamilyDayPlanSidebar  ← trip_days + schedule_items (civil starts_at)
  → FamilyPlacesSidebar / Inspector  ← Assign to day (HOF)
  → adapters → can_mutate_trip, schedule_items, trip_days, trip_places
```

### Capability

Same as Places: workspace published Plan writes = RPC `can_mutate_trip` (HOF). Do **not** use hub `canMutateTrips`.

### Domain attachment

- Day membership = UTC civil date of `schedule_items.starts_at` equals `trip_days.civil_day`.
- Within-day order = `sort_order` (not Nest numeric assignment ids).
- Assign = `INSERT` with `activity` = place name, `place_id`, `starts_at` = UTC midnight of target day, `sort_order` = max(day)+1.
- Remove = `DELETE` that schedule row (place stays on `trip_places`).
- Unplanned = trip place with no `schedule_items` row for that `place_id`.

### Undo (command stack — intentional delta vs iOS)

iOS Plan undo only restores `sort_order`/`starts_at` and does **not** reverse insert/delete. Web W5 uses Nest-style command undo (`pushUndo(label, undoFn)`): assign undo deletes the new row; remove undo re-inserts captured fields; reorder undo restores prior sort orders. Cap ~30. Always keep Undo chrome mounted.

### W5 anti-patterns (forbidden)

- Mounting Nest `DayPlanSidebar` via hashed UUIDs
- Hub `canMutateTrips` for Plan writes
- Copying iOS incomplete snapshot undo for assign/remove
- Shipping `day_notes` / day title / add-reorder-days / transport / Day Detail / PDF/ICS in W5
- Nest cross-day DnD as W5 requirement (up/down arrows + day picker)

### Out of W5

| Deferred | Where |
|----------|--------|
| `day_notes` + day title edit | **W5.1** (see §13.1) |
| Add/reorder days spine | Later (former 1C) |
| Transport / bookings / Day Detail / PDF / ICS | W6+ / polish |
| Nest cross-day DnD | Later |
| Explore experience/food schedule rows | W8 |
| Draft `apply_trip_change_op_v1` | **§29 / W8.5.1** (implemented) |

### W5 gate checklist

- [x] W5 intent locked in this document  
- [x] `schedule_items` list + civil-day grouping into Plan day rows  
- [x] HOF assign place→day / remove / within-day reorder via `can_mutate_trip`  
- [x] Unplanned filter honest from schedule membership  
- [x] Command Undo wired to Plan toolbar  
- [x] Non-HOF toast; Nest extras (import, PDF/ICS, transport, notes) still toast  
- [x] W5.1 stub recorded (notes + day titles)  
- [x] `tsc --noEmit` clean on client  

---

## 13.1 W5.1 — Day notes + day titles (implemented)

**Status:** Implemented.  
**Scope:** Thin Plan polish after W5 schedule loop — not Day Detail / transport / spine reorder.

```text
FamilyDayPlanSidebar
  → note button → FamilyDayNoteSheet → day_notes (civil_day)
  → inline title edit → trip_days.title (NULL = default “Day N”)
```

### Domain

- `day_notes` keyed by `(trip_id, civil_day)` — **no** `trip_day_id` FK required.
- W5.1 UI = **one note per day** (first by `sort_order`), matching iOS `notes(for:).first`.
- Empty title → store `NULL` so default `dayplan.dayN` stays honest after `sync_trip_days`.
- Published writes = `can_mutate_trip` (HOF). Note body add/update/remove may be staged on **My Draft** (§29). Day-title edits stay HOF-only (`trip_days` is not a change-request module).
- Do **not** push notes/titles onto the W5 command Undo stack (schedule-only).

### Out of W5.1

Day Detail panel, weather/costs, multi-note reorder/icons/markdown, PDF/ICS, transport, add/reorder days. Note drafts are §29 (`day_note`); day titles are not.

### W5.1 gate checklist

- [x] W5.1 intent locked in this document  
- [x] `day_notes` list / upsert / delete adapters  
- [x] `updateTripDayTitle` adapter; empty → NULL  
- [x] Note sheet from Plan day note chrome (HOF save; viewers read-only)  
- [x] Inline day title edit + note preview under header  
- [x] Schedule assign loop unchanged; Undo stays schedule-only  
- [x] `tsc --noEmit` clean on client  

---

## 14. W6 — Costs (TREK CostsPanel + Family data plane)

**Status:** Implemented.  
**Scope:** Wire TREK Costs chrome to Supabase `trip_expenses*` — not a greenfield Costs UX.

```text
FamilyTripWorkspaceShell
  → Costs tab (finanzplan / Wallet / trip.tabs.budget)
  → CostsPanelFamily (same TREK pixels; Nest CostsPanel untouched on nest plane)
  → adapters → trip_expenses* + settlements + travelers + settlementEngine
```

### Pixel SoR vs data SoR

| Layer | Source of truth |
|-------|-----------------|
| Chrome | Nest `CostsPanel.tsx` on nest plane; Family `CostsPanelFamily.tsx` preserves the same Costs language (summary / ledger / settle / balances / category / modals / ticket split) |
| Domain | FamilyTravelApp `trip_expenses`, `trip_expense_shares`, `trip_expense_payers`, `trip_expense_settlements`, `trips.currency_code` |
| Settlement math | Client `lib/costs/settlementEngine.ts` (mirror iOS `CostsSettlementEngine`); persist settlements / `settle_trip_expense_flows` |
| Capability | Workspace `can_mutate_trip` (HOF) for published Costs and settle flows. Base expense add/update/remove may be staged on **My Draft** (§29). Splits, payers, tickets, reservation links, payments, and settle stay HOF-direct. |

### Anti-patterns (do not)

- Invent a parallel Costs product / slim redesign
- Mount Nest `CostsPanel` on UUID trips via ID hashing
- Overload Nest `budget_items` / `budgetApi` as Family SoR
- Revive legacy `BudgetPanel`
- Soft-delete the Costs tab “until data exists”

### Out of W6 (follow-on / polish)

| Slice | Notes |
|-------|--------|
| **W6.1 Transport** | **Implemented** (see §14.3) |
| **W6.2 Bookings** | **Implemented** (see §14.1) |
| **W6.3 booking import** | **Implemented** (see §14.2) — file → fields → `trip_reservations`; not Nest/Kitinerary |
| Day-badge weather | Plan polish, not Costs |
| Draft expense change-requests | Governance later |

### W6 gate checklist

- [x] W6 intent locked in this document  
- [x] `trip_expenses` / settlements / travelers adapters + settlement engine  
- [x] Family Costs chrome (TREK pixels) + Nest `CostsPanel` unchanged on nest plane  
- [x] Family shell Map + Costs tabs; full-bleed Costs; HOF writes  
- [x] Nest Costs tests still pass; `tsc --noEmit` clean  
- [x] Smoke vs iOS same trip (totals / shares / balances) — verify in app  

### 14.1 W6.2 — Bookings tab (`trip_reservations` non-transport)

**Status:** Implemented.  
**Scope:** Family workspace Bookings tab — list / edit hotel, restaurant, event, tour, other. Same table as Transport; **type filter**, not a second schema. Explore hotel stays (`hotel_id`) become visible and editable here.

```text
FamilyTripWorkspaceShell
  → Bookings tab (buchungen / Ticket / trip.tabs.reservations)
  → BookingsPanelFamily + FamilyBookingEditor (TREK pixels; Nest ReservationsPanel / ReservationModal untouched)
  → adapters → trip_reservations (BOOKING_TYPES) + optional trip_expenses.reservation_id
```

**Tab order:** Plan → Explore → **Transport** → **Bookings** → Costs. Do not move Explore.

**Writes:** HOF `can_mutate_trip` direct upsert/delete/status on **Published**. Eligible travelers stage Bookings apply-v1 header fields on **My Draft** (§29 `reservation`). Members may **read** the list. Location metadata, plan-links, expense links, and import stay unstaged.

**Hotel vs Explore:** Explore remains the catalog-hotel discovery path (thin stay dialog, stay on Explore). Bookings manages those rows and allows manual restaurant / event / tour / other (and title-only hotels). Do not silent-upsert `trip_places`. Place picker = existing trip destinations. Hotels force `schedule_item_id` null; preserve `hotel_id` on hotel edit.

**Hotel editor chrome:** `FamilyBookingEditor` hotel type matches TREK `ReservationModal` pixels — Accommodation | From | To (day selects) → Location / Address → Check-in | Check-in until | Check-out (time pickers). Persist `place_id` (existing `trip_places` only), `start_trip_day_id` / `end_trip_day_id`, `starts_at` / `ends_at` (civil from the selected days + times), `metadata.location`, `metadata.check_in_until`. Do not guess `hotel_id`. Explore’s thin stay dialog stays calendars.

**Create expense:** save booking first, then Costs tab with UUID `ExpensePrefill` + `reservation_id`. Category: hotel → accommodation, restaurant → food, event/tour → activities, other → other.

**Anti-patterns (do not)**

- Mount Nest `ReservationsPanel` / `ReservationModal` on UUID trips
- List transport types (flight/train/…) on this tab
- Endpoints / legs UX (Transport tab, §14.3)
- Map reservation overlays, file attach (Files stay HOF). Draft header fields are §29.
- Nest import jobs / Kitinerary / `BackgroundTasksWidget` on UUID trips (Family extract is **W6.3**)
- Wipe Explore `hotel_id` when editing a catalog stay

### W6.2 checklist

- [x] §14.1 intent locked (type filter, 2A, tab order, Explore hotel rows, create-expense `reservation_id`)  
- [x] `tripReservations.ts` list / upsert / delete / status; `insertHotelStay` wraps upsert  
- [x] `BookingsPanelFamily` + `FamilyBookingEditor`; Nest plane unchanged  
- [x] Shell Bookings tab; Costs UUID prefill + unlink  
- [x] Hotel editor chrome = TREK day selects + address + check-in/out times (not Explore calendars)  
- [x] `tsc --noEmit` clean; Nest ReservationsPanel tests unchanged  

### 14.2 W6.3 — Booking file import (extract → preview → review → upsert)

**Status:** Implemented.  
**Scope:** Family Book tab **Import from file** — in-browser extract (schema.org JSON-LD, pkpass, PDF text, EML/HTML/TXT heuristics) → TREK in-modal preview → `FamilyBookingEditor` review queue → `upsertTripBooking`. Destination is existing `trip_reservations`. No new table, RPC, Storage, Edge Function, Nest job, or Kitinerary.

```text
BookingImportModal (onExtract)
  → client/src/data/bookingImport (pure extract)
  → in-modal preview (existing reservations.import.* i18n)
  → FamilyBookingEditor prefill queue
  → upsertTripBooking (HOF / 2A unchanged)
```

**Chrome:** Drop-zone modal already mounted. Family `onExtract` stays in the modal (parsing → preview). Do **not** close-and-jobId, do **not** `addTask` / IndexedDB, do **not** mount Nest `BackgroundTasksWidget` on the supabase plane.

**Book vs Transport:** Preview lists every extracted item. Confirm/review **book** types via `FamilyBookingEditor` → `upsertTripBooking` and **transport** types via `FamilyTransportEditor` → `upsertTripTransport`. `upsertTripBooking` still **rejects** transport types.

**Places / days:** Match `place_id` only to an existing trip destination by name. Do not silent-upsert `trip_places`. Do not guess `hotel_id`. Match `trip_days` by exact civil date (`hotelStayDayIds`); do not clamp to the nearest day.

**Anti-patterns (do not)**

- POST Nest `importBookingAsync` / Kitinerary from UUID trips
- LLM / `tryAi` control
- Import-jobs table or `trip-files` attach (Files slice)
- Bulk insert without the review editor
- Creating catalog hotels from venue text
- iOS `TripBookingImportModal` in this slice (stub until extract is promoted)

### W6.3 checklist

- [x] §14.2 intent locked (browser extract, preview, mixed book/transport review)  
- [x] `client/src/data/bookingImport` + fixture tests  
- [x] Family `onExtract` preview; Nest job path unchanged  
- [x] Editor prefill queue → upsert; TREK Booking code \| Status grid  
- [x] `tsc --noEmit` clean; Nest booking-import tests untouched  

### 14.3 W6.1 — Transport tab (`trip_reservations` transport types)

**Status:** Implemented.  
**Scope:** Family workspace Transport tab — list / edit flight, train, bus, car, taxi, bicycle, cruise, ferry, transport_other. Same table as Bookings; **type filter**, not a second schema. Persist `trip_reservation_endpoints` + `trip_reservation_legs` (replace-as-unit, iOS order).

```text
FamilyTripWorkspaceShell
  → Transport tab (transports / Train / trip.tabs.transports)
  → TransportsPanelFamily + FamilyTransportEditor (TREK pixels; Nest ReservationsPanel / TransportModal / TransitSearchPanel untouched)
  → adapters → trip_reservations (TRANSPORT_TYPES) + endpoints/legs + optional trip_expenses.reservation_id
```

**Tab order:** Plan → Explore → **Transport** → Bookings → Costs.

**Writes:** HOF `can_mutate_trip` direct upsert/delete/status. Non-HOF **2A toast**. Transport legs/endpoints are **not** a change-request module — do not stage Transport on My Draft. Members may **read** the list.

**Endpoints / legs:** Header upsert, then delete legs → delete endpoints → insert endpoints → insert legs. Do not set `airline_id` (free-text `carrier_name`). Null `hotel_id` and `schedule_item_id` on transport rows. Honor day-integrity (`start.day_index ≤ end.day_index`). Airport search = Family Catalog `airports` (member RLS), not Nest `airportsApi`. Train/other locations = free text (+ optional existing `trip_places` name fill), not Nest `LocationSelect` / `mapsApi`.

**Automated / Transitous:** Keep TREK Manual | Automated chrome on create. Automated toasts “not available on this server”; do **not** write `type=transit`; do **not** mount `TransitSearchPanel`.

**Create expense:** save transport first, then Costs tab with UUID `ExpensePrefill` + `reservation_id`. Category: flight → `flights`; other transport → `transport`.

**Import:** Book and Transport tabs mount `BookingImportModal`. Confirm reviews mixed queue (book → `FamilyBookingEditor`; transport → `FamilyTransportEditor`). Seed two named endpoints from extract `venueName`/`location` when present; exact civil-day match; no clamp; do not guess `airport_id` unless extract IATA exact-matches catalog. AirTrail / Nest Kitinerary / LLM still forbidden.

**Plan shortcut (not Plan-row merge):** day-grid Plus opens Transport create (optional day seed); Tram opens Transport in Automated mode (toast). Do not inject transport rows into the Plan timeline.

**iOS blast radius:** live Transport list, Plan Day Detail non-hotel reservations, Costs `reservation_id`, `sync_trip_days` rematch of endpoint `local_date`. Wrong `type` or writing Bookings `hotel_id` / `schedule_item_id` / lodging metadata on transport rows would break lodging.

**Anti-patterns (do not)**

- Mount Nest `ReservationsPanel` / `TransportModal` / `TransitSearchPanel` on UUID trips
- Nest `airportsApi` / `LocationSelect` / `mapsApi` on the Family plane
- Write `type=transit` from Automated
- List booking types (hotel/…) on this tab
- Map geodesic/OSRM overlays, AirTrail, file attach, Plan timeline merge
- Guess `airline_id` or silent-upsert `trip_places` / `airports`

### W6.1 checklist

- [x] §14.3 intent locked (type filter, endpoints/legs replace-as-unit, 2A, Automated toast, import land, Plan shortcut)  
- [x] `listTripTransports` / `upsertTripTransport` / `searchAirports`; `costCategoryForTransportType`  
- [x] `TransportsPanelFamily` + `FamilyTransportEditor`; Nest plane unchanged  
- [x] Shell tab Plan → Explore → Transport → Bookings → Costs; Plan Tram/Plus  
- [x] Import mixed review queue; `upsertTripBooking` still rejects transport  
- [x] `tsc --noEmit` clean; Nest TransportModal tests unchanged  

---

## 15. W7 — Family map layers (catalog pins + footprints)

**Status:** Implemented (+ **W7.1** dual-source; **W7.2** spatial scope).  
**Scope:** Trip-scoped explore pins behind TREK POI pill + focused-place footprints. **Default OSM** via Edge `maps-pois`; sticky **Family Catalog** mode via dial bookmark (iOS `usesFamilyCatalog` parity). Explore ladder = W8. Atlas country polygons stay Atlas.

```text
FamilyTripWorkspaceShell
  → WorkspaceMapActionDial (Catalog bookmark) + PoiCategoryPill
  → useWorkspacePois
       off → maps-pois Edge (OSM)
       on  → catalogPois (foods / hotels / experiences)
  → MapView pois (+ place footprint GeoJSON when selected)
```

### Pixel SoR vs data SoR

| Layer | Source of truth |
|-------|-----------------|
| Chrome | `PoiCategoryPill` + Catalog dial + MapView `pois` — keep; do not toast-gate away |
| Pins (default) | Ephemeral OSM via Supabase Edge `maps-pois` (JWT; never Nest `/api/maps/pois`) |
| Pins (Catalog on) | Catalog tables `experiences` / `foods` / `hotels` (lat/lng bbox) |
| Footprints | Bundled place-boundary GeoJSON keyed by place name/aliases |
| Tab label | `trip.tabs.plan` (not a invented `trip.tabs.map` key) |
| Capability | Member reads only; no add-to-trip / hearts in W7 |

### Anti-patterns (do not)

- Nest Overpass / Nest `usePoiExplore` on the Family shell
- Catalog-only default that hides OSM without a toggle
- Atlas country/region polygons in trip workspace
- Explore callout / partial / Explore tab (W8)
- Merging Trip Places markers with catalog pins into one card system
- Deleting POI pill chrome when empty
- Silent Nest fallback when Edge fails — surface pill error instead

### Out of W7

| Slice | Notes |
|-------|--------|
| **W8.*** | Explore ladder, hearts, add-to-trip |
| Frame satellite on dial | Web has no workspace frame FAB yet |
| Transport tab | **W6.1 implemented** |
| Bookings tab | **W6.2 implemented** |

### W7 gate checklist

- [x] W7 intent locked in this document  
- [x] `listCatalogPoisInBbox` adapter (pill → catalog mapping)  
- [x] Shell wires POI pill + viewport refetch → MapView `pois`  
- [x] Focused-place footprint overlay when GeoJSON match exists  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

### W7.1 checklist (Catalog ↔ OSM)

- [x] Locks: dual-source + `maps-pois` in-gate (not “optional later”)  
- [x] Tab label uses `trip.tabs.plan`  
- [x] `listOsmPoisInBbox` Edge adapter → `Poi` DTO  
- [x] `useWorkspacePois` default OSM; sticky Catalog toggle clears + refetches  
- [x] Catalog ↔ OSM while a category is active: `fetchCat` owns per-key `AbortController` identity (do **not** assign `abortRef = {}` unless `loadingKeys` is also cleared); Catalog bbox queries take `AbortSignal`; OSM tiles race `OSM_TILE_TIMEOUT_MS` so a hung `maps-pois` invoke cannot pin the pill spinner  
- [x] `WorkspaceMapActionDial` + Catalog status capsule  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

### 15.1 W7.2 — Explore spatial scope

| Plan state | Pin coverage |
|------------|--------------|
| No place selected | Visible Plan / country framing viewport (OSM **client-tiled** when span > 0.5°; Catalog one bbox) |
| Place + bundled boundary | Pins **inside** place polygon (fetch `viewport ∩ placeBBox` + PIP clip) |
| Place + **Nearby** on | Viewport fetch, no polygon clip; Nearby sets `moved` → **Search this area** refetches |
| Place, **no** boundary | Explore **disabled** (clear category; pill non-interactive) |

**Nearby ≠ Search this area.** Nearby widens when a place is focused; Search this area refetches after pan/source change.

**Anti-pattern:** Treating Edge’s single center 0.5° clamp as “country coverage.” Do not raise Edge `MAX_BBOX` in this slice — tile on the client instead. No Atlas country GeoJSON in workspace.

#### W7.2 checklist

- [x] Place footprint bbox + point-in-polygon helpers  
- [x] `useWorkspacePois` place focus / clip / Nearby / explore enabled  
- [x] OSM client tiling (trip-place biased, ≤12 tiles)  
- [x] `PoiCategoryPill` Nearby + disabled / coming-soon  
- [x] Shell focus wiring; MapViewGL fitBounds + non-interactive footprint  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

---

## 16. W8 — Explore ladder

**Status:** Intent locked; **W8.1–W8.7** implemented.  
**iOS SoR:** FamilyTravelApp `docs/workspace-explore-locks.md` (P1–P7).  
**Scope:** Second pin family (Explore POIs) with callout → partial → Explore tab → detail → add/saves. Trip Places stay PlaceInspector / Places sidebar only.

### Two pin families (never merge)

| Family | Source | Interaction |
|--------|--------|-------------|
| Trip Places | `trip_places` | PlaceInspector / Places rail |
| Explore POIs | OSM (`maps-pois`) or Catalog (pill + dial) | Callout / partial / Explore tab |

### Web gesture SoR (W8.1)

- Desktop **hover** on Explore POI = same cursor-following tooltip as trip places (no Mapbox tip, no iOS peek)
- Primary click / tap Explore POI → **callout**; hover must be dismissed first
- Callout tail is one flush triangle (no sibling gap)
- Empty map click / Escape → dismiss callout
- Trip Place pin → PlaceInspector path only (never Explore callout)
- Do **not** use Nest `openAddPlaceFromPoi` on the Family shell
- Long-press → callout is a later enhancement

### Ladder

| Sub | Scope | Status |
|-----|--------|--------|
| W8.1 | Map Explore POI callout (peek) | **Implemented** |
| W8.2 | One floating partial media card | **Implemented** |
| W8.3 | Workspace Explore tab shell | **Implemented** |
| W8.4 | Catalog entity detail | **Implemented** |
| W8.5 | Add to trip + purview | **Implemented** |
| W8.6 | `person_catalog_saves` + Saved filter | **Implemented** |
| W8.7 | Proposal hints (P7 on web Propose + vote) | **Implemented** |

### W8.3 intent

- SlidingTabs order: **Plan → Explore → Transport → Bookings → Costs** (do not invent parallel workspace nav)
- Kind segments: Places / Experiences / Foods / Hotels
- Country-scoped Catalog lists (reuse `listTripCountryIds`; not bbox POI queries)
- Catalog partial CTA → `activeTab=explore` + pending deep-link stash (kind + id); OSM CTA stays toast
- No hearts (W8.6 adds Saved), no add-to-trip on the list (W8.5 is detail-only)

### W8.4 intent

- Module-local list ↔ detail inside Explore panel (`presentedEntity`; no nested route / PlaceInspector)
- `fetchExploreCatalogDetail` by id (opens even outside country-scoped list)
- Hero (Places: `cover_media_id` when present, else glyph; media slideshow for place/experience/food/hotel) + meta (name, type, address, phone, link, notes)
- Row tap + Catalog deep-link open detail; OSM stays toast
- No hearts / add-to-trip / purview chrome on detail (W8.5 adds Add + purview; W8.6 adds the header heart)

### W8.5 intent

Promote a **catalog** entity from Explore **detail** into this trip’s itinerary. Stay on Explore after write. Map partial has **no** Add button.

| Kind | Write | After |
|------|--------|--------|
| Place | `upsertTripPlace` | Map pin appears |
| Experience / food | `schedule_items` on a chosen Plan day (`experience_id` / `food_id`) | Plan rail gains the row |
| Hotel | Thin check-in/out dialog → `trip_reservations` + `hotel_id` | Stay on Explore. W6.2 Bookings lists/edits the row |

**Capability:** Published writes stay HOF `can_mutate_trip`. Non-HOF and HOF-on-My-Draft stage via §29 / W8.5.1.

- **HOF + Published:** in-purview = direct write; out-of-purview = banner + **confirm** → then write (places upsert, then plan/stay). No mandatory change request.
- **My Draft** (`can_draft_trip_changes`): stage ops; out-of-purview still shows the banner and stages `trip_place` **before** plan/reservation. Published rows stay unchanged until HOF apply.
- **Published + non-HOF:** nudge to switch to My Draft. Do not toast as if Propose chrome is missing.

**Purview** (same as iOS): place in purview iff `id ∈ trip_places`; exp/food/hotel in purview iff parent `place_id ∈ trip_places` **or** `place_id` is null (enrichment, no destination expansion). Never silent `trip_places` growth when adding exp/food/hotel out of purview — HOF must confirm first.

**Adapters:** Family plane only. Extend `schedule_items` insert/select with `experience_id` / `food_id`. Small `tripReservations.ts` insert stay. Do **not** mount Nest `ReservationModal` / numeric trip ids. Skip insert if that catalog experience/food already exists on the trip (partial uniques from iOS P5). No new migration unless insert hits a missing column.

**UI:** TREK capsule **Add to trip** under meta on detail; busy state; kind-specific `aria-label`. Out-of-purview banner above CTA (HOF expand-destinations copy vs non-HOF requires-approval copy). Places: one tap (or confirm) → upsert; “Already on this trip” info toast. Exp/food: 0 scheduled days → toast to set dates in Plan; 1 day → add there; many → `FamilyDayPicker`. Hotel: check-in/out required, then insert. OSM still cannot add (toast). Trip Place pin still never uses Explore CTA.

### W8.6 intent

Person-scoped Family Catalog hearts (`person_catalog_saves`). Independent of Add-to-trip / purview / `can_mutate_trip`. Saving **never** expands `trip_places`.

| Surface | Heart |
|---------|--------|
| Explore detail header | Yes |
| Map catalog partial | Yes (left of dismiss) |
| Map callout | No |
| OSM partial | No |
| Trip Place pin | No |

- Toggle via existing RPC `toggle_person_catalog_save` (do not raw-insert). Table + RLS already shipped (iOS P6) — **no new migration**.
- Explore **Saved** chip below kind tabs (not a 5th kind). Own saves only, hydrated by saved id **and** trip `country_id` (do not intersect with the name-ordered browse page of 200 — that drops in-country saves).
- Non-HOF can heart. Missing `personId` / `familyId` → disable + toast.
- Not Atlas `user_place_marks`; not Collections / `lists`; no dual-write.
- Explore detail **and catalog map partial** Bookmark = named lists (`lists` / `list_items`), independent of Saved hearts. Callout / OSM / PlaceInspector stay off.

### W8.7 intent

**P7 on the website.** Same “you saved these in these countries” capsules as iOS Propose / proposal detail. Not the map. Not Explore Saved.

| Decision | Lock |
|----------|------|
| Whose saves | Current person only (`resolve_my_person_id`). No family lobbying. |
| Geography | Selected / `trip_countries` ids via RPC `list_my_catalog_saves_in_countries`. |
| Surfaces | `FamilyProposeTripModal` (countries / notes / review) and `FamilyProposalVoteModal` after countries. |
| Empty | Hide the section. Never block Propose / vote. |
| Cap | 8 chips + “and N more”. |
| Writes | Vote: none. Propose: **place** chips may toggle `selectedPlaceIds` and retain the name. Exp/food/hotel display-only. |
| OSM / Atlas | Never. |

- Adapter throws on `{ error }`; UI catches → empty chips.
- TREK `chipCls` language (slate selected fill), not map glass tags.

### Anti-patterns (do not)

- One card system for Trip Places + Explore
- PlaceInspector on Explore pins (or Explore callout on `trip_places`)
- Save / propose by `osm_id`; hearts → Atlas / Collections
- Add-to-trip on W8.1 callout / W8.2 partial
- Heart on W8.1 callout, OSM pins, or trip Place pins
- Fake Unsplash on OSM; Nest Overpass as Family SoR  
- Sticky multi-card Explore feed or PlaceInspector-style dim over the map  

### W8.1 checklist

- [x] §16 intent locked in this document  
- [x] `ExplorePoiCallout` DOM overlay (title, location, type, category badge, tail)  
- [x] Shell `selectedExplorePoi` + `onPoiClick`; dismiss on map click / Escape  
- [x] Callout reprojects with pan/zoom  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

### W8.2 checklist

- [x] Partial UI (hero / tags / meta / dismiss / Open in Explore)  
- [x] `parseCatalogPoiRef` + `catalog_media_urls` adapter + Image Transform URLs  
- [x] Hero slideshow warms current + next two Image Transform URLs into the HTTP cache (iOS `openPrefetchCount` parity; wrap for looping Next). No Dexie / SW byte store.  
- [x] Shell callout → partial; OSM glyph-only; CTA toast until W8.3  
- [x] No hearts / add-to-trip on map partial (W8.6 adds catalog heart; still no Add)  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

### W8.3 checklist

- [x] Tab Plan → Explore → Transport → Bookings → Costs on Family shell SlidingTabs  
- [x] Kind segments Places / Experiences / Foods / Hotels  
- [x] Country-scoped list adapter + rows (cover optional)  
- [x] Catalog partial CTA → tab switch + pending deep-link stash  
- [x] OSM → Explore stays toast (cannot deep-link)  
- [x] No entity detail / hearts / add-to-trip  
- [x] Empty / no-countries / loading / error chrome  
- [x] `tsc --noEmit` clean; Nest plane unchanged  

### W8.4 checklist

- [x] Detail open from list row + Catalog deep-link (by id)  
- [x] Hero + meta read-only UI; Places glyph-first  
- [x] Detail slideshow uses the same HTTP-cache hero prefetch as the map partial  
- [x] Loading / not-found / error + retry; Back + Escape → list  
- [x] No hearts / add-to-trip / purview on detail  
- [x] OSM → Explore stays toast  
- [x] `tsc --noEmit` clean; Nest plane unchanged; shared i18n rebuilt  

### W8.5 checklist

- [x] §16 W8.5 intent locked (HOF confirm vs My Draft staging in §29; hotel thin dialog not W6.2)  
- [x] `schedule_items` `experience_id` / `food_id` insert + idempotency; Family `trip_reservations` stay insert  
- [x] Purview helpers; never `ensure` parent place unless HOF confirmed out-of-purview  
- [x] Detail Add to trip + banner/confirm + day chooser + hotel dates; no Add on W8.2 partial  
- [x] Shell `canMutateTrip` + reload places/schedule after add; toasts  
- [x] OSM still cannot add; trip Place pin never uses Explore CTA  
- [x] `tsc --noEmit` clean; Nest plane unchanged; shared i18n rebuilt  

### W8.6 checklist

- [x] §16 W8.6 intent locked (heart on catalog partial + detail; no heart on callout/OSM; Saved filter; anti-pattern re-home)  
- [x] `catalogSaves.ts` isSaved / toggle RPC / list ids; `listExploreCatalogByIds` country-scoped hydration  
- [x] `CatalogSaveHeartButton` on detail header + catalog map partial; OSM/callout unchanged  
- [x] Explore Saved chip below kind tabs; empty copy; shell `familyId` / `personId`  
- [x] Saving never expands `trip_places`; non-HOF can heart  
- [x] `tsc --noEmit` clean; Nest plane unchanged; shared i18n rebuilt  

### W8.7 checklist

- [x] §16 W8.7 intent locked (P7 pixels on web Propose + vote; RPC; hide empty)  
- [x] `list_my_catalog_saves_in_countries` + iOS `fetchSavedHints` uses RPC  
- [x] `FamilyProposalHintChips` on Propose (countries/notes/review) and vote  
- [x] Place chip retains city name; exp/food/hotel display-only  
- [x] `tsc --noEmit`; targeted Vitest; shared i18n rebuilt; Nest unchanged  

---

## 17. W9 — Cut Nest default + harden

**Status:** **W9.0 / W9.1 implemented.** W9.2 Realtime deferred.  
**iOS blast radius:** none. No migrations. Web-only.

### Locked intent

- Unset `VITE_DATA_PLANE` defaults to **`supabase`**. Nest is only active when `VITE_DATA_PLANE=nest`.
- Happy path: `npm run dev` (alias `dev:web`) = shared build + Vite only. `npm run dev:nest` = legacy Nest + Vite with the nest plane.
- Do **not** delete `server/`, `repo/*`, `api/client`, Vite `/api` proxy, Nest UI branches, or Nest MSW tests.
- Docker / Nest image client build pins `VITE_DATA_PLANE=nest`.
- Client Vitest setup pins `nest` so existing MSW Nest page tests keep working.
- Chrome rule: toast / banner / atlas zeros — not deleting TREK structure.
- Do not swallow adapter `{ error }` as empty success on hub/workspace critical paths.
- Dual-mode leftovers still reachable on supabase (Settings Nest `authApi`, Offline `tripsApi`) stay as pixels + toast. Hub/Plan calendar subscribe is **§20** (Family Edge Functions, not Nest `/api/feed/user`). Family ICS/PDF/password are §18. Share stays toast.
- W9.2 Realtime: selective Supabase Realtime **or** refresh until needed. Not this slice.

### Anti-patterns (do not)

- Delete Nest to “finish” W9
- Flip the default without pinning Docker + Vitest to nest
- Treat `can_mutate_trip` RPC failure as non-HOF with no toast
- Show an empty Plan spine or empty proposal shelf as success when the fetch failed
- Remove atlas flags when stats fail (keep zeros + toast)
- Claim Plan / Places / Explore are unimplemented (`toastLater` copy)

### W9.0 checklist

- [x] §17 intent locked in this document  
- [x] `getDataPlane()` defaults to `supabase`  
- [x] `dev` = Vite; `dev:web` alias; `dev:nest` explicit Nest; optional `build:web`  
- [x] Dockerfile client-builder `VITE_DATA_PLANE=nest`  
- [x] Vitest setup pins nest; unit test covers unset → supabase  
- [x] `.env.example`, README, wiki Family callout  

### W9.1 checklist

- [x] Workspace partial load: toast + retryable banner; trip + places still required  
- [x] `canMutateTrip` throws on RPC error; shell fail-closed + toast (stay on trip)  
- [x] Hub stats/proposals: toast; atlas zeros kept; trips still listed  
- [x] ICS / Settings / Account / Integrations / Passkeys / Offline skip Nest `/api` on supabase  
- [x] `toastLater` retargeted (Share / PDF·ICS / import / edit)  
- [x] `resolve_my_person_id` errors throw  
- [x] AGPL / host notes in §7 + README pointer  
- [x] `tsc --noEmit`; targeted Vitest; shared i18n rebuilt  

---

## 18. Family Plan PDF / ICS + account password

**Status:** Implemented.  
**iOS blast radius:** none. No migrations, Edge Functions, or Nest `/api`. Web-only.

### Locked intent

- **PDF** and **Download ICS** on the Family Plan toolbar (`FamilyDayPlanSidebar`) generate in the browser from already-loaded `trip_days`, `schedule_items`, `day_notes`, and trip-place names. Readable by **all members** (not gated on `can_mutate_trip`). Content matches iOS `TripPlanExporters` (itinerary text), not Nest magazine `downloadTripPDF`.
- Overlay chrome matches TREK TripPDF (srcdoc iframe, Close, Save as PDF → `iframe.print()`). No jsPDF.
- ICS: `PRODID:-//FamilyTravelApp//Plan//EN`; one `VEVENT` per schedule row; `UID` = `{item.id}@familytravel`; UTC `DTSTART`/`DTEND` like iOS.
- **Subscribe to calendar** in this slice stayed toast (superseded by **§20**). Do **not** open Nest `IcsSubscribeModal` / `/api/trips/:id/feed` from the Family shell.
- Do **not** call Nest `downloadTripPDF` or `GET /api/trips/:id/export.ics` from the Family shell.
- **Account password** on supabase: re-auth with `signInWithPassword` then `auth.updateUser({ password })`. MFA and passkeys stay `settings.toast.nestOnly`. Display name, avatar, email, timezone, and accent are **§27**. Share toolbar stays toast.

### Anti-patterns (do not)

- Feed UUID Family trips into Nest `TripPDF` / numeric `export.ics`
- Pretend calendar subscribe works without a feed token + Edge Function
- Change password via `updateUser` without verifying the current password
- Swallow Auth `{ error }` as success
- Implement Share / Files / Journey in this slice

### Checklist

- [x] §18 intent locked in this document  
- [x] Family ICS + print-PDF builders; Plan toolbar wired; subscribe still toasts  
- [x] `changePassword` adapter + AccountTab password path  
- [x] `tsc --noEmit`; targeted Vitest; shared i18n rebuilt  

---

## 19. Trip recorded tracks (GPX / KML)

**Status:** Implemented.  
**iOS blast radius:** additive `trip_tracks` + `trip_track_waypoints` + RLS. iOS map draw is a follow-on; do not invent a second shape. No PostGIS, no Edge Function, no Nest `/api`.

### Locked intent

- Recorded hikes are **trip-owned lines**, not catalog cities. `places` / `trip_places` stay destinations. Do **not** copy TREK `route_geometry` onto Family `places`.
- **Import file** (HOF / `can_mutate_trip`): parse GPX / KML / KMZ **in the browser** (existing `jszip` for KMZ). Insert `trip_tracks` + named `<wpt>` / KML Point rows. Members may **read** tracks on the map and in the Places Tracks list.
- Vertices live in `trip_tracks.geometry` (RFC 7946 jsonb `LineString` / `MultiLineString`, `[lng,lat]` or `[lng,lat,ele]`). Cap **10 000 vertices** per line (simplify on ingest). `kind`: `track` (`<trk>`), `route` (`<rte>`), `waypoints` (file-level pins only; `geometry` null).
- **List Import** stays `trip.toast.importLater`. No Google/Naver scrape.
- Do **not** call Nest `placesApi.importGpx`. Do not mount numeric `FileImportModal` on UUID trips.
- Table name is **`trip_tracks`**, not `trip_routes` (Plan driving directions). Journey / Files / `source_media_id` are out.
- Map: additive `recordedTracks` GeoJSON source — do not fake `FamilyTripPlace.route_geometry`. Waypoint dots are not destination pins / PlaceInspector.
- PostGIS `geography(LineString)` is an additive follow-on when catalog points get PostGIS; jsonb is the SoR today.

### Anti-patterns (do not)

- Insert catalog `places` or `trip_places` from GPX (“Picnic table 3”)
- Hang polylines on `places.route_geometry`
- Pretend List Import works
- Enable PostGIS in this slice
- One row per track vertex
- Feed UUID trips into Nest import `/api`

### Checklist

- [x] §19 intent locked in this document  
- [x] FamilyTravelApp migration + DBML + schema-design  
- [x] In-browser parser + adapter; Places Import file + Tracks chip; map layer  
- [x] List Import still toasts  
- [x] `tsc --noEmit`; targeted Vitest; shared i18n rebuilt  

---

## 20. Calendar subscribe (all-trips feed)

**Status:** Implemented.  
**iOS blast radius:** none. No new migrations or Edge Functions. Web consumes existing `people.calendar_feed_token`, JWT `manage-calendar-feed`, and public `calendar-feed` (`verify_jwt = false`). User may only manage their own person (Edge 403).

### Locked intent

- **One person-level ICS feed for all active trips**, same as iOS `CalendarSubscribeSheet`. Trips where the signed-in person is a traveler, same family, not archived, status not `planning`/`cancelled`, `end_at` null or ≥ today−90 days. `PRODID:-//FamilyTravelApp//CalendarFeed//EN`.
- Hub “Subscribe to all trips” and Plan ICS “Subscribe to calendar” open the **same** Family modal. Do **not** invent a per-trip Edge feed. Copy stays the all-trips sentence (excludes archived / ended >90 days).
- Do **not** mount Nest `IcsSubscribeModal` (`/api/feed/user` or `/api/trips/:id/feed`) on the supabase plane. Nest plane stays as-is.
- **GET never mints.** Enable is explicit POST; PUT regenerate; DELETE disable. Not gated on `can_mutate_trip`.
- **Download ICS** remains the in-browser trip file from §18. Subscribe is a live feed; they are not the same export.
- JS `functions.invoke` has no query option: GET uses session-authenticated `fetch` with `family_id` / `person_id` query params. Mutations use `functions.invoke` with body `{ family_id, person_id }`. Throw on `{ error }` / HTTP failure; do not swallow as empty success.
- Do not call public `calendar-feed` from the SPA. Calendar clients poll the `feed_url` (token + anon `apikey` query). Share / List Import / W9.2 stay out. Duplicate is **§21**.

### Anti-patterns (do not)

- Open Nest `IcsSubscribeModal` on UUID family trips
- Pretend Plan Subscribe is a per-trip feed
- Mint a token on modal open (GET must be read-only)
- Gate subscribe on `can_mutate_trip`
- Call Nest `/api/feed` or `/api/trips/:id/feed` from the Family shell

### Checklist

- [x] §20 intent locked in this document  
- [x] `calendarFeed` adapter + Family subscribe modal  
- [x] Hub + Plan ICS Subscribe wired; Nest modal unchanged  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 21. Hub Duplicate (proposal copy)

**Status:** Implemented.  
**iOS blast radius:** additive `duplicate_trip(uuid)` RPC only. iOS `TripsService.duplicateTrip` stays reviewer-gated client insert this slice. Do not change Swift.

### Locked intent

- Hub Duplicate is **any active member** of the source family (`is_active_member_of`), same bar as Propose. Not `can_mutate_trip`. Not reviewers-only (iOS hub UI still gates Duplicate to reviewers). Missing `familyId`/`personId` → `dashboard.propose.missingPerson`.
- RPC `duplicate_trip(p_source_trip_id)` is security definer. It verifies membership (definer bypasses RLS), copies the hub envelope, then calls `create_trip_proposal` so the copy is a **submitted** proposal. Title `{name} (copy)`. Duplicator is `proposed_by`.
- Copy: dates, cover_url, notes, occasion, reminder_days, countries, places (restore `is_primary` from source), travelers (Propose always includes the duplicator).
- Do **not** clone Plan days/schedule, bookings, costs, notes, tracks, or files. TREK CopyTripDialog will-copy (budget, packing, TODOs, day notes) is Nest-only — Family dialog uses honest lists.
- Nest plane: unchanged `CopyTripDialog` + `tripsApi.copy`. Do not call Nest `/api` copy on UUID trips. Do not browser-`INSERT` `trips`.

### Anti-patterns (do not)

- Nest `tripsApi.copy` / `copyTripById` on Family UUID trips
- iOS client insert loop in the browser
- Claim the copy includes Plan, bookings, costs, or files
- Skip `create_trip_proposal` (that would let members insert trips without a vote)
- Gate web Duplicate on `can_mutate_trip` or reviewers-only

### Checklist

- [x] §21 intent locked in this document  
- [x] FamilyTravelApp `duplicate_trip` + schema-design / DBML  
- [x] Web adapter + CopyTripDialog Family lists + hub wiring  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 22. Hub boarding-pass stats

**Status:** Implemented.  
**iOS blast radius:** none. No migrations. No Swift. Web matches iOS `TripsHubModel` enrichment (batched `trip_travelers` + `trip_places`).

### Locked intent

- After listing family trips, one batched `trip_travelers` query and one batched `trip_places` query (`.in('trip_id')`). Attach honest `place_count`, `traveler_count`, `day_count`. Spotlight boarding pass gets a Family `HeroBundle` (avatars + up to 3 place chips) from that batch — no second round-trip, no Nest `tripsApi.bundle` on UUID trips.
- **Traveler embed is `people(display_name,color)`**, matching iOS `fetchTripTravelers`. Do **not** select `people.avatar_url` (column does not exist; a 400 zeros the hub).
- **Traveler count is total `trip_travelers`**, matching iOS `trip.travelers.count`. Do **not** reuse Nest `shared_count + 1`.
- **Day count:** inclusive civil days from start/end; **0** when dates are missing (not the proposal helper’s fallback of 7).
- Cover is already `cover_url`. Enrichment is **best-effort per query** like iOS (`try?`): travelers failing must not discard places, and vice versa. Keep the trip list; do not blank the hub.
- **Hub photos:** existing `people_avatar_refs` + short-lived Storage signed URLs on `hub_members.avatarUrl` (family bucket; member RLS). Signing is itself best-effort. Missing media → initials (`people.color` or TREK `buddyColor`).
- Empty Family party: 0 travelers, no fake owner chip (Nest-only fallback). Place chips use catalog name + `places.cover_media_id` when present, else glyph (`PlaceAvatar`). Do not fetch Google/OSM photos. Cover embed is **§24**.
- Nest travelStats / upcoming stay skipped. Nest plane boarding pass stays `tripsApi.bundle`.
- TREK chrome stays on the spotlight (Buddies label, destination **count**, place chips). Do not switch to iOS “HOUSEHOLD” / “SOLO TRIP” / place-name cell copy.

### Anti-patterns (do not)

- Nest `/api/trips/:id/bundle` on Family UUID trips
- N+1 queries per hub card
- Lie with `shared_count + 1` as Family traveler total
- `people.avatar_url` embed (not a `people` column)
- One `Promise.all` that zeros places when travelers fail (or the reverse)
- New SQL views / RPCs for counts (`people_avatar_refs` already exists)
- Google/OSM/Nest photo scrape on hub chips (catalog cover is **§24**)

### Checklist

- [x] §22 intent locked in this document  
- [x] Multi-id travelers/places adapters + `listFamilyTrips` enrich  
- [x] Boarding pass + trip cards; archive keeps counts  
- [x] Traveler embed matches iOS (`display_name,color`); independent try?; `people_avatar_refs` signed URLs  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 23. Family Vacay on TREK chrome

**Status:** Implemented. **QC Stage A** (year clamp / paint truth), **QC Stage B** (null `people.color` iOS palette fallback; Public holidays copy), and **QC Stage C** (calendar RLS + PERSONS overlay) implemented.  
**iOS blast radius:** `family_calendar_entries` / `family_pto_years` SELECT is no longer family-wide. Child/guest iOS Vacay becomes a personal calendar. HOF iOS still sees everyone (RLS allows all entries) until overlay chrome. Legend roster = self ∪ person ids in fetched entries. No iOS PTO/settings or overlay PERSONS UI this slice.

### Locked intent

- Keep TREK Vacay pixels on `/vacay` (year grid, 12 month cards, sidebar, settings, 28px cells). Family plane reads/writes existing calendar tables plus additive settings, family-wide days, and PTO years. Nest `/addons/vacay/*` stays unchanged (`dev:nest`).
- **Family-plane chrome:** Vacay is a first-class tab next to **My Trips** in `trek-nav-pill` (desktop) and `BottomNav` (mobile). Stub that tab locally on the supabase plane. Do **not** load Nest `/api/addons` to show it, and do **not** hide Vacay because the Nest addon catalog is empty.
- **Click language:** TREK click-to-toggle. Paint bar on Family plane: **Away | School | Family day | Inspect**. Inspect opens a day sheet (travelers, proposed vs approved, conflicts, per-person Away/School). Do not replace the year grid with the iOS month-swipe, and do not make every cell click open the sheet.
- **Skip TREK fusion / dissolve on Family roster.** Nest `/addons/vacay` invite + dissolve stay Nest-only. Family `people` already *is* the plan — **+** does not insert `people` or fuse plans. Family-plane UserPlus: **Add Individual User** (HOF / household owner·admin / login parent) or **Request access** (child/guest). Incoming calendar-access decide uses the TREK invite-portal layout with new copy. Empty overlay = personal calendar (`{ you }`), not an invite CTA.
- **No new `calendar_entry_kind` enum values** (would break iOS Codable). Family-wide closures live in `family_blocked_dates`, not on entries.
- **Do not put settings on `families`** (reviewer-locked / super-admin update). New 1-row-per-family `family_calendar_settings`.
- **PTO is optional Family data for web TREK stats**, not a new Vacay product. Used is not stored: `count(*)` of `family_calendar_entries` where `kind = 'away'` for that year. School break and `family_blocked_dates` do not deduct.
- **Trip overlay:** approved = existing 5px blue dot; proposed (`submitted` / `in_review`) = additive amber dot. Keep the 28px TREK cell.
- **Public holidays:** fetch [Nager](https://date.nager.at) from the browser. Nest is only a CORS proxy today; no secret. If CORS fails in prod, add a JWT Edge Function with no secrets — do not revive Nest.
- **W9.2 Realtime deferred** — reload after writes; no WebSocket on the Family plane.
- Missing `familyId` / `personId` → existing `dashboard.propose.missingPerson` toast. Writes throw on `{ error }`; toast; do not swallow as empty success. Trip-overlay enrichment failure does not blank the page.
- Widen hub-only Vacay ids (`VacayUser.id`, `VacayEntry.user_id`, `VacayStat.user_id`, `selectedUserId`, holiday calendar ids) to `string | number`. Nest stays numeric.

**QC Stage A (correctness):**

- Year header is always in `resolveVisibleYears`. Empty `visible_years` falls back to **civil current year**, not the year being loaded. After add/delete/load, clamp `selectedYear` (prefer current year if present, else max). Chevrons use adjacent years in that sorted list; both disabled when the header year is not in the list (`indexOf === -1` must not jump to `years[0]`). Serialize Family-plane year writes via a mutex + `yearsRef` so a stale closure cannot persist `visible_years = []`.
- Year add/delete/switch does **not** unmount the 12-month grid (full-page spinner is boot / Nest `loading` only).
- Away vs School is visually distinct at 28px (school = diagonal stripe). Grid click does not silently insert the other kind (toast; Inspect still sets both). Away+School: click toggles the active brush only.
- Carry-over keeps `nextYearCarry`; it is not on the year/paint critical path (`Promise.all`, fire-and-forget). No PTO RPC this slice.

**QC Stage B (fidelity):**

- Null / blank `people.color` uses the same display fallback as iOS `AppColors.personPalette` by roster index (`people.display_name` order). Do **not** seed `people.color`. A swatch pick still persists. Not chrome `people.accent_hex`.
- Public holidays stay a separate Globe control from Family Days. Family chrome: Public holidays above Family Days. Enabling Public holidays with an empty calendar list opens the add-calendar empty state — do not auto-insert a US (or any) `family_holiday_calendars` row.

**QC Stage C (RBAC + overlay):**

- Postgres is the source of truth. `can_view_person_calendar` / `can_paint_person_calendar` replace family-wide entry RLS. Grants (`person_calendar_access`, status `approved`) are **SELECT only** — they never grant paint.
- Household **owner/admin** (admin = spouse) and login **parent** who share that household may view and paint that household. Child/guest default = self; they may request read access to a person or traveler-preset branch.
- Web overlay default `{ you }`. PERSONS lists you + `is_traveler_preset` toggles (not paint targets) + added individuals. Paint target is a person row. Persist on `person_vacay_overlay_people` / `person_vacay_overlay_branches` (viewer-owned), not `family_calendar_settings`.
- HOF / super admin may read everyone via RLS; the web grid still filters to the overlay set (personal view is cheap). Trip dots follow overlaid travelers.

### Schema (FamilyTravelApp, additive)

1. `family_calendar_settings` — PK `family_id` → `families`. RLS: select `is_active_member_of`; write `can_review_access` (same bar as `family_holiday_calendars`).
2. `family_blocked_dates` — unique `(family_id, entry_date)`. RLS: select members; write any active member (TREK “anyone on the plan can paint company days”).
3. `family_pto_years` — unique `(person_id, year)`. RLS: select `can_view_person_calendar(person_id)`; insert/update own `people.user_id = auth.uid()` or `can_review_access` (kids / no login: reviewers only).
4. `person_vacay_overlay_people` / `person_vacay_overlay_branches` — viewer-owned overlay (default empty = self).
5. `person_calendar_access` — pending/approved/denied/revoked grants; writes via RPCs only.

Carry-over: when `carry_over_enabled` and year Y+1 exists in `visible_years`, set that year’s `carried_over = max(0, entitled + prev carry − used)`. Disabling carry-over zeros `carried_over`. Empty `visible_years` → show current year (client).

Existing: `family_calendar_entries` (`away` | `school_break`) — **SELECT** `can_view_person_calendar(person_id)`; **write** `can_paint_person_calendar(person_id)`. `family_holiday_calendars`, `people.color`. Holiday calendars and `family_blocked_dates` stay family-scoped (shared closures).

### Anti-patterns (do not)

- Nest `/addons/vacay/*` on the UUID/family plane
- Hiding Vacay from `trek-nav-pill` / BottomNav because Nest addons are empty
- TREK fusion / invite / dissolve on Family roster (Family **+** is overlay or request, not fusion)
- New `calendar_entry_kind` values
- Settings columns on `families`
- Swallow adapter `{ error }` as empty success
- iOS Vacay PTO/settings UI this slice
- iOS overlay PERSONS chrome this slice
- Client-only hiding of calendars while RLS still returns every family row
- List Import / Share; W9.2 Realtime

### Checklist

- [x] §23 intent locked in this document  
- [x] Additive migrations + schema-design / DBML PTO reopen  
- [x] `client/src/data/supabase/vacay.ts` + `vacayModel`; Nager client fetch  
- [x] `useVacay` supabase path; paint bar; dots; hide fusion; PTO; settings; day sheet  
- [x] Family-plane Vacay tab in Navbar + BottomNav (stub; not Nest addons)  
- [x] `tsc --noEmit`; targeted Vitest; Nest Vacay tests unchanged  
- [x] **QC Stage A:** year clamp + mutex; boot vs refresh loading; Away/School stripe + blocked-other-kind; carry-over off path  
- [x] **QC Stage B:** iOS `personPalette` display fallback; Public holidays above Family Days + empty add-calendar state  
- [x] **QC Stage C:** `can_view` / `can_paint` RLS; overlay junctions; calendar-access RPCs; web PERSONS overlay; iOS legend = self ∪ entry person ids  

---

## 24. Places cover_media_id

**Status:** Implemented.  
**iOS blast radius:** additive `places.cover_media_id` + `catalog_media_urls('place')` + Explore place cover embed. Existing selects that omit the embed keep working. No DROP/RENAME. iOS My Trips boarding pass and PlaceInspector stay unchanged this slice.

### Locked intent

- Catalog places use the same cover pattern as hotels/foods/experiences: trigger-maintained `places.cover_media_id` (lowest-position public_catalog **image** on `place_media`) and `catalog_media_urls` kind `'place'`. Canonical URL stays `media_assets.public_url`. Do **not** add `places.hero_public_url` or a `places_avatar_refs` view.
- Hub place chips and Explore place thumbs embed `cover_media:media_assets!cover_media_id(public_url)` on the **same** `places(...)` select as name/coords. Still one batched `trip_places` query. If the cover embed 400s, retry name/coords only — never zero `place_count`.
- Missing cover → glyph (`PlaceAvatar` / Explore glyph). No Google/OSM/Nest `photoService`. TREK chrome unchanged (Buddies, destination **count**, place chips).
- Hub chips use Image Transform **thumb** (~96). Explore list/detail use existing hero transform (1200).
- Web Places rail / inspector may pass the same `imageUrl`. iOS PlaceInspector + trip-pin `place_media` stay deferred.
- Map `catalog:place:` osm_id encoding stays out. `CatalogPoiKind` / `WorkspaceCatalogPoiRef.parse` remain food/hotel/experience. Explore-tab media identity may use `'place'` for the RPC only.

### Anti-patterns (do not)

- Hub-only `place_media` join that reimplements cover selection in the client
- Signed URLs for public catalog place covers
- Google/OSM/Nest photo scrape
- Zeroing hub `place_count` when the cover embed fails
- `places.hero_public_url` text copy
- iOS My Trips boarding-pass redesign this slice

### Checklist

- [x] §24 intent locked in this document  
- [x] FamilyTravelApp migration + live apply  
- [x] Web hub / Explore / Places-rail embeds  
- [x] iOS Explore place list/detail + `WorkspaceCatalogPoiRef.place`  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 25. Workspace Lists and Files (TREK → Family Supabase)

**Status:** Implemented (L0 schema + L1 Lists core + L2 bags/templates/share + L3 Files upload + L4 links/trash). **Web Files chrome:** Family workspace mounts TREK `FileManager` pixels + `tripFiles.ts` (not a cloned panel; not Nest `filesApi`). **Web Lists chrome:** Family workspace mounts TREK `ListsContainer` + `PackingListPanel` + `TodoListPanel` pixels + `packing.ts` / `todos.ts` (not cloned packing/todo panels; not Nest `packingApi` / `todoApi`).  
**iOS blast radius:** additive tables (`packing_*`, `todo_*`, `trip_files`, `trip_file_links`), indexes, RLS, Storage policy tighten on `trip-files`, RPCs `ensure_packing_defaults` / `apply_packing_template` / `save_packing_template_from_trip`. No DROP/RENAME.

### Locked intent

- Two workspace tabs, TREK-shaped: **Lists** (Packing | Todo subtabs) and **Files**. Always-on (no AddonManager). IDs are `people.id` / `trips.id` UUID. Do not hash UUIDs to numbers.
- Writes = `can_mutate_trip` (HOF 2A). Members **read**. Non-HOF mutates **toast**. Not W8.5.1 drafts. Reload after write; no W9.2 Realtime.
- Do **not** conflate: Airtable `lists` / `list_items` ≠ packing. Product-plan `checklists` / `checklist_items` (eSIM prep) stay unmigrated.
- Do **not** dual-write `media_assets` (global `content_hash` UNIQUE). Metadata is `trip_files`; bytes in existing private bucket `trip-files` at `{family_id}/{trip_id}/{uuid}_{safe_name}`.
- Templates are **family-scoped** (`packing_templates.family_id`). HOF/reviewer CRUD; apply on a trip if HOF. Not TREK instance-admin templates.
- Storage: SELECT member (path family_id); INSERT/UPDATE/DELETE `can_mutate_trip` on trip_id segment. Doc cap **50 MB**; bucket stays 100 MiB. TREK 500 MB video = later limit bump.
- `trip_file_links` exactly one of `place_id` (catalog `places.id` on `trip_places`) | `reservation_id` | `trip_day_id`. No `note_id` until Collab. Soft-delete via `trip_files.deleted_at`.
- Web tabs in `FamilyTripWorkspaceShell`: after Bookings → **Lists** → Costs → **Files**. iOS module `.packing` is the Lists tab (Packing | Todo); `.files` is Files.
- **Files chrome vs backend (do not conflate):** `FileManager.tsx` is TREK **frontend**. Nest is the old **backend** (`filesApi` on `npm run dev:nest` / TripPlannerPage `dateien`). Production Family Files uses the **same** FileManager toolbar / filters / rows / dropzone / assign / trash / previews, with an injected ops port over `client/src/data/supabase/tripFiles.ts`. Nest `filesApi` is not called on the supabase plane.
- **Lists chrome vs backend (do not conflate):** `ListsContainer` / `PackingListPanel` / `TodoListPanel` are TREK **frontend**. Nest is the old **backend** (`packingApi` / `todoApi` / tripStore on `npm run dev:nest`). Production Family Lists uses the **same** header (title, Packing/Todo counts, clear / template / import / add todo), packing rows/bags/share, and todo sidebar/detail, with injected ops ports over `client/src/data/supabase/packing.ts` and `todos.ts`. Templates stay **family-scoped**. Bags/weight are always on (no AddonManager). Nest packing/todo APIs are not called on the supabase plane.
- Out: Nest dual-write, MCP packing tools, plugins, public share, collab attachments, cloning lists/files in `duplicate_trip`, booking-import auto-attach.

### Anti-patterns (do not)

- Nest `filesApi` from Family workspace (or any supabase-plane Files UI)
- A second Files UI that clones toolbar/rows instead of mounting `FileManager`
- Nest `packingApi` / `todoApi` / tripStore packing-todo slices from Family workspace (or any supabase-plane Lists UI)
- A second Lists UI that clones the Packing/Todo pill header, packing rows, or todo sidebar instead of mounting `ListsContainer` + `PackingListPanel` + `TodoListPanel`
- `media_assets` for trip PDFs / packing photos
- Airtable `lists` or eSIM `checklists` as the packing/TODO SoR
- Instance-wide admin templates
- Member INSERT on `trip-files` Storage (too wide — tightened to HOF)
- Coercing family UUIDs to TREK numeric ids to reuse Nest APIs

### Checklist

- [x] §25 intent locked in this document  
- [x] FamilyTravelApp migration + schema-design/DBML + live apply  
- [x] Web Lists + Files adapters/panels; HOF 2A  
- [x] iOS Lists + Files replace FeaturePlaceholderView  
- [x] File links + trash + place/booking Files chrome  
- [x] Family Files mounts TREK `FileManager` + `tripFiles` ops (not a cloned panel)  
- [x] Family Lists mounts TREK `ListsContainer` + packing/todo ops (not cloned panels)  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 26. Family Collections (`lists` / `list_items`)

**Status:** Phases 0–5 implemented (Bookmark tab + covers + Explore Add to list + Copy to trip + iOS Library). Catalog **map-partial Bookmark** implemented (left of heart; same picker/RPCs as detail). iOS **More → Library** is named Collections on the same `lists` / `list_items` RPCs (SwiftUI native, not TREK). Heart stays `person_catalog_saves`. Workspace Lists tab stays packing/todos. **Not this slice:** PlaceInspector / OSM / callout / exp-food-hotel schedule copy / Content Library CMS / Nest dual-write / new migration / `copy_list_items_to_trip` RPC.  
**iOS blast radius:** Additive UI only. Existing SELECT + write RPCs + `can_mutate_trip` + `trip_places` upsert. No DROP/RENAME.

### Locked intent

- **SoR:** evolve live Airtable-port tables `lists` + `list_items`. Do **not** create `family_collections*`. Do **not** port Nest `/addons/collections` or SQLite. Do **not** put `list_id` on `person_catalog_saves`. Do **not** use packing/todos.
- **Splits:** Trip Places ≠ Explore ≠ hearts (`person_catalog_saves`) ≠ named lists (`lists`) ≠ Atlas `user_*_marks` ≠ workspace Lists tab (packing/todos). Heart never inserts `list_items`. List `status` never writes Atlas marks. Adding to a list never expands `trip_places`.
- **Visibility (skip TREK fusion):** `private` (owner `people.id`) vs `family` (active members). No `list_members`, no invite-outsiders, no branch-only share in v1.
- **Writes:** RPC-only (`create_family_list`, `update_family_list`, `archive_family_list` / `unarchive_family_list`, `add_list_item`, `remove_list_item`, `set_list_item_status`, `reorder_list_items`, `register_family_list_cover`). `private` create = any active member. `family` create and private→family = `can_review_access`. Item edits: owner of private; any active member on family-visible; not archived. Metadata/archive/cover: owner, or reviewer on family-visible.
- **Items:** catalog FKs only (`list_item_kind` + matching FK). Join catalog for name/coords/cover. No OSM / `google_place_id` copies. Status enum `idea` | `want` | `visited` (list-local).
- **Cover:** `lists.cover_media_id` → `media_assets` (`visibility = family`, bucket `family`, `public_url` null). Path `{family_id}/lists/{list_id}/{uuid}.ext`. Bytes via Storage; row + FK via `register_family_list_cover` (not PostgREST `media_assets` insert; not the public `catalog` bucket). Clear via `update_family_list(..., p_clear_cover)`. Hero: `color` plus signed URL (1h), or `public_url` if a catalog URL is already set. Do not call Nest Unsplash/cover APIs on the Family plane. Storage SELECT/INSERT/UPDATE/DELETE under `/lists/` follows `can_view_family_list` / `can_admin_family_list`. Other `family/` paths (Pics) stay member-wide.
- **Reads:** PostgREST SELECT under `can_view_family_list`. No list-read RPC. Archived: visible to owner (always) and reviewer (family-visible only); hidden from other members.
- **Copy-to-trip** is phase 4 / W8.5 (`can_mutate_trip` + purview). Do **not** add `copy_list_items_to_trip`. Do **not** write `list_items.source_trip_id` (trip→list provenance, unused). List editor is not a trip mutator except this explicit CTA. Copy never writes hearts or new `list_items`.

**Phase 2 chrome (implemented)**

- Bookmark tab in `FAMILY_PLANE_NAV_TABS` → `/collections`. Feed existing TREK `CollectionsPage` (rail, hero, Idea/Want/Visited, map). Do **not** clone a Family Collections UI. Do **not** put Family rows in `collectionStore`. Do **not** call `collectionsApi` / Nest `mapsApi.search` on supabase.
- **Ids stay UUID strings.** `canAddPlace` is a real list (`activeId` not `all` / null), not `typeof id === 'number'`.
- Skip `ProtectedRoute addonId` checks when `isSupabaseDataPlane()`. Keep `addonId="collections"` on `dev:nest`.
- **All saved** = union of visible `list_items`. **Not** `person_catalog_saves`.
- Hide on Family: Share/fusion, labels, move/duplicate-to-list. Copy-to-trip is Phase 4 (implemented). Add item = catalog kind picker (place / experience / food / hotel) → `add_list_item`. Delete list → `archive_family_list`.
- Missing `familyId` / `personId` → existing `dashboard.propose.missingPerson` toast.

**Phase 2.1 cover upload (implemented)**

- Family list editor file picker uploads to `family` Storage then `register_family_list_cover`. Create list first, then attach cover (same as Nest). Replace/clear best-effort `storage.remove` of the previous object.
- Cap 8 MiB; images only (HEIC → JPEG via existing `normalizeImageFile`). Unsplash stays Nest-only.

**Phase 3 Explore Add to list (implemented)**

- Explore **entity detail** and catalog **map partial** 36px Bookmark **left of** the heart opens TREK `SaveToCollectionModal`. Do **not** change `CatalogSaveHeartButton`. OSM / callout / PlaceInspector stay off. Heart never inserts `list_items`; add-to-list never writes hearts or `trip_places`.
- Mount `SaveToCollectionModal` on the Family plane. PlaceInspector / DayPlan / PlacesSidebar stay off (`addonStore.isEnabled('collections')` is false on supabase).
- Picker target: `{ name, catalog_kind, catalog_entity_id }` only (place / experience / food / hotel + UUID). Family branch: **no** `collectionsApi`; load + toggle via `familyLists.ts` (`listFamilyLists`, `listFamilyListMembership` SELECT, `add_list_item` status `idea`, `remove_list_item`). Nest google/OSM path unchanged.
- Filled bookmark when the entity is on **any** visible list (refresh after toggle / store `version`). Missing `familyId` / `personId` → disable + `dashboard.propose.missingPerson`. Independent of `canMutate` / purview / Add to trip.
- Duplicate → RPC `already on this list` / toast. Empty state still navigates to `/collections`.

**Phase 4 Copy to trip (implemented)**

- Unhide TREK `CopyToTripModal` on Family Collections (select-bar + place detail). Share / labels / move / duplicate-to-list stay hidden.
- Catalog **places** only → `canMutateTrip` + `listTripPlaces` + `addCatalogPlaceToTrip` (`confirmedOutOfPurview: true`; choosing a trip is the HOF confirm). Already on the trip → skipped. Experience / food / hotel → skipped (need a Plan day or hotel dates in Explore).
- Trip picker: `listFamilyTrips` (active). **No** Nest `tripsApi` / `collectionsApi.copyToTrip` on supabase. Ids stay UUID strings.
- Non-HOF → `trip.explore.add.hofOnly`. Missing `familyId` / `personId` → `dashboard.propose.missingPerson`.

**Phase 5 iOS library (implemented)**

- Replace More → Library `FeaturePlaceholderView` with a SwiftUI hub/detail (`fullScreenCover`). Keep the More label **Library**. Do **not** use the trip Workspace Lists tab (packing). Do **not** clone TREK `CollectionsPage`.
- Same RPCs as web. Explore entity-detail **and catalog map partial** Bookmark **left of** the heart; heart stays P6. OSM / callout stay heart-off / Bookmark-off.
- Copy listed **places** onto a trip via `can_mutate_trip` + `upsertTripPlace`. Choosing a trip is the HOF confirm. Non-HOF → hof-only (no W8.5.1 drafts). Experience / food / hotel skipped.

**Later phases (locked, not built here)**

| Phase | What |
|-------|------|
| — | Labels, share/`list_members`, Collections map, Content Library CMS. |

Out of v1: labels, `list_members`, branch-only share, Realtime (W9.2), packing as Collections, Nest dual-write.

### Schema (FamilyTravelApp, additive)

1. Enums `list_visibility` (`private` \| `family`), `list_item_status` (`idea` \| `want` \| `visited`).
2. `lists`: `description`, `color`, `cover_media_id`, `visibility` default `private`, `sort_order`, `updated_at`. Keep ETL owner columns; product RPCs set `owner_person_id` only.
3. `list_items`: `status` default `idea`, `sort_order`, `source_trip_id` (trip→list provenance; unused). CHECK kind matches FK. Partial uniques per target FK.
4. Helpers `can_view_family_list` / `can_edit_family_list_items` / `can_admin_family_list` (person lookup by `people.user_id = auth.uid()`, not `resolve_my_person_id` in RLS — that RPC can auto-link). Write RPCs may call `resolve_my_person_id`.
5. Cover: `register_family_list_cover` + Storage helpers `can_view_family_list_cover_object` / `can_admin_family_list_cover_object`. Family-bucket path `{family_id}/lists/{list_id}/…`.

### Anti-patterns (do not)

- New `family_collections*` tables or Nest `/addons/collections` dual-write
- `list_id` on `person_catalog_saves`
- Packing/todo as Collections SoR
- DROP/RENAME `lists` / `list_items`
- OSM/Google denormalized place copies
- Leaving family-wide `lists_write_members` ALL
- Shipping PlaceInspector / map-partial copy-to-trip, exp/food/hotel schedule copy, or Content Library CMS in this slice
- Cloning a Family Collections panel; hashing UUID → number; dual-writing hearts
- Calling `resolve_my_person_id` from SELECT RLS (side-effect auto-link)
- Putting list covers in the public `catalog` bucket, setting `public_url` on family objects, PostgREST-inserting `media_assets`, or calling Nest Unsplash on Family

### Checklist

- [x] §26 intent locked in this document  
- [x] Additive migration + schema-design / DBML + explore-locks one-liner  
- [x] Live apply + advisors + SQL smoke  
- [x] Phase 2: Family nav + feed TREK CollectionsPage  
- [x] Phase 2.1: Cover file upload to `media_assets`  
- [x] Phase 3: Explore Add to list  
- [x] Phase 4: Copy to trip (W8.5)  
- [x] Phase 5: iOS library  
- [x] Catalog map-partial Bookmark (web + iOS; left of heart)  

---

## 27. Family Settings + membership admin (TREK chrome)

**Status:** Implemented (own-avatar RPC + email re-auth).  
**iOS blast radius:** additive `register_person_avatar` only. No new tables, no `can_review_access` change, no `copy_list_items_to_trip`. `PersonAvatarStore` stays read-only. Dad = `family_members.role = patriarch`. Mom = `parent` (household admin = Postgres `can_review_access`). Child/guest stay those roles and never see `/admin`. If Mom cannot open Admin, fix **data** (`parent`), not a new helper.

### Locked intent

- TREK `/admin` and `/settings` chrome stay. Do **not** invent a Family admin app. Do **not** clone TREK Admin on iOS (approval queue already exists).
- **SoR:** Auth + `profiles` / `people` / `family_members` / `access_requests`. **No** TREK `users` table. **No** Nest `adminApi` / `notificationsApi` / `settingsApi` on supabase.
- Open `/admin` iff `is_super_admin` **or** active `patriarch` **or** `parent` (same as `can_review_access`). Super-admin sees all families; patriarch/parent see their `family_id`. Child/guest never see `/admin`. Do **not** set every parent’s TREK `user.role` to `admin`.
- `branch_people.owner|admin` is Vacay household paint, not this console.
- **Hide on Family (reopen later as a new lock):** Addons, Plugins, MCP tokens, GitHub, Backup, demo baseline. **§30** activates Family product audit (not TREK `AuditLogPanel`).
- **Keep visible:** Users, User Defaults, Configuration, Settings, Notifications. Defaults / Config / Admin Settings / Notifications: empty copy — do **not** mount Nest `PackingTemplateManager` / `CategoryManager` (Workspace Lists packing is **not** this slice).
- **Users:** UUID DTOs. Do **not** hash UUID → number on `AdminUser`. Create = email invite via `submit_access_request` then Edge `approve-access-request`. Edit `family_members.role` (and roster `people.display_name`). Do **not** delete `auth.users` from the SPA — suspend `family_members.status` or toast. Stats: members / family trips / `trip_places`; omit Nest file totals.
- **Member Settings:** roster name `people.display_name` (also upsert `profiles.display_name`); timezone `profiles.preferred_time_zone`; accent `people.accent_hex` (`#RRGGBB`, same as iOS `AccentStore`). Device map/language/dark mode stay localStorage. Do **not** persist TREK `appearance` JSON as SoR. Password stays §18. Passkeys/MFA stay nestOnly.
- **Avatar:** Storage upload to `{family_id}/people/{person_id}/{uuid}.ext`, then RPC `register_person_avatar` (inserts `media_assets`, sets `people.avatar_media_id`). Any linked member may change **their own** photo. Reviewer may call the same RPC for another person (no Admin photo UI this slice). Do **not** widen `media_assets_write_editors`.
- **Email:** re-auth with current password (same as §18), then `auth.updateUser({ email })`. If confirmation is pending, toast and do **not** treat the new address as saved. When Auth email actually changes, upsert `people.email`.

### Anti-patterns (do not)

- Nest `adminApi.createUser` / `adminApi.users` / `authApi.getAppConfig` on supabase
- Hashing Family UUIDs onto TREK numeric `AdminUser.id`
- A new RLS helper because a spouse is stored as `guest`
- Mounting PackingTemplateManager / CategoryManager / Backup / Audit on the Family plane
- Deleting `auth.users` from the SPA
- Widening `media_assets` write RLS so every member can insert family media
- Treating a pending Auth email change as saved (Zustand / `people.email`)

### Checklist

- [x] §27 intent locked in this document  
- [x] Reviewer gate on ProtectedRoute + Navbar / MobileTopBar (`can_review_access`)  
- [x] `useAdmin` skips Nest; instance tabs hidden  
- [x] Family Users adapter + TREK Users tab (roster + access_requests + invite)  
- [x] Account / Appearance adapters (name, avatar, timezone, accent)  
- [x] `register_person_avatar` (own photo; no `media_assets` RLS widen)  
- [x] Email re-auth + pending-confirm toast; `people.email` after Auth switches  
- [x] `tsc --noEmit`; targeted Vitest  

---

## 28. Family Admin governance foundation

**Status:** Implemented (architecture/guardrail phase; no configurable permission table yet).
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md).
**iOS blast radius:** none. No table/type/RLS behavior changed. Existing proposal and Workspace governance remain authoritative.

### Control planes (do not conflate)

- **Family Administration:** member/access management, future Family permissions, Personalization, User Defaults, Notifications, optional Features, and product audit. These surfaces use Supabase Auth + RLS + FamilyTravelApp migrations.
- **Platform Operations:** Auth-provider configuration, project secrets, JWT/signing keys, database backups/PITR, Storage replication, and deployment health. These are super-admin/operator concerns and do not become parent-controlled family rows.
- **Excluded from Family:** arbitrary plugin upload/execution, SQLite restore, TREK GitHub/support feed, permanent member/trip deletion, and any browser form that returns raw service secrets.
- `/admin` remains TREK chrome. Active `patriarch` / `parent` / super-admin may open it; authority inside a future surface is narrower where required.

### Family governance vocabulary (frozen for Phase 1)

- **Actor scopes:** `patriarch`, `reviewers`, `trip_travelers`, `non_guest_members`, `active_members`.
- **Outcomes:** `direct`, `propose`, `deny`.
- **Capability groups:** family membership/governance (includes `family.export.manage`); trip lifecycle; Places/Plan/Bookings; costs; packing/todos; files; collaboration; sharing.
- Existing behavior remains the default: `can_review_access` controls family administration; `can_mutate_trip` / HOF controls published Workspace writes; non-HOF work uses the `trip_change_*` draft/request pipeline.
- Changing the future family permission matrix is patriarch/super-admin authority. Parent access to `/admin` does not grant the ability to elevate permissions.
- Permanent delete is not a capability. Use archive, suspend, cancel, trash, and retention workflows.

### Data-plane isolation

- Family Admin descendants must not call `adminApi`, `authApi`, `settingsApi`, `notificationsApi`, `backupApi`, or `/api/*` merely because TREK chrome is mounted.
- Nest `PermissionsPanel` / `permissionsStore` / `adminApi` stay Nest-only. §30 mounts a **Family** permissions matrix and product-audit panel on the same `/admin` Users + Audit tabs.
- Nest `PackingTemplateManager` and `CategoryManager` stay Nest-only. §31 mounts a **Family** packing-template manager and §32 mounts a **Family** place-category manager on the Personalization tab (`adminSurfaces.config = active`).
- Nest `DefaultUserSettingsTab` stays Nest-only. §33 mounts a **Family** defaults manager on User Defaults (`adminSurfaces.defaults = active`). Member web hydrates the four portable fields from `get_my_effective_preferences`; map provider/token, appearance, language, and booking-code blur stay on their current device/Nest paths.
- Nest `AdminNotificationsTab` stays Nest-only. §34 mounts a **Family** notification manager on Notifications (`adminSurfaces.notifications = active`). Member web hydrates the TREK bell/inbox from Family UUID adapters; webhook/ntfy/plugin/SMTP stay Nest-only.
- Admin Settings, plugins, addons, and backup stay Nest-only until a dedicated Family phase supplies a Supabase adapter and RLS contract. **§37** mounts a Family **Features** surface (`adminSurfaces.features = active`); Nest `AddonManager` stays Nest-only and remains hidden on the supabase plane. **§38** mounts a Family **Export** surface (`adminSurfaces.export = active`) under Maintenance. Nest `BackupPanel` / `backupApi` stay Nest-only; `adminSurfaces.backup` remains hidden platform ops.
- Family-planned tabs remain visible with explicit deferred copy. Instance-only tabs remain hidden. Do not render an empty panel after a failed Nest request.
- Tab/surface classification is centralized in `client/src/pages/admin/adminSurfaces.ts`; do not add new scattered `supabasePlane` visibility conditions.

### Security/advisor baseline

- Live RLS-without-policy findings for `_lists_files_probe`, `etl_sync_state`, and `etl_watermarks` are fail-closed. ETL state stays service-role-only; the probe table is an operational artifact. No policy is added merely to silence an informational advisory.
- Existing public `security definer` functions require fixed `search_path`, revoked `public` / `anon`, and narrow grants. Do not mass-move shared functions without an iOS/web consumer audit.
- Admin-path missing FK indexes may be added in FamilyTravelApp when evidenced by query shape/advisors. Schema changes remain additive.
- Storage buckets currently have a 250 MiB ceiling while the app contract is 50 MiB. **§35** owns server-side MIME/size alignment; §28 does not change uploads.

### Phase boundary

1. **Phase 1A / §29:** Web Workspace Change-Request parity — **implemented**.
2. **Phase 1B / §30:** Family permission matrix + append-only audit — **implemented**.
3. **Phase 1C / §31:** Family packing-template administration — **implemented**.
4. **Phase 1D / §32:** Family place-category taxonomy — **implemented**.
5. **Phase 1E / §33:** Family defaults and member preference inheritance — **implemented**.
6. **§34:** Family notification delivery — **implemented**.
7. **§35:** Identity assurance and private-file policy — **implemented** (foundation + §35.1 enforcement).
8. **§36 / Phase 1F:** Workspace place categories — **implemented**.
9. **§37 / Phase 1G:** Family feature rollouts — **implemented** (pilot keys `vacay`, `collections`, `workspace.place_categories`; default-on). Nest AddonManager stays Nest-only.
10. **§38 / Phase 1H:** Family-scoped data export — **live** (`20260822044105`). Nest BackupPanel stays Nest-only. Platform backup/PITR remains a separate runbook.

### Checklist

- [x] §28 control-plane and authority contract locked
- [x] Family/Nest/platform surface classification centralized
- [x] Supabase-plane `PermissionsPanel` / Nest request leakage removed
- [x] Security/performance advisor findings classified; only evidenced additive hardening
- [x] Phase 1A change-request prerequisite documented
- [x] Targeted Admin tests, typecheck, and Supabase-plane smoke

---

## 35. Identity assurance and private-file policy

**Status:** Foundation implemented. **§35.1 enforcement active** (`20260821202732`, 2026-08-21). Do not apply `gated-migrations/20260821140200_family_identity_file_enforcement.sql`. Emergency rollback: `gated-migrations/rollback_family_identity_file_enforcement.sql`.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) §35 / §35.1.  
**iOS blast radius:** High. Catalog key `family.identity.manage`. `resolve_my_person_id` is read-only. TOTP, recovery URL scheme, biometric session gate (no stored passwords), upload-then-finalize, durable purge states. Restrictive AAL is live on every classified private table.

### Locked intent

- One §35 contract, two ordered tracks: **35A identity** and **35B private files**. Shared Admin Settings surface and rollout gate; independent migrations, RPCs, and tests.
- Auth owns accounts; `family_members` owns access; `people` is the roster. Runtime email matching never writes `people.user_id`.
- Patriarch/parent sessions require TOTP `aal2`. Other members may opt in; an enrolled factor must be completed before private family access.
- `family.identity.manage`: patriarch-only, not configurable. Parents inspect identity/file health read-only.
- Trip-file reads stay **active-family-member** (§25). Fixed MIME/size policy — not family-configurable. Avatars/covers remain `media_assets`. Catalog ETL unchanged.
- V1 exclusions: passkeys/WebAuthn, provider/SMTP UI, account deletion, Apple-provider activation/merging, request-access redesign, antivirus/DLP, catalog media rewrites, Storage replication/PITR, configurable retention.

### Web client

- Adapter: `client/src/data/supabase/auth.ts` (TOTP, reauth, recovery, sessions) + `familyIdentity.ts` (bootstrap, Admin health, HOF link). `{ error }` throws.
- Gate `authStore` / `useLogin` on `get_my_auth_bootstrap`. Challenge enrolled factors before Family data. Distinguish suspended, pending-invite, unlinked, and no-membership — do not collapse all failures into `/request-access`.
- **Pre-AAL boundary:** `authGate === 'ok'` is required before private family hydration (preferences, inbox, avatars, accent, people settings). `authGate == null` is still loading, not “member enough.” Do not persist `membershipLoaded`. Unlinked members go to `/request-access` (iOS parity), not the TREK shell.
- `/forgot-password` and `/reset-password` branch to Supabase recovery on the Family plane; Nest behavior unchanged. Detect the Auth recovery session on the existing `/reset-password` route. No new `App.tsx` path.
- Family Account security panel replaces Nest-only MFA pixels on supabase. No fake TREK backup codes. Subscribe the shell to Auth state changes.
- Admin: activate `adminSurfaces.settings`. Mount Family identity/file-policy manager. Never mount Nest `AdminSettingsTab` on supabase. No `adminApi` / `authApi` / `/api/*` for this surface.

### Files

- `tripFiles.ts` / avatars / list covers: upload then `finalize-private-upload`. Surface pending purge. Stop best-effort client deletion of referenced objects. TREK Files chrome unchanged.
- Trip-file signed URLs: short expiry, refresh on open. Never persist in Zustand/Dexie.

### 35.1 Enforcement activation (locked)

- RLS policies call `public.session_meets_*` wrappers. Never `GRANT USAGE` on `family_auth` to `authenticated`.
- Coverage inventory: FamilyTravelApp `docs/schema-design.md` §35 RLS AAL coverage. Missing classification fails `phase35c`.
- Rollback candidate restores `trip_files_insert_upload` / `trip_file_links_write_metadata` and authenticated file DML grants. Validate apply/rollback/reapply off production.
- Production AAL/DML is live. Local apply/rollback remains proven. Dashboard cleanup cron is live (POST 200). Residual patriarch device/browser MFA/file checks stay unconfirmed. Do not apply `20260821140200`.

### Anti-patterns (do not)

- Auto-linking `people.user_id` from email at runtime
- Mounting Nest `AdminSettingsTab` or calling `authApi` MFA/password endpoints on the supabase plane
- Displaying fake TOTP backup codes
- Persisting signed URLs or storing account passwords in Keychain/localStorage
- Family-configurable MIME lists or narrowing trip-file reads to travelers
- Applying `20260821140200` as written, granting `family_auth` to clients, or rolling back without `rollback_family_identity_file_enforcement.sql`
- Hydrating preferences / inbox / avatars / accent / splash-family while `authGate` is MFA, unlinked, or still null

### Checklist

- [x] §35 intent locked in this document and `admin-governance.md` / `schema-design.md`
- [x] Additive 35A/35B foundation
- [x] Web TOTP/recovery/bootstrap + Admin Settings; Nest Account/Files regressions retained
- [x] iOS TOTP/recovery/biometric gate + upload finalization
- [x] SQL/Edge/web/iOS verification (foundation applied)
- [x] §35.1 enforcement contract + complete RLS coverage inventory
- [x] Pre-AAL client hardening + gate/race regressions
- [x] Complete enforcement SQL (public wrappers + full coverage) + phase35C + rollback candidate (`20260821202732`)
- [x] Isolated apply → rollback → reapply on local Docker (`FamilyTravelApp/scripts/rehearse_phase35_enforcement.sh`)
- [x] Operational readiness (unauthorized cleanup dispatch 401; queue lifecycle proven locally; Dashboard/cron `dispatch-storage-cleanup` POST 200)
- [x] Production `db push` of `20260821202732` (2026-08-21; 35A/B/C structural ok; `20260821140200` stays unapplied)
- [ ] Residual physical/browser acceptance on reviewer devices (1 linked TOTP patriarch; shipped-client MFA/recovery/upload/purge still unconfirmed)

---

## 29. W8.5.1 — Web Workspace Change-Request parity

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1A.  
**iOS reference:** `WorkspaceGovernanceChrome` / `TripWorkspaceModel` / `TripsService`. Postgres remains SoR.  
**iOS blast radius:** none expected. No migration unless verification finds a backend defect.

Phase 1A is **web-only consumption** of the live `trip_change_*` pipeline. It is not Phase 1B (permission matrix / audit) and not hub trip proposals (`create_trip_proposal`).

```text
/trips/:uuid
  → FamilyTripWorkspaceShell
  → WorkspaceGovernanceChrome (Published | My Draft + Propose + withdraw + HOF inbox)
  → adapters → ensure/upsert/delete/submit/withdraw/resolve RPCs
  → apply_trip_change_op_v1 (internal; never client-callable)
```

### Layers and capability

| Helper | Who | Where |
|--------|-----|--------|
| `can_mutate_trip` | HOF / super-admin | **Published** writes for covered modules; Transport, Lists, Files, tracks, day titles, settle |
| `can_draft_trip_changes` | HOF or `trip_travelers` | **My Draft** staging |
| Hub `canMutateTrips` | patriarch / parent | Hub archive/delete only — never workspace |

- `canEditPublished` = `can_mutate_trip` **and** layer = Published.
- `canStageDraft` = `can_draft_trip_changes` **and** layer = My Draft.
- HOF on My Draft stages (does not silently write published rows).
- Published + eligible non-HOF: disable write chrome and nudge to My Draft.
- Guests / non-travelers who cannot draft stay read-only.

### Modules (schema_version 1)

| Module | Stage from | Notes |
|--------|------------|-------|
| `trip_place` | Places add/remove; Explore place; out-of-purview dest expansion | Stage destination **before** dependent plan/reservation ops |
| `plan_item` | Plan assign/remove/reorder; Explore experience/food | Payload activity / place_id / starts_at / sort_order / experience_id / food_id |
| `day_note` | Plan note sheet add/update/remove | Day **title** stays HOF-only (`trip_days` is not a module) |
| `reservation` | Bookings add/update/status/remove; Explore hotel stay | Apply-v1 header only. Metadata, plan-link, expense-link, import unstaged (disclose). **Transport legs stay HOF 2A** |
| `expense` | Costs add/update/remove of the expense **header** | Splits, payers, tickets, reservation links, payments, settle stay HOF-direct. Never silently drop entered extras |

### Surfaces

- Compact **Published / My Draft** control: floating on Plan/map **above** the desktop `PoiCategoryPill` at the existing `min(560px, 100% - 24px)` width; inset under tabs on other workspace tabs.
- Draft op list with delete; Propose confirm + optional summary; submit empties the personal draft and returns to Published without mutating published rows.
- Proposer may **withdraw** only while status is `submitted`.
- HOF inbox (workspace, **not** `/admin`) lists `submitted` / `partially_applied`; per-op Apply/Reject plus confirmed bulk Apply/Reject via `resolve_trip_change_request`.
- Reload governance + affected slices after resolve. Show `error_code` / HOF notes on fail-closed apply. No Realtime.

### Explicitly out of §29

Packing, todos, Files, recorded tracks, day-title edits, Transport legs/import, expense settle/payments/shares, Collections copy-to-trip (still HOF toast), hub Propose/vote, Admin Permissions, permission-policy tables, Nest plane.

### Anti-patterns (do not)

- Frontend-only permission store or changing `can_mutate_trip` semantics
- Calling `apply_trip_change_op_v1` from the browser
- New App.tsx routes or putting the HOF inbox on `/admin`
- Staging Transport legs, file bytes, or packing as fake `reservation`/`expense` ops
- Silently dropping ticket/split/metadata fields on draft save
- Conflating hub `proposals` with `trip_change_requests`

### Checklist

- [x] §29 intent locked in this document  
- [x] `tripChangeRequests` adapters + `schema_version: 1` payloads for all five modules  
- [x] `canDraftTripChanges` wrapper; `{ error }` throws  
- [x] Governance hook + Published/My Draft chrome + Propose/withdraw + HOF inbox  
- [x] Contextual staging from Places/Plan/Explore/Bookings/Costs (notes)  
- [x] Out-of-purview `trip_place` before plan/reservation  
- [x] English + Spanish `trip.governance.*`  
- [x] Targeted Vitest + `tsc --noEmit` + page-pattern lint  

---

## 30. Phase 1B — Family permission matrix and product audit

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1B.  
**iOS blast radius:** High. Shared RLS, Storage `trip-files`, change-request RPCs, packing/todos/files, hub archive/cover, and `can_draft_trip_changes` retarget to action-aware helpers. `can_mutate_trip` stays the HOF boolean. Admin matrix/audit is web-only.

### Locked intent

- Postgres owns the matrix (`family_capability_catalog` + `family_permission_policies`) and append-only `family_audit_events`. No Zustand/`permissionsStore` SoR.
- Outcomes: HOF/super-admin always `direct`; else matching `direct_scope`, else matching `propose_scope`, else `deny`. `trip_travelers` requires trip context.
- Defaults preserve current behavior: reviewers keep member-management + archive/cover/metadata; five Phase 1A modules are HOF `direct` + traveler `propose`; packing/todos/files/travelers/settle stay HOF-only until customized; unmapped actions (tracks, day titles) stay on `can_mutate_trip`.
- Parent `/admin` visibility ≠ `family.permissions.manage`. Matrix mutation is patriarch/super-admin. Parents see the matrix read-only.
- `can_decide_proposal` and audience/officer helpers are additional predicates. The matrix never replaces them.
- Permanent Family trip delete is removed from chrome and RLS. Archive remains the lifecycle operation. Nest delete is unchanged.
- Phase 1A contracts stay: five modules, snake_case v1 payloads, inbox on `/trips/:uuid` not `/admin`, never client-call `apply_trip_change_op_v1`.
- TREK `/admin` paths and chrome stay. Permissions live under Users. Product audit uses the existing Audit tab (`adminSurfaces.audit = active`). Nest `AuditLogPanel` / `PermissionsPanel` remain Nest-only.

### Enforcement map

| Capability | Tables / RPCs / Storage |
|---|---|
| `family.members.manage` | `family_members` writes; `access_requests` reviewer update |
| `family.permissions.manage` | policy update/reset RPCs |
| `trip.propose` | `create_trip_proposal` (plus existing member/branch predicates) |
| `trip.places.manage` | `trip_places`, `trip_countries`; change-request `trip_place`; Collections copy-to-trip |
| `trip.schedule.manage` | `schedule_items`, `day_notes`; change-request `plan_item` / `day_note` |
| `trip.reservations.manage` | `trip_reservations` + endpoints/legs; change-request `reservation` |
| `trip.costs.manage` | `trip_expenses` + shares/payers; `budget_items`; change-request `expense` |
| `trip.costs.settle` | `trip_expense_settlements`; `settle_trip_expense_flows` |
| `trip.packing.manage` | packing items/bags/assignees; `ensure_packing_defaults`; `apply_packing_template` |
| `trip.todos.manage` | `todo_items`, `todo_category_assignees` |
| `trip.files.upload` | `trip_files` insert; Storage `trip-files` insert/update |
| `trip.files.metadata` | file metadata/link RPCs |
| `trip.files.trash` | trash/restore/purge RPCs; Storage delete |
| `trip.archive` / `trip.cover.manage` / `trip.metadata.edit` | `trips` UPDATE trigger (column-aware) |
| `trip.travelers.manage` | `trip_travelers` |
| Unmapped | `trip_tracks`, `trip_days` titles, `trip_media` → `can_mutate_trip` |

Change-request stage/submit: `propose` or voluntary HOF draft. Resolve: module `direct`. Bulk resolve preflights mixed authorization so unauthorized ops never become rejected side effects.

### Web client

- Adapters: `client/src/data/supabase/familyPermissions.ts`. `{ error }` throws.
- Admin: Family permissions panel on Users; Family product-audit panel on Audit. No new `App.tsx` route.
- Workspace: `writeModeFor(key)` from the trip outcome map. `direct` → Published writes; `propose` → Phase 1A draft path only; `deny` fails closed.
- Hub archive uses `trip.archive`. Hard-delete chrome is hidden on the Family plane.

### Anti-patterns (do not)

- Frontend-only permission store or Nest `adminApi.getPermissions` on supabase
- Changing `can_mutate_trip` from HOF boolean to an action map
- Granting `family.permissions.manage` because a parent can open `/admin`
- Misclassifying tracks / day titles as `trip.schedule.manage`
- Staging packing, files, or transport legs as fake Phase 1A ops
- Putting secrets, file bytes, or IP claims in `family_audit_events`
- “Fixing” fail-closed ETL tables (`etl_sync_state`, `etl_watermarks`, `_lists_files_probe`) with permissive policies

### Checklist

- [x] §30 intent locked in this document and `admin-governance.md`
- [x] Additive catalog / policy / audit schema + `family_auth` resolvers + public RPCs
- [x] Action-aware RLS / Storage / change-request hardening + successful-mutation audit
- [x] iOS DTOs + per-action Workspace outcomes (compatibility `canMutateTrip` retained)
- [x] Web Admin matrix + product audit; Workspace/hub/lists/files consume outcomes
- [x] Family hard-delete chrome/RLS removed
- [x] SQL smokes, advisors, web/iOS tests, typecheck  

---

## 31. Phase 1C — Family packing templates

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1C.  
**iOS blast radius:** Low. Catalog key `family.templates.manage`; template DML moves to RPCs; `save_packing_template_from_trip` retargets to that key. `TripListsService` list/apply/save signatures stay. Admin CRUD is web-only.

### Locked intent

- Activate only family packing-template administration on `/admin` Personalization. Place-category taxonomy is §32. Defaults, notifications, identity/file policy, features, integrations, and new routes stay deferred.
- Authoring is web-only. Existing iOS and web Workspace list / apply / save-from-trip flows remain compatible.
- Capability `family.templates.manage`: default and allowed direct scopes `reviewers` / `patriarch`; no propose; configurable. Do not reuse `family.defaults.manage` or `trip.packing.manage`. Apply-to-trip stays `trip.packing.manage`.
- Keep the two-table shape. UI groups derive from `packing_template_items.category`. Empty groups are not persisted.
- Mutations are transactional RPCs. Client template INSERT/UPDATE/DELETE is unavailable. Audit stores IDs, item counts, and changed field names only.

### Web client

- Adapters: `client/src/data/supabase/familyPackingTemplates.ts`. `{ error }` throws. Workspace helpers in `client/src/data/supabase/packing.ts` stay for list/apply/save-from-trip.
- Admin: `FamilyPackingTemplateManager` on Personalization when `VITE_DATA_PLANE=supabase`. Nest `PackingTemplateManager` + `CategoryManager` remain Nest-only.
- No new `App.tsx` route.

### Anti-patterns (do not)

- Porting Nest numeric template IDs or `template_categories` as SoR
- Mounting Nest packing/category managers on the supabase plane
- Letting `trip.packing.manage` authorize template authoring, or `family.templates.manage` authorize applying a template onto a trip
- Persisting empty category groups
- Putting item names, quantities, or full documents in `family_audit_events`

### Checklist

- [x] §31 intent locked in this document and `admin-governance.md`
- [x] Additive `family.templates.manage` + transactional Admin RPCs + audit
- [x] Web Family packing-template manager; Personalization active
- [x] iOS list/apply/save contracts unchanged
- [x] SQL smokes, advisors, web/iOS tests, typecheck

---

## 32. Phase 1D — Family place-category taxonomy

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1D.  
**iOS blast radius:** Low. Catalog key `family.place_categories.manage`; additive `family_place_categories` + Admin RPCs. No iOS category UI or consumer. Optional `FamilyCapabilityKey` parity only.

### Locked intent

- Activate family place-category palette authoring on `/admin` Personalization (stacked with packing templates). No new route.
- Authoring is web-only. The first consumer is **§36** (`trip_places.family_place_category_id`). Explore, Collections, `places.place_type_id`, packing/TODO text groups, costs, and trip occasions stay distinct.
- Capability `family.place_categories.manage`: default and allowed direct scopes `reviewers` / `patriarch`; no propose; configurable. Do not reuse `family.templates.manage` or `family.defaults.manage`.
- Palette rows store trimmed name, six-digit hex color, frozen Lucide `icon_key` from TREK `categoryIcons.ts`, and deterministic `sort_order`. Family-scoped case-insensitive unique names.
- Mutations are transactional RPCs. Client INSERT/UPDATE/DELETE is unavailable. Audit stores category ID, changed field names, and ordering metadata only.

### Web client

- Adapters: `client/src/data/supabase/familyPlaceCategories.ts`. `{ error }` throws. UUID DTOs.
- Admin: `FamilyPlaceCategoryManager` stacked with `FamilyPackingTemplateManager` on Personalization when `VITE_DATA_PLANE=supabase`. Nest `PackingTemplateManager` + `CategoryManager` remain Nest-only.
- Reuse TREK CategoryManager interaction language (create/edit/delete, preset + custom color, icon picker, preview) with semantic tokens. No Nest `categoriesApi`.
- No new `App.tsx` route.

### Anti-patterns (do not)

- Porting Nest numeric category IDs as SoR
- Mounting Nest packing/category managers on the supabase plane
- Reusing `family.templates.manage`, packing/TODO `category` text, `place_types`, Explore pills, or Collections `list_category`
- Attaching a generic `category_id` to `places` / `list_items`, or inferring Workspace categories from `place_type_id` / Explore pills (Workspace uses `family_place_category_id` under §36)
- Putting names, colors, or icons in `family_audit_events`

### Checklist

- [x] §32 intent locked in this document and `admin-governance.md`
- [x] Additive `family.place_categories.manage` + table + transactional Admin RPCs + audit
- [x] Web Family place-category manager; Personalization stacks both Family managers
- [x] No iOS Admin authoring; capability-enum parity only. Workspace consumer is §36
- [x] SQL smokes, advisors, web/iOS tests, typecheck

---

## 33. Phase 1E — Family defaults and member preference inheritance

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1E.  
**iOS blast radius:** Medium. Shared catalog key `family.defaults.manage` (already seeded). Additive `family_preference_defaults` / `family_member_preferences` + RPCs. iOS Settings “Travel & map” becomes the four portable controls; Plan weather/time labels and Costs **display** currency consume the resolver. `trips.currency_code` stays ledger/settlement SoR.

### Locked intent

- Patriarchs (and super-admins) author family defaults in `/admin` User Defaults. Parents may inspect Admin defaults **read-only**. Every active member may override or reset the four portable fields on web Settings and iOS Settings.
- Precedence: **member override → family default → built-in** (`celsius`, `metric`, `24h`, trip currency).
- Capability `family.defaults.manage`: family context; default and allowed direct scopes `patriarch` only; no propose; **not configurable**. Do not reuse `family.templates.manage`, `family.place_categories.manage`, or Vacay `can_review_access` for writes. HOF / super-admin remains always `direct`.
- Portable fields only: `temperature_unit`, `distance_unit`, `time_format`, display currency. Display currency three-state: member `inherit` / explicit `trip` / fixed ISO (validated against `currencies`). Family null means trip currency. Never reinterpret `trips.currency_code`.
- Explicitly **out of scope:** appearance, language, timezone (`profiles.preferred_time_zone`), accent (`people.accent_hex`), map provider/style/token, booking-code privacy, notifications, trip proposal defaults, TREK appearance JSON, `family_calendar_settings`.

### Web client

- Adapters: `client/src/data/supabase/familyPreferences.ts`. `{ error }` throws. UUID DTOs.
- Admin: `FamilyDefaultPreferencesManager` on User Defaults when `VITE_DATA_PLANE=supabase`. Nest `DefaultUserSettingsTab` remains Nest-only and must not be called on the Family plane.
- Member `settingsStore` hydrates effective values after family membership loads; persists only these four fields through `update_my_family_preferences` with rollback. Weather, route, time, and Costs keep reading the same store fields (`temperature_unit`, `distance_unit`, `time_format`, `default_currency`). Empty `default_currency` still means trip currency.
- `DisplaySettingsTab` shows inherited sources and “Use family default.” No new `App.tsx` route.

### Anti-patterns (do not)

- Porting Nest instance defaults (map tokens, LLM keys, appearance JSON, booking-code blur) as family SoR
- Mounting Nest `DefaultUserSettingsTab` on the supabase plane
- Reusing packing/place-category/Vacay capabilities for preference writes
- Storing preference **values** in `family_audit_events` (field names + reset/update only; personal overrides are not audited)
- Using display currency to rewrite trip ledger/settlement currency

### Checklist

- [x] §33 intent locked in this document and `admin-governance.md` / `schema-design.md`
- [x] Additive family defaults + member override tables, RPCs, RLS, bounded Admin audit
- [x] Web Family User Defaults + member settingsStore inheritance; Nest defaults unchanged
- [x] iOS effective-preferences store, Settings, Plan weather/time, Costs display FX
- [x] SQL smokes, advisors, web/iOS tests, typecheck

---

## 34. Family notification delivery

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) §34.  
**iOS blast radius:** Medium. Catalog key `family.notifications.manage`. Additive inbox/preference/device/delivery tables + RPCs. iOS APNs registration, Settings toggles, inbox, and typed router. `TripReminderNotifier` stays device-local.

### Locked intent

- Independent track — **not** “Phase 1F.” Patriarchs (and super-admins) author family **push** defaults in `/admin` Notifications. Parents inspect Admin **read-only**. Every active member may override or reset per-event APNs on web Settings and iOS Settings.
- In-app inbox is **mandatory** for eligible linked recipients. iOS APNs is preference-controlled. Existing Supabase Auth invite email is unchanged.
- Precedence: **member override → family push default → catalog default (`true`)**.
- Capability `family.notifications.manage`: family context; default and allowed direct scopes `patriarch` only; no propose; **not configurable**. HOF / super-admin remains always `direct`.
- Frozen events: access request submitted → reviewers; proposal created → eligible voters; proposal ready for decision → deciders; proposal accepted/rejected → proposer + eligible participants; change request submitted → trip deciders; change request terminally resolved → proposer. Exclude the actor. Do not notify per-vote or per-op.
- Explicitly **out of scope:** web push, new transactional email, webhook/ntfy/plugins, W9.2 Realtime, game/message notifications, server-scheduled trip reminders.

### Delivery

- Emit inbox + durable push jobs in the same transaction as the successful mutation. Never call APNs from mutation RPCs. Never fan out from `family_audit_events`.
- Scheduled Edge worker `dispatch-notifications` claims jobs (`FOR UPDATE SKIP LOCKED`), signs APNs JWTs from Vault secrets, classifies 410 vs transient, retries, dead-letters. Secrets never enter `VITE_*` or client-readable rows.
- Payloads are destination kind + UUIDs. Lock-screen copy is a localized loc-key with no trip/access details.

### Web client

- Adapter: `client/src/data/supabase/familyNotifications.ts`. `{ error }` throws. UUID DTOs. No `notificationsApi` / `settingsApi` / `adminApi` / `/api/*` / Nest WebSocket on the Family plane.
- TREK bell (`InAppNotificationBell`), `/notifications` (no new `App.tsx` route), and `inAppNotificationStore` consume a plane-aware boundary: Family UUID rows vs Nest numeric rows share pixels; Nest IDs are not SoR.
- Refresh on auth, page visibility, bell/page open, and a modest active-session interval. `useInAppNotificationListener` stays Nest-only.
- Member `NotificationsTab`: mandatory in-app + inherited per-event APNs + reset-to-family on supabase. Nest keeps webhook/ntfy/plugin/SMTP.
- Admin: `FamilyNotificationDefaultsManager` when `VITE_DATA_PLANE=supabase`. Event-level family push defaults, channel/device-count health without token disclosure, parent read-only. Nest `AdminNotificationsTab` remains Nest-only.

### Anti-patterns (do not)

- Mounting Nest `AdminNotificationsTab` or calling `notificationsApi` on the supabase plane
- Web push, Resend/SMTP, ntfy, or plugins as Family SoR
- Storing APNs tokens, emails, or lock-screen trip details in `family_audit_events`
- Executing approve/deny/vote from a push payload
- Replacing device-local `trips.reminder_days` / `TripReminderNotifier` with server jobs

### Checklist

- [x] §34 intent locked in this document and `admin-governance.md` / `schema-design.md`
- [x] Additive catalog/defaults/prefs/devices/inbox/delivery tables, RLS, RPCs, emitters, bounded audit
- [x] Scheduled APNs Edge worker + secret/config contract
- [x] Web Family Admin/member prefs + TREK bell/inbox UUID adapters; Nest notifications unchanged
- [x] iOS APNs registration, Settings, inbox, typed router; local trip reminders unchanged
- [x] SQL smokes, advisors, web/Nest/iOS tests, typecheck

---

## 36. Phase 1F — Workspace place categories

**Status:** Implemented.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1F.  
**iOS blast radius:** Medium. Additive nullable `trip_places.family_place_category_id` (already `trip_scoped` AAL). Duplicate copies destination categories. Draft `trip_place` / `update` may patch category. No new table; 136-row AAL inventory unchanged. Roll out database first; leave the nullable column if clients roll back.

### Locked intent

- One nullable Family category per `trip_places` association. Assignment capability is `trip.places.manage`. Palette authoring stays `family.place_categories.manage` (web Admin only).
- `is_primary` remains independent. Do not infer or backfill from `places.place_type_id` or Explore/OSM pills.
- Column name is `family_place_category_id` (not `category_id`) to avoid catalog `place_type_id`, expense `category`, and Nest numeric IDs.
- `ON DELETE SET NULL`. Same-family trigger rejects cross-family FKs. Direct writes use existing `trip_places` RLS + audit + §35.1 AAL.
- Draft payloads stay schema_version 1. Explicit `clear_family_place_category` for Swift omitted-vs-null. Old payloads remain valid and must not reset `is_primary` when only category is patched.
- `duplicate_trip` copies destination categories within the same family. New proposals stay uncategorized.
- Workspace members load the palette via table SELECT, not reviewer-gated `list_family_place_categories`.
- TREK chrome stays: sidebar filter, inspector/picker, map pin color/icon/name, hover cards. Preserve uncategorized and Primary visuals. Bulk multi-select assignment is deferred. Do not add category authoring to Workspace.

### Web client

- Adapters: member palette read in `familyPlaceCategories.ts`; join + nullable patch in `tripPlaces.ts`; payload helpers in `tripChangeRequests.ts`. `{ error }` throws.
- Hook/picker: `familyTripWorkspace/useFamilyWorkspacePlaceCategories.ts` + `FamilyPlaceCategoryPicker`. Published = direct update; My Draft = `trip_place` / `update`; deny/nudge reuse existing governance.
- Reuse `CATEGORY_ICON_MAP` and `MapMarkerPlace` category fields. Admin delete copy states attached trip places become uncategorized.

### Anti-patterns (do not)

- Attaching the palette to Explore pins, Collections, schedule rows, packing/TODO, or costs
- Calling Admin CRUD RPCs from Workspace
- Inferring categories from catalog place types
- Dropping the nullable column on client rollback
- Production-pushing this migration without a separate explicit activation

### Checklist

- [x] §36 intent locked in this document and `admin-governance.md` / `schema-design.md` / `workspace-explore-locks.md`
- [x] Additive FK + same-family trigger + duplicate/draft apply + DBML + SQL smokes
- [x] Web palette load, governed assignment, TREK map/sidebar/inspector
- [x] iOS DTO/picker/Workspace rendering + EN/es-419
- [x] Local verify; no production `db push` in this phase

---

## 37. Phase 1G — Family feature rollouts

**Status:** **Live** on production `gdqywxjlkcrsuylqdhmc` via `20260822022800_family_feature_rollouts.sql` (2026-08-21). Clients still default-on if RPCs are missing.  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1G / §37.  
**iOS blast radius:** Medium. Four additive tables + authenticated RPCs. iOS consumes `get_my_effective_features` only (no authoring). Production AAL inventory is **140** (+4). Client rollback must leave the additive tables intact.

**Activation (2026-08-21):** Linked `db push` applied only `20260822022800` after aligning local §36 history to already-live `20260822020836`. Phase 1G structural smokes passed; mutating fixtures skipped. Phase 35C structural `phase35c-structural-ok`. Production family effective flags remain all on (0 overrides). Advisors: security 168 (163 WARN / 5 INFO), performance 642 (436 WARN / 206 INFO). New hits are expected SECURITY DEFINER RPC WARNs, service-only `feature_rollout_events` RLS-without-policy INFO, and unused-index INFO on empty tables — do not revoke the RPCs. Rollback: keep tables/RPCs and `enabled` rollouts; revert clients if needed. Do not drop tables or clear Vacay / Collections / category data.

### Locked intent

- Two-tier availability: immutable product catalog + global rollout state (`enabled | preview | disabled`) + optional per-family override (missing row = inherit). Availability is not authorization. `family.features.manage` authors family overrides; existing RLS/capabilities still govern data access and writes.
- Pilot keys only: `vacay`, `collections`, `workspace.place_categories`. Seed globally `enabled` with catalog `default_enabled = true` so introducing the control plane does not hide current chrome.
- Precedence: global `disabled` always off; global `preview` on only when the family has an explicit enabled override; global `enabled` uses the family override when present, otherwise the catalog default. Failed or missing RPCs use compiled default-on values.
- Do not reuse Nest `addonStore` / `AddonManager` / plugins. Do not delete Vacay rows, Collections rows, or `trip_places.family_place_category_id` when a feature is disabled. Re-enable restores presentation from stored data.
- Web Admin is the control plane. HOF sees tri-state family controls (inherit / on / off). Parents inspect read-only. Super-admin additionally sees global enabled/preview/disabled and platform rollout history. iOS is read-only.

### Web client

- Adapter + Zustand availability store hydrate only after `selectMayHydratePrivateFamily` (same gate as prefs/inbox). Typed keys, compiled defaults, refresh after Admin save, non-blocking hydrate errors.
- Dedicated Admin surface `features`. Nest Addons remains hidden on supabase.
- Pilot gates: Vacay nav + `/vacay`; Collections nav/routes/widget/save modal/inspector and day-plan save + `/collections/*`; Workspace category palette/picker/filter/chips/map styling. Disabled deep links show localized unavailable copy (not a blank page).

### Anti-patterns (do not)

- Porting TREK AddonManager, plugins, or Nest `/api/addons` as Family SoR
- Clearing category FKs, list items, or calendar rows when a feature is off
- Treating availability as a substitute for `family.features.manage` or trip/Explore RLS
- Dropping the additive tables on client rollback
- Revoking authenticated EXECUTE on the §37 RPCs because advisors flag SECURITY DEFINER

### Checklist

- [x] §37 intent locked in this document and `admin-governance.md` / `schema-design.md` / DBML
- [x] Additive catalog/rollout/override/audit + RPCs + RLS/AAL + SQL smokes
- [x] Web store, Admin Features, Vacay/Collections/category gates, EN/es-419
- [x] iOS store, More/Library/Vacay gates, Workspace category suppression, EN/es-419
- [x] Local verify
- [x] Production `db push` of `20260822022800` (2026-08-21); pilots remain default-on

---

## 38. Phase 1H — Family-scoped data export

**Status:** Locked and **production-activated** on `gdqywxjlkcrsuylqdhmc` (2026-08-22).  
**Canonical brief:** sibling FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) Phase 1H / §38.  
**iOS blast radius:** Low. Additive `family_export_jobs` (service-only) + authenticated request/list/download RPCs + private `family-exports` bucket. iOS ships the capability constant and outcome test only. Existing trip PDF/ICS/CSV exports are unchanged. Production AAL inventory is **141** (`family_export_jobs`, `service_only`).

### Locked intent

- V1 is a web-admin, patriarch-gated **portability** export: a versioned `application/json` artifact (`schema_version = 1`) plus file **metadata/inventory**. Storage bytes, ZIP bundling, import/restore, member self-export, scheduled exports, curated integrations, and **platform backup/PITR** remain separate phases.
- Preserve current visibility: family-visible records plus the **requester’s own** private rows. Never include another member’s private lists, drafts, preferences, marks, inbox, or calendar rows.
- Explicitly exclude `auth.*`, MFA/session data, APNs and calendar-feed tokens, signed URLs, service queues, cleanup jobs, ETL state, platform rollout audit, shared catalog rows/media, and raw Storage paths. Represent shared catalog entities by stable IDs. Include archived family records; omit trashed/purged file objects and all secret-bearing columns.
- Authority: `family.export.manage` (family context, patriarch direct, no propose path, not configurable). Parents may inspect job status read-only via `can_review_access`. Children/guests cannot enter Admin or request exports. Super-admin acts only inside an explicit family context. Do **not** add a §37 feature key; availability is not export authority.
- Control plane: durable `family_export_jobs` (queued / processing / completed / failed / expired), one active (`queued`/`processing`) job per family, 24-hour artifact expiry, private `family-exports` bucket (JSON only, no authenticated `storage.objects` policies). Downloads are server-issued signed URLs (~120 seconds) that are never persisted. Request and download require AAL2.
- Web Admin surface `export` under Maintenance. Keep `backup` hidden/platform-only. Do not call Nest `backupApi` or `/api/*`.

### Anti-patterns (do not)

- Treating this as Supabase backup, PITR, or a Nest `BackupPanel` replacement
- Dumping another member’s private lists, drafts, preferences, marks, inbox, or calendar rows
- Returning `storage_path`, signed URLs, tokens, or snapshot contents to clients, audit context, or Edge logs
- Including binary Storage bytes or a restore/import path in V1
- Adding a §37 feature key for export
- Embedding `CRON_SECRET` in `cron.job` SQL, git, or docs
- Putting the service-role key or `CRON_SECRET` in Cloudflare (Workers Builds, Worker `vars`, or secrets)
- Putting Cloudflare Access in front of member login

### Production activation (2026-08-22)

- Linked history aligned through `20260822022800`; `supabase db push --linked --yes` applied **only** `20260822044105_family_data_export.sql`. No `--include-all`, no `migration repair`.
- Structural smokes: `phase1h_family_export.sql` (mutating fixture skipped on family fingerprint `0ea04851-1ad5-428d-9460-f086a4e94aa6`); `phase35c_identity_file_enforcement.sql` → `phase35c-structural-ok`. AAL **141**, `family_export_jobs` `service_only`, private JSON-only `family-exports` bucket, no authenticated Storage policies, client SELECT/DML revoked.
- Edge: `dispatch-family-exports` ACTIVE (`verify_jwt` false); `get-family-export-download` ACTIVE (`verify_jwt` true). Unauthorized dispatcher (no header / dummy bearer) and missing/invalid download JWTs return **401**. Verifier: FamilyTravelApp `scripts/verify_export_dispatch.sh`.
- Manual canary: patriarch identity + AAL2 claims requested job `5c0131e7-0729-4684-a640-1657b77e1333`; authorized dispatch POST **200** (`claimed=1 completed=1 failed=0`); artifact `schema_version=1`, 135909 bytes, SHA-256 present (64 hex); `authorize_family_export_download` returned filename/size/hash with no `storage_path` / signed URL; list RPC did not leak `storage_path`; audit `export.request` / `export.download` have job id + schema version only. Snapshot structural inspect: no `push_devices`, no token/`storage_path`/`public_url` keys.
- Cron: `dispatch-family-exports-5m` (`*/5 * * * *`, `pg_cron` + `pg_net`, 120s timeout). Command looks up Authorization headers from `dispatch-storage-cleanup-15m` at runtime and does **not** embed `CRON_SECRET`. Second canary `6536ace8-3fe7-47ad-b069-c072eaae0a82` queued 05:54:08Z, cron succeeded 05:55:00Z, completed 05:55:03Z. Function logs are `POST | 200|401` only — no snapshot rows.
- Advisors: security **171** (166 WARN / 5 INFO; +3 expected authenticated SECURITY DEFINER member RPCs — do not revoke). Performance **642** (436 WARN / 206 INFO; INFO unindexed FKs on requester person/user columns — same class as other empty FK INFO; do not add indexes this window).
- Parents: production still has **0** active parents. Do not create a fixture. Parent read-only remains proven by local SQL; physical parent case is **unavailable**.
- 24-hour expiry / Storage deletion: local expire proofs remain authoritative during this window; follow up 2026-08-23 on the completed canaries.
- Hosting evidence (2026-08-22): **Workers Static Assets**, not Pages. Origin `https://familytravelsite.lmisael0721.workers.dev` (Worker `familytravelsite`, account `528cc99066620a6cf44b66ce8aff3a13`, Worker id `4b0b92f68ddc4220ba00b98d8f160bf7`). Git-connected private GitHub `Misael-L/FamilyTravelSite`, production branch `main`, Node 22, build `npm run build:web`, deploy `npx wrangler deploy`, preview/non-production branch builds **off**. Build vars: `VITE_DATA_PLANE=supabase`, `VITE_SUPABASE_URL` (plain), anon key (**encrypted**). No Mapbox build var (live bundle has no `pk.ey` token — skip Mapbox origin restriction). No `CRON_SECRET` / service-role, no runtime Worker vars, no Worker `main` / bindings / Pages Functions. Cloudflare Access **off** (Zero Trust not set up). Live Git deploy version `9b23c2dd-fb18-4744-b122-368f2b113761` (Workers Build `3a904241-f87a-4bb1-bd7f-7c7c764125ca` on `61e0437`, Node 22.23.2, `npm run build:web` + `npx wrangler deploy`, success). Previous healthy Direct Upload `4de80700-1033-47f8-9dc8-c4ea6f24c281`. Metrics: asset-only (128 asset requests / 0 4xx / 0 5xx in the first hour; Worker invocations remain unused). SPA fallback: `/`, `/admin`, UUID trip path, `/reset-password`, and `/api/health` all return `text/html` 200; `/admin` and UUID trip paths client-route to `/login?redirect=…`. `/sw.js` and `/manifest.webmanifest` 200; service worker controls the origin. Live bundle `assets/client-CV0fmqa_.js` includes the production Supabase host and does **not** include `service_role` or `CRON_SECRET`. Auth Site URL cut over from `http://localhost:3000` (empty allow-list) to the workers.dev origin; allow-list now has only `http://localhost:5173/**` and `https://familytravelsite.lmisael0721.workers.dev/**` (no prior extra URLs existed to preserve). Recovery `redirectTo` remains `window.location.origin + '/reset-password'`. Signed-in AAL2 / Admin / §38 export **from this origin** still needs a patriarch session; backend export canaries above stay authoritative.
- Rollback is non-destructive: hide the Export tab / stop web exposure first, pause new canaries, drain artifacts, then unschedule `dispatch-family-exports-5m`. Leave the additive table/RPCs/migration in place. Do not drop schema or open the bucket. Hosting rollback is independent: `npx wrangler rollback --name familytravelsite` to `4de80700-1033-47f8-9dc8-c4ea6f24c281`, or disable `workers.dev`; revert Auth Site URL to `http://localhost:3000` and drop the workers.dev allow-list entry if needed. Leave the live §38 backend untouched.

### Checklist

- [x] §38 intent locked in this document and `admin-governance.md` / `schema-design.md` / DBML
- [x] Additive jobs table + private bucket + RPCs + AAL/RLS + SQL smokes
- [x] Edge dispatch + authorized download
- [x] Web Admin Export panel, adapter, EN/es-419, capability vocabulary
- [x] iOS capability constant/outcome test only
- [x] Local verify
- [x] Production activation (migration, functions, cron, backend canaries, Workers Static Assets origin + Auth Site URL)

---

## 39. Production invitation readiness

**Status:** Locked. Invitations remain **blocked** until every mandatory gate below is recorded as pass (or explicitly unavailable with a documented exception that is not a mandatory gate).  
**Canonical brief:** this section. Sibling mirror: FamilyTravelApp [`docs/admin-governance.md`](../../FamilyTravelApp/docs/admin-governance.md) §35 residual device table + later phases.  
**iOS blast radius:** none expected. **No migration, no RLS, no RPC, no AAL change.** W0–W9 and Phase 1A–1H stay closed.

This is the release-hardening gate before inviting family members onto the live Workers origin. It does not reopen Explore, Collections, Vacay, or identity-enforcement contracts.

### Locked intent

- Mechanism: a **sanitized public corresponding-source mirror/tag** of the exact tracked production commit (`git archive`-style snapshot). Not a downloadable private zip, not “docs only / invitations blocked,” and not the private GitHub development repo as the public offer.
- Invitations stay blocked until **all three** mandatory clusters pass:
  1. **Source access** — public mirror/tag exists, login + Help/About expose “Source code (AGPL-3.0)” before authentication, clean clone builds with Node 22 + `npm run build:web`, secret scan clean.
  2. **Browser / device assurance** — patriarch web + shipped iOS MFA, recovery, session, private-file upload, short-lived trip-file URLs, Admin purge visibility.
  3. **Export + hosting** — live-origin §38 request/list/download at AAL2, 24-hour artifact expiry with Storage deletion, SPA deep links / PWA / Auth allow-list / no Worker secrets.
- Parent-only physical cases are **unavailable** while production has 0 active parents. Do not create a parent fixture. Local SQL remains the parent proof.
- Unexpected AAL2 denial, bootstrap loop, catalog restriction, or private-upload regression is a **stop**. Use the already-documented §35.1 rollback path only. Do not improvise schema.

### Mandatory pass criteria

| Gate | Pass | Fail / leave open |
|------|------|-------------------|
| Public source mirror/tag | Public URL + tag match the live tracked commit; `LICENSE`, `NOTICE.md`, lockfiles, source, build scripts, `wrangler.jsonc`, and install/build instructions present | Private-only repo, missing tag, or archive includes `.env*` / `.wrangler` / credentials / `dist/` / untracked `.cursor/plans` |
| Login + Help/About source link | Prominent AGPL link on the public login surface (no session) and on Help/About; EN + `es` (Family es-419 copy) | Link missing before auth, or only visible after sign-in |
| Clean corresponding-source build | Clone public tag → `npm ci` → `npm run build:web` on Node 22 | Build fails, or extra undocumented env is required |
| Secret scan | Tracked/public artifacts + built client contain no `service_role`, `CRON_SECRET`, private env files, or family data | Any hit |
| Patriarch web assurance | Live origin: sign-in, TOTP, session restore, Admin, sign-out-other-sessions, recovery to `/reset-password`, return to dashboard | Any unexpected AAL2 / bootstrap / catalog / upload regression |
| Patriarch iOS assurance | Shipped build: TOTP or restored-session biometrics; `familytravel://reset-password` | Same stop conditions |
| Private-file assurance | Avatar, list-cover, and trip-file upload/finalize; trip-file URLs short-lived, refresh on open, not persisted; Admin trash/purge/cleanup visible | Signed URL persisted; finalize/purge regression |
| Live-origin export | AAL2 request, list, download, validate; UI exposes no `storage_path` and does not persist signed URLs | Path leak, persisted URL, or download of another member’s private rows |
| 24-hour export expiry | After `expires_at`: job `expired`, private Storage object deleted, no orphan artifact | Job still `completed` with object after expiry, or orphan in `family-exports` |
| Hosting boundaries | SPA deep links (`/admin`, UUID trip, `/reset-password`); SW control/update; Auth allow-list = localhost:5173 + workers.dev origin; successful Workers Build; no runtime Worker secrets/bindings; Cloudflare Access off | Secrets in Cloudflare, Access in front of login, or broken SPA fallback |

Parent physical MFA/export inspection is **not** a mandatory gate while parent count is 0; record it as **unavailable**.

### Evidence fields (required on the dated log)

Record every close-out with:

- Date (UTC)
- Private production commit (full SHA)
- Workers Build UUID + live Worker version (if distinct)
- Public source tag + URL
- Node version used for the public clone build
- Build command (`npm run build:web`)
- Export job IDs checked (request/list/download and expiry)
- Browser results (patriarch)
- iOS results (patriarch)
- Parent-only case: **unavailable** (0 active parents) or dated pass
- Invitation decision: **ready** only if every mandatory gate is pass; otherwise **blocked** with the open gate named

### Rollback / stop triggers

| Trigger | Action |
|---------|--------|
| Unexpected AAL2 denial, bootstrap loop, catalog restriction, private-upload regression, cleanup failure, coverage mismatch | Stop invitations. Roll back with FamilyTravelApp `gated-migrations/rollback_family_identity_file_enforcement.sql` only. Do not apply `20260821140200`. Do not invent a third SQL path. |
| Hosting secret leak (`CRON_SECRET`, service-role, or runtime Worker bindings) | `npx wrangler rollback --name familytravelsite` to `4de80700-1033-47f8-9dc8-c4ea6f24c281` (or the last known-good Git version). Rotate the leaked secret in Supabase. Do not leave the origin serving the leaked build. |
| Corresponding-source leak (private env, family data, service-role) | Take the public mirror private or delete the leaking tag, rotate, republish a clean archive, update the in-app URL if the host changes. |
| Export expiry failure after 24h | Hide the Admin Export tab, pause new canaries, inspect `dispatch-family-exports` expire+delete. Leave additive schema in place. |

### Corresponding-source publication

- Repeatable script: [`scripts/publish-corresponding-source.sh`](../scripts/publish-corresponding-source.sh). Snapshot via `git archive` of a **tracked** commit only.
- Never copy `.env*`, `.wrangler/`, untracked `.cursor/plans`, credentials, `dist/`, or local artifacts into the public tree.
- Preserve `LICENSE`, `NOTICE.md`, package lockfiles, source, build scripts, `wrangler.jsonc`, and install/build instructions (`SOURCE.md`, root README Family deploy row).
- Public host: `https://github.com/Misael-L/familytravelsite-source` (sanitized mirror; the development repo `Misael-L/FamilyTravelSite` stays private).
- In-app URL constant: [`client/src/legal/sourceOffer.ts`](../client/src/legal/sourceOffer.ts). Login (public) + Help + Settings About.
- Web locale `es` carries Family **es-419** Spanish copy. Do not add a second router or a Next.js host for the offer.

### Anti-patterns (do not)

- Send family invitations while any mandatory gate is open
- Treat the private GitHub repo, an untracked zip, or this locks file as the AGPL corresponding-source offer
- Copy `.env.local`, `.wrangler`, service-role, or `CRON_SECRET` into the public mirror or the Worker
- Create a production parent fixture to close the parent-only row
- Reopen W0–W9 or Phase 1A–1H locks, or change shared schema, to “make invitations easier”
- Put Cloudflare Access in front of member login
- Persist signed URLs or show `storage_path` in Admin Export

### Dated evidence log

See the latest block below. Older rows stay for audit. Invitation ready **only** when the latest block says so.

#### 2026-08-22 (implementation recorded; invitations **blocked**)

| Field | Value |
|-------|--------|
| Date (UTC) | 2026-08-22 ~23:20Z |
| Live production commit | `870d246e245dcb05416ab2ca847af99bddcdb914` (still what Workers is serving) |
| Local §39 commit (not pushed) | `9cb7d482656add5c5ce10dc30710eb930a18eca1` |
| Workers Build (live) | `857d0478-20f6-4797-a236-48a72820a7de` on `870d246`; live version `dad974af-14f5-4bf8-9a89-7f6b53e014e9` (2026-08-22 21:54Z). Rollback remains `4de80700-1033-47f8-9dc8-c4ea6f24c281`. |
| Public source tag / URL | **open.** Snapshot `source-20260822-9cb7d48` archived + secret-scanned + `npm ci` / `npm run build:web` (Node v22.13.0) + dist scan clean. Creating/pushing `Misael-L/familytravelsite-source` was not completed (GitHub public-repo create and `origin/main` push not executed). |
| Node / build | Node 22; `npm run build:web`. Client `tsc --noEmit` pass. Vitest: LoginPage + AboutTab + SourceCodeLink 42 passed. |
| Export jobs | `5c0131e7-0729-4684-a640-1657b77e1333` and `6536ace8-3fe7-47ad-b069-c072eaae0a82` still `completed`, objects present, `expires_at` 2026-08-23 05:49:20Z / 05:54:08Z (`past_expiry=false` at 22:38Z and again at ~23:13Z). |
| Live-origin export UI | AAL2 patriarch Admin Export listed both Ready jobs; copy states 24h expiry and ~2-minute download links; **no `storage_path`**. Download clicked (buttons disabled then restored); UI still showed Ready with no persisted signed URL. New request not issued. |
| Hosting recheck | `/`, `/login`, `/admin`, UUID trip, `/reset-password`, `/api/health` → `text/html` 200; `/sw.js` `text/javascript` 200; `/manifest.webmanifest` 200. Live `/login` paints Sign In + Forgot password (source link not live until `9cb7d48` deploys). `/reset-password` paints reset form. Restored session reaches Admin. Main bundle `index-BQtJm-vw.js`: `service_role` / `CRON_SECRET` absent. No runtime Worker bindings. Cloudflare Access remains off. |
| Browser (patriarch) | Restored AAL2 session; Admin Users/Settings/Export. Admin Settings: patriarch **Linked** + authenticator **Enrolled**; trash 0 / cleanup 0 / dead letters 0; signed-URL policy copy visible. Account: “2FA is enabled”; **Sign out other sessions** control present (**not clicked** — would revoke other devices). Fresh TOTP challenge **not** re-run. Avatar / list-cover / trip-file finalize **not** exercised (0 trip files; avoid mutating production). |
| iOS | **unconfirmed** (no shipped-device session in this pass). `familytravel://reset-password` not physically opened. |
| Parent-only case | **unavailable** (0 active parents). Do not create a fixture. |
| Invitation decision | **blocked** — open gates: public source mirror/tag, push/deploy of `9cb7d48` (live AGPL login link), 24-hour export expiry/deletion after 2026-08-23 05:54Z, iOS device MFA/recovery, web upload/finalize + trip-file URL refresh, fresh TOTP challenge. |

Operator close-out (after this log, no schema change):

1. Push FamilyTravelSite `9cb7d48` to `main` (Workers Builds). Confirm live `/login` shows Source code (AGPL-3.0).
2. Create public GitHub repo `Misael-L/familytravelsite-source` and run `WORKERS_BUILD_UUID=… bash scripts/publish-corresponding-source.sh --commit 9cb7d48 --verify-build --push`.
3. After 2026-08-23 05:54Z, confirm both canaries are `expired` and `family-exports` objects are gone.
4. On the shipped iPhone: TOTP or restored-session biometrics + `familytravel://reset-password`.
5. Optional mutating web pass: avatar / list-cover / trip-file finalize and short-lived URL refresh; optional fresh TOTP by signing out of this browser first.

### Checklist

- [x] §39 intent locked in this document and `admin-governance.md` (no schema change)
- [ ] Public sanitized corresponding-source mirror/tag for the live production commit
- [x] Login + Help/About AGPL link (EN + es) with pre-auth tests (in `9cb7d48`; not on live origin until that commit deploys)
- [x] Clean archive `npm ci` + `npm run build:web` + secret scan (`9cb7d48` extract; public clone still pending the mirror)
- [ ] Patriarch browser MFA / recovery / session / upload / signed-URL / purge on the live origin (session/Admin/purge/2FA enrolled **pass**; fresh TOTP + uploads **open**)
- [ ] Patriarch iOS TOTP or restored-session biometrics + `familytravel://reset-password`
- [x] Live-origin §38 list / download / no path leak (request of a new job not repeated; canaries used)
- [ ] 24-hour export expiry + Storage deletion on the canaries (follow-up after 2026-08-23 05:54Z)
- [x] Hosting recheck (deep links, SW, Auth allow-list from §38, Workers Build `857d0478…`, no runtime secrets)
- [x] Dated evidence complete; invitations marked ready **only** if every mandatory gate passed — **blocked**

