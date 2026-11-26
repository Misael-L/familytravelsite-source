# Private GitHub development checkpoints

User clarification, 17 November 2026: completed development work must be backed up to the private GitHub repository. A local commit or local publication-copy fast-forward does not accomplish that. This authorization supersedes older packet-level “no push” instructions **for normal private development checkpoint pushes only**. Production promotion, deployments, public source-mirror publication, billing/settings/schema changes and force pushes are separate actions.

## Current website branch and checkout

- Private repository: Misael-L/FamilyTravelSite.
- Development branch: codex/trek-v5.1.4-family-reconcile.
- Browser link: https://github.com/Misael-L/FamilyTravelSite/tree/codex/trek-v5.1.4-family-reconcile.
- Active checkout: /Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4.
- Local publication checkout: /Users/Misael/Downloads/FamilyTravelSite-publication.
- Initial uploaded accepted source:5f30a5a8800f5a0847299b5c63f7e5823d8eeebe, including1136 newer commits beyond GitHub's older cede145a2e1963c59b667498e99e5056eaf65266 integration tip. The older tip is an ancestor; packet/upstream history is preserved.
- GitHub main was247b76ea94942e511a663f3f840c81821c556fc5 before and after branch creation. Neither main nor the older integration branch was changed.

The active checkout now has the real private GitHub origin and tracks the remote development branch. Its former local recovery-bundle remote is preserved separately as read-only. Both active/publication checkouts use the existing .githooks/pre-push guard, which refuses main and upstream release-tag pushes; upstream remains push-disabled. Do not redirect development checkpoints to the public familytravelsite-source mirror.

## Checkpoint procedure

After each coherent completed packet, preserve user changes and commit only its reviewed source/documentation. Carry out required scoped checks; a development checkpoint is not a declaration of release readiness. Keep local source/publication copies at the reviewed commit, perform a normal non-force push of the exact integration branch to private origin, and verify with a remote ref read that GitHub holds that exact commit. Report local commit and remote push distinctly. Do not claim uncommitted/ignored files or other repositories are backed up by this push.

Before a long follow-on packet, ensure the preceding completed checkpoint is already remote. Never silently leave hundreds of commits only on this Mac again. On any authentication, policy or non-fast-forward refusal, preserve the work, investigate the exact blocker and report the unprotected scope; do not overwrite remote work or bypass guards. No broad --all/--mirror/tag pushes.

The checked workflow triggers in this source are manual workflow_dispatch or reusable workflow_call, with no push-triggered repository workflow. integrationAutoDeploy remains false in the release declaration. This checkpoint does not invoke any release, Cloudflare, database, billing or public-mirror command. Preserve the source qualification/build pins and known release gates.

## Website-only scope and shared backend ownership

User clarification, 17 November 2026: focus on the website; iOS feature development remains deferred. Keep the present repository layout while completing the site. Treat supabase/ in FamilyTravelApp as shared backend infrastructure with one authoritative migration history and coordinated backend releases, independent of either frontend. The website's package declarations do not import the iOS app or its sibling checkout. A future neutral backend repository is optional organizational work, not a prerequisite or a new database project.

The website-required backend source is now committed and pushed to the existing private FamilyTravelApp repository on codex/site-backend-checkpoint-20261117 at8cc0fe3fdf85d2f577bf331b94967d977e0ac394. [Backend checkpoint](https://github.com/Misael-L/FamilyTravelApp/tree/codex/site-backend-checkpoint-20261117) and [ownership decision](https://github.com/Misael-L/FamilyTravelApp/blob/codex/site-backend-checkpoint-20261117/docs/backend-modernization/SHARED_BACKEND_OWNERSHIP.md).

The checkpoint captures911 selected source/planning files byte-for-byte:151 migrations;219 test/support files (42 SQL,158 Python,18 JSON,one shell);28 Edge Function code/readme files;two already-gated SQL files;one local config;508 planning/handoff Markdown files;two foundational backend documents. It adds checkpoint/ownership/review documentation. Its baseline iOS files are unchanged, and unrelated app working-copy edits were not copied. The original canonical working tree, branch and mixed Git index remain untouched; use the isolated checkout at /private/tmp/family-shared-backend-checkpoint-20261117/checkout for this backup branch, not a branch switch in the dirty original tree.

No source was relocated or redefined and no migrations/functions were applied/deployed. Raw historical evidence (roughly1 GB), database dumps/live rows, media, credentials, ignored ETL, caches and local database volumes are excluded. This is source preservation, not full database-plus-files recovery or fresh hosted compatibility acceptance. The RC scanner's113 reference-only findings were individually reviewed (105 official documentation references,five reserved SQL-test hosts,three existing public project identifiers); no credential-pattern finding was reported and no scanner/release policy was changed. The private checkpoint is not public release-scanner acceptance.

For future completed website packets, push source changes to the website branch and, when its canonical backend/schema/tests/plans change, update the selective private backend checkpoint too. Preserve the original mixed index and unrelated iOS work; never stage the entire canonical tree or copy raw evidence/media/credentials as source. Keep a single editable migration authority; a checkpoint branch does not create a second independent schema history.

## Continuation and preservation baseline

The latest packet is [Q126](core-collection-sharing-boundary-handoff.md), repository implementation `84e722d1c5a760bfca263f0c69fea3d568550eff`, local runtime build `b5164ce88b736dffe20ae5c46a22869e64187f96`. The view reads invitees through an online-only original-session-scoped repository; native markup/lifetime/locks/API/Family guards remain exact.167 cases pass (154 original,13 new), with0 failures/skips. Compiler/build/four source guards/artifact controls/scoped lint/format/layers/pairs/size pass. Strict remains636 with identical old file counts and0 scoped diagnostics. Offline has0 new bypasses and one stale146→145 removal proposal, unapplied pending separate approval. Duplication remains an unresolved older inventory. This is not quality/release or hosted/browser acceptance.

After verified push use /private/tmp/trek-core-collection-sharing-20261118/next-baseline-private.json and core-collection-sharing-boundary-handoff.md. Preserve3793 new generated outputs in their verified separate copy,14 unchanged raw CSS files, unchanged public pair/contexts and all older outputs/seals/logical archives. Canonical151 migrations/370 sources/mixed index/README, other checkouts, backups/media/ignored ETL remain exact. Shared backend remains8cc0fe3f; iOS deferred. No main/production/preview/hosted release.

## Parallel coordination setup — 18 November 2026

The application checkpoint remains Q126; documentation/environment preparation introduces no runtime or baseline repair. Follow [the two-lane ownership plan](parallel/README.md) and [Coordinator A queue](parallel/coordinator-queue.md). Worker B uses its own linked checkout and private branch codex/trek-v5.1.4-test-types-worker-b-20261118. Its moving head is authorized peer progress, not a frozen other-checkout preservation invariant. It may edit only its assigned tests and own reports/status. Only A changes shared source/release/preservation records and integrates reviewed commits. Heavy checks use the shared lease. Raw environment manifests and setup receipts remain under /private/tmp/family-site-parallel-20261118; no production settings, schema, billing or deployment action is authorized.

On 18 November 2026, Coordinator A integrated Worker B’s reviewed PB-01 typing change at `2938ec5ef1d97d2b790be57b95fba68eea813451` and recorded the approved offline exemption removal at `0ac7acb1f5d074a85047e3b03b45b0ec3704b1b8`. The combined tree passed 13 focused tests and four source checks. Offline passed from both command directories and strict diagnostics dropped from 636 to 635. The [coordinator status](parallel/coordinator-status.json) records both source commits and the worker report commit.

PA-01 qualifies the stored packing-group label repair at `50ef4ddfc9f0e4725e540d358a8daf638d27d5f5`. The local build is bound to `67d4741b25e0086efa792207f71b1cf8ab1cd201`. All 136 focused tests, four source checks and the bound artifact scan pass. The strict diagnostic count fell from 635 to 634. The [coordinator status](parallel/coordinator-status.json) records the checks and next packet.

PA-02 integrates the test-only PB-02 and PB-03 changes at `4becf2fec2f4b6677aea4988de86c5c0b779d047` and `74475c13eb1c404628a1ada6eb41d29174c899b6`. All 77 existing worker regression cases and four source checks pass. The strict diagnostic count fell from 634 to 632. The [currency catalog dependency review](parallel/duplication-currency-review.md) includes a separate tested proposal.

The currency catalog consolidation at `cff3356b33b9cf9a4adf2852cc8dfcc52b5b1c2f` passes 142 focused tests, four source checks and a source-bound browser and artifact comparison at `012d3bbff61e1ed79fa470864c84f5ecbaa89549`. It removes 374 duplicated lines with identical browser menu behavior and no new strict diagnostics. [Verification](parallel/duplication-currency-review.md#implementation-result).

The native trip share and invite link type repair at `2a408a39fead18267a3eedd50aa80a629bf78a92` passes 222 focused cases before and after. Both compilers produce identical JavaScript, and the strict count drops from 632 to 630. [Coordinator status](parallel/coordinator-status.json).

The planner arrangement civil-date repair at `000eb88453a3c665147637223f25fbde02e68f24` passes 302 focused tests and produces the verified local artifact at `6517b69627cbeb00b10ccfeb6c23f256e469df6e`. The strict count drops from 630 to 628. [Coordinator status](parallel/coordinator-status.json).

The native booking edit capture at `dab10d7f7a72899f99d262100e2c39826e7b04f4` passes 289 focused tests and produces a verified local artifact at `046fbf73b5c3a1e6a6530ca0096368ee0389531c`. The strict count falls from 628 to 627. [Coordinator status](parallel/coordinator-status.json).

The planner creation context fix at `7c8e1ae93f3185f64143842fa90157e82fe2fbed` passes 413 focused tests and produces a verified local artifact at `1213f506cf1c13a1916f7ae587087763bb13b3e2`. The strict count falls from 627 to 626. [Coordinator status](parallel/coordinator-status.json).

The offline trip startup cleanup at `f16dd4cdac11cf93b6b2229ea00464dee4edcc52` passes 191 focused tests and produces a verified local artifact at `ff5d6ba4faf1cbf6db89bdf1ada01267d09b2450`. The strict count falls from 626 to 625. [Coordinator status](parallel/coordinator-status.json).

The packing bag Trash restore at `533994331e724044d32d6bbe41a8368a35606e96` passes 654 focused tests and produces a verified local artifact at `b2dc3f8ab23a0c46c326715d7b96d9a733643c6b`. The strict count falls from 625 to 623. [Coordinator status](parallel/coordinator-status.json).

The native lodging identity fix at `e8f21fddd0f2078737a9d9a15d633869df996162` passes 440 focused tests and produces a verified local artifact at `06bde1bebce7e4e570591925e5a883db459a3425`. The strict count falls from 623 to 621. [Coordinator status](parallel/coordinator-status.json).

The packing terminal recovery guard at `099c94e35718b442fab8a33f0690d3580abc0ef4` passes 685 focused tests and produces a verified local artifact at `c0e91e0c8aa19daab4c43b5300cbfe9442c90bbc`. The strict count falls from 621 to 593. [Coordinator status](parallel/coordinator-status.json).

The packing receipt fixture correction at `39cf839fb2cc6f98cf4ba6cfea2ee816211e0a58` passes 360 focused tests before and after with a verified local artifact at `dce3c7f128bc4049489ecb875a439ef1215f4444`. The strict count falls from 593 to 587. [Coordinator status](parallel/coordinator-status.json).

The packing export fixture correction at `3679c0570e438a2982c69bdcce0293848e4aa891` passes 198 focused tests and produces a verified local artifact at `e3a8f3ef561292f2824c0e5a20bc996f4e132780`. The strict count falls from 587 to 586. [Coordinator status](parallel/coordinator-status.json).

The packing recovery mock types at `9072794f9fbb2b475f6a0b49900bc223678a7af4` pass 319 focused tests before and after and produce a verified local artifact at `f8cb4d477dbaf4c4c8b0639051e88f832fe2802d`. The strict count falls from 586 to 582. [Coordinator status](parallel/coordinator-status.json).

The queue retirement fixture at `b81196c3b1cdcea9ba279d1641d98da650a10534` passes 247 focused tests and produces a verified local artifact at `827074c94d213da41881b32c684fc5137cb3fdf8`. The strict count falls from 582 to 581. [Coordinator status](parallel/coordinator-status.json).

The public image lease fixture at `57ec84b59e812806dab0da1ad2e46e5b258c7b9d` passes 240 focused tests and produces a verified local artifact at `862a621bdf843e97f25f784e8f68787a9b8b5b99`. The strict count falls from 581 to 579. [Coordinator status](parallel/coordinator-status.json).

The public image projection fixtures at `43f7ba8925a0df70adee2fe74e6da5d5d317af8d` pass 242 focused tests and produce a verified local artifact at `2c8b26b4d3fe93130db39108c247c118bd6325ab`. The strict count falls from 579 to 578. [Coordinator status](parallel/coordinator-status.json).

The release observer fixtures at `281b50f29b0290b8f8dd40a07e459d05bdcceed0` pass 107 focused tests and produce a verified local artifact at `c194d409cab2a7373ca4843aa8c5f3a49a043d31`. The strict count falls from 578 to 575. [Coordinator status](parallel/coordinator-status.json).

The startup reconnect fixtures at `1af9a083d4b9b0e2574736aef29299b7d41fa379` pass 88 focused tests and produce a verified local artifact at `6c80cf2ee2551437ee1b3139d5409c35c18057a2`. The strict count falls from 575 to 574. [Coordinator status](parallel/coordinator-status.json).

The task writer fixtures at `17eb7b56a32df71625964f663b6ab6ba0e5cea2e` pass 223 focused tests and produce a verified local artifact at `11d2731224b5f5185b9e0e9d91d5e68739e65118`. The strict count falls from 574 to 572. [Coordinator status](parallel/coordinator-status.json).

The Trip access fixtures at `070cf40a2efdfe3e57dd0404178d0e5d05f1e0e3` pass 107 focused tests and produce a verified local artifact at `052e44ff6b744e64cac99f84cb49dd538a7bb658`. The strict count falls from 572 to 570. [Coordinator status](parallel/coordinator-status.json).

The catalog place identity checks at `e423c00c79558350d64e725dcdedd6ac84fc06f0` pass 129 focused tests and produce a verified local artifact at `eafe6e44d9d95d0d6ad755159825e59785f31123`. The strict count falls from 570 to 564. [Coordinator status](parallel/coordinator-status.json).

The visit form fixtures at `2aeba6d0f5619ef38b948383dfa170cd8ac2a64d` pass 190 focused tests and produce a verified local artifact at `aeeb5bee1258dd17e1faaa863c70b32984b41d78`. The strict count falls from 564 to 560. [Coordinator status](parallel/coordinator-status.json).

The shared planner cohort fixture at `1de686336f76f4f976630c908f2f007e31305ddf` passes 195 focused tests and produces a verified local artifact at `3d05468302e25a6bfe205ed5c2e1fd530075c209`. The strict count falls from 560 to 553. [Coordinator status](parallel/coordinator-status.json).

The Collection Trash fixture at `42ac87417519ce82f41c56173d57517440248ffc` passes 79 focused tests and produces a verified local artifact at `2ad6fb74d013d508e1f1981a217f367d8f06c4ca`. The strict count falls from 553 to 550. [Coordinator status](parallel/coordinator-status.json).

The location form fixture at `b54800058b1b5970492201254362ab8606fc80b8` passes 198 focused tests and produces a verified local artifact at `fcf7721625d5eb91c5d2942c2a75ea6b1f6caf28`. The strict count falls from 550 to 548. [Coordinator status](parallel/coordinator-status.json).

The Collection read fixture at `f7dfe8345df7f76064a9642ffc017b409dc41491` passes 109 focused tests and produces a verified local artifact at `947a1fb28cdc6bf340577f64fac40eee3c5e6307`. The strict count falls from 548 to 545. [Coordinator status](parallel/coordinator-status.json).

The Packing Trash cursor checks at `598904d1dd8334b46efcd289116a85aae1d6d6b3` pass 128 focused tests and produce a verified local artifact at `adeb7a812b477d491a0ab7460ef5dde9d9c01ffc`. The strict count falls from 545 to 544. [Coordinator status](parallel/coordinator-status.json).

The Complete Trip v3 fixture at `1e604155eae3ea0ca542b74e4a740acff479de1f` passes 172 focused tests and produces a verified local artifact at `08a5542f43778270687ad3a2dea6764657e53564`. The strict count falls from 544 to 543. [Coordinator status](parallel/coordinator-status.json).

The queue offline transition checks at `5149fdf80044442cfe37c03fbf08bc4213025ec4` pass 86 focused tests and produce a verified local artifact at `e6657ba20fdca78d54b47ab273e1fa9ac06b1ad1`. The strict count falls from 543 to 542. [Coordinator status](parallel/coordinator-status.json).

The late direct write checks at `bc4c2e75e32b57f16f9a0ae833071fdac1cd7c75` pass 108 focused tests and produce a verified local artifact at `85f54e14422825e01e04fe102842841925cb7d1c`. The strict count falls from 542 to 541. [Coordinator status](parallel/coordinator-status.json).

The planner export tests at `e60eb2a2445c66dc499c5a0962438f35216fd138` pass 104 focused tests and produce a verified local artifact at `6627742cec1e5734273e8b69e2ba8330919f0e0d`. The strict count falls from 541 to 540. [Coordinator status](parallel/coordinator-status.json).

The private file preview fixture at `e60890e5513ccb27ce643605155a90cac2ab64c0` passes 193 focused tests and four source checks. Strict diagnostics fell from 540 to 537. The remaining project checks and a fresh source-bound build await sufficient disk space. [Coordinator status](parallel/coordinator-status.json).

Family list route guards at `71324aa06d244e0a84449d40f01a98812d6f8329` pass 565 focused tests. Strict diagnostics fell from 537 to 531, and the source-bound local build at `429468d8179f01ed2408e026ff85868f4bc233b8` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Planner transport tests at `550ec74f5e75f6bbb76154d9e94b657bbf5a57d5` pass 135 focused cases. Strict diagnostics fell from 531 to 530. The source-bound local build at `8dac2085dee78d020194d49822e69b3b86d6bcab` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Native lodging writer tests at `695d622e05c23a84c8f0d49c86f69b9b8dca6d4b` pass 332 focused cases. Strict diagnostics fell from 530 to 527. The source-bound local build at `5a1fbbb8c4bea58b4960119ac3d55cbbc38aa21a` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Background download tests at `712964b988fb920b247e0d5103ad401b20dd07f2` pass 214 focused cases. Strict diagnostics fell from 527 to 524. The existing source-bound local artifact at `5a1fbbb8c4bea58b4960119ac3d55cbbc38aa21a` was verified again. [Coordinator status](parallel/coordinator-status.json).

Assistant quota and cancellation tests at `2d398b47dd4e1aeff65b012a55524ef328198e34` pass 206 focused cases. Strict diagnostics fell from 524 to 522. The existing source-bound local artifact at `5a1fbbb8c4bea58b4960119ac3d55cbbc38aa21a` was verified again. [Coordinator status](parallel/coordinator-status.json).

Planner route checks at `0a8e64e2a1c9781bd04fb880dc74d97532f69a7f` pass 324 focused tests. Strict diagnostics fell from 522 to 520. The source-bound local build at `3138c0ca3d880aa76162b83a003fb4aacf97d5a9` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Private file-open checks at `050746cff096973a8836c6afe84dd0323dd687b7` pass 237 focused tests. Strict diagnostics fell from 520 to 519. The local build at `9a99c1f21` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Map contribution route checks at `2ce3f1840e6b8bb58ad4e135a4a0a0809a37c95f` pass 187 focused tests and four source checks. Full project checks and a fresh build remain pending local disk capacity. [Coordinator status](parallel/coordinator-status.json).

Weather request checks at `08cad01aca04c34a8057ce30a84040e109a69204` pass 120 focused tests and four source checks. Full project checks and a fresh build remain pending local disk capacity. [Coordinator status](parallel/coordinator-status.json).

Visit removal at `7268735c5447c56bdd88d3626cd9b05dc420e491` passes 404 focused tests. Strict diagnostics fell from 519 to 513. The cumulative local build at `c18026dbc` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Offline queue stop checks at `572c36eb69dd0daaa3f952d91d1c3448f6fe811c` pass 398 focused tests. Strict diagnostics fell from 513 to 512. The local build at `3de1ae5a4` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Trip editor reminder checks at `126f152407d3c2cc8571c78d12a85ad1293a1c96` pass 219 focused tests. Strict diagnostics fell from 512 to 511. The local build at `e62a84c0d` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Atlas country count checks at `98b8d86ce971a7c5e87d7652babce8570fd1c269` pass 282 focused tests. Strict diagnostics fell from 511 to 509. The local build at `a36283b4a` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Day reply cache checks at `0dc732fb9f6457cff3d30cd8537e826de3be4e22` pass 318 focused tests. Strict diagnostics fell from 509 to 506. The local build at `b73282cac` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Isolated HTTPS receipt checks at `9ca89741bcc1caeafb50a17f24011c6bc1217fcc` pass 199 focused tests. Strict diagnostics fell from 506 to 504. The local build at `e8d6c0112` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Public configuration fixtures at `b2f12e0ab58d3572499dd3e9eae753f1b0ac004a` pass 199 focused tests before and after. Strict diagnostics fell from 504 to 491. The local build at `0f4462765` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Translation catalog checks at `7b8355210cbfce1d7c31a947473543ba5ffdb6fa` pass 116 focused tests before and after. Strict diagnostics fell from 491 to 487. The local build at `f08a9e8e9` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shell recovery tests at `31cb19285cbc5cb369816a7b64a0af9065c55806` pass 130 focused cases before and after. Strict diagnostics fell from 487 to 485. The local build at `1994e2c26` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Native stay callback checks at `938dcd76ef167ba774926daab6e66be4a1cd8fcc` pass 319 local tests. Strict diagnostics fell from 485 to 483. The local build at `9830ef256` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Native stay writer refusal checks at `d2e5f2f9a9beb98a0d40e73bbf271ffc8688f83a` pass 358 local tests. Strict diagnostics fell from 483 to 482. The local build at `80251c473` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Packing recovery preparation checks at `6987f5a57e18bd081785b318d45e0a6a962d8f66` pass 481 local tests. Strict diagnostics fell from 482 to 481. The local build at `5712fa5af` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Native lodging update payload types at `d12b79f76df699670e131d3c33ac3e222f67ae5f` passed 240 local tests. Strict diagnostics fell from 481 to 467. The local build at `4aa8a0218` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Private upload and profile-photo types at `e68f5e3240d086b77c9837823830e8572e6420d5` passed 195 local tests. Strict diagnostics fell from 467 to 463. The local build at `5f745d13a` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Strict allowance reductions at `ccbdc0c3504eb53d030e7589fa0d752085f2f6f1` passed the original strict check and 10 checker tests. The allowance fell from 467 to 463. The local build at `0d64c8b58` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shared map style rules at `965a8fa5661c06a4070addb395632495716d8bbc` pass 194 map tests and the original strict check. The full duplication report fell by 26 lines across two files. The local build at `7f22ac31c` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shared Mapbox setup at `53f74eed69a0fac8239869e074e482d244cb592b` passes 230 local tests and strict. The full duplication report fell by 56 lines across two files. The local build at `bcc30893d` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shared transport duration at `67aa39edd7ece83e1b74fb8e773c2e0246a96dd2` passes 266 focused tests and strict. The full duplication report fell to 16,950 lines across 279 files. The local build at `aa7d688fe` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shared transport labels at `57e10d342201f6ded8236eb95956b54c91cff875` pass 266 local tests and strict. The full duplication report fell to 16,927 lines across 278 files. The local build at `d9a2bc4d4` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Shared transport waypoints and leg geometry at `8b7d339d808ece1d516b2a7c8b1ec1b6749c5aa0` passes 275 focused tests and strict. The full duplication report fell to 16,890 lines across 278 files. The local build at `529529216` passed artifact verification and produced identical CSS. [Coordinator status](parallel/coordinator-status.json).

Unused reservation stats badge retirement at `cbe9128cfb0382b868dfa889a4809f0249bf550d` passes 339 focused tests and strict. The full duplication report fell to 16,852 lines across 278 files. The local build at `2ee8518e6` passed artifact verification. All 3,789 other files matched the previous build byte for byte. Only the public config’s source commit changed. [Coordinator status](parallel/coordinator-status.json).

Unused reservation stats calculations retired at `792c20f56765434e47213ced56af78adafa6ba3d`. All 339 focused tests and strict passed. The duplication report still counts 16,852 lines across 278 files. The local build at `e8fddde50` passed artifact verification with identical stylesheets. JavaScript hashes changed. Of the 134 renamed JavaScript chunks paired by the manifest analysis, 89 matched after updating references to renamed chunks. [Coordinator status](parallel/coordinator-status.json).

Shared reservation map item assembly at `9393432885d560a15ac504216cf420eee2f3ccb1` passes 339 focused tests and strict. The full duplication report fell to 16,830 lines across 276 files. The local build at `1cf072c89` passed artifact verification. Stylesheets match the previous build. The emitted JavaScript chunk hashes changed. [Coordinator status](parallel/coordinator-status.json).

Shared OSRM route leg formatting at `9a2809ba68220cca6676cb5aacd8e7ddf5290ed8` passes 378 focused tests and strict. The full duplication report fell to 16,799 lines across 275 files. The local build at `fa8bbf6ed` passed artifact verification. Stylesheets match the previous build. The emitted JavaScript chunk hashes changed. [Coordinator status](parallel/coordinator-status.json).

Unused packing template button retired at `5bf6a0af88b91d1448df46c54310978fb41a6403`. All 463 focused tests and strict passed. The full duplication report fell to 16,725 lines across 273 files. The local build at `544fd6be1` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused packing panel header retired at `1ddb1feae158a089fd1c22218e63ed0176cbf8c6`. All 486 focused tests and strict passed. The full duplication report fell to 16,458 lines across 271 files. The local build at `f28bdef7d` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused packing bag modal and sidebar retired at `c843c6411b8fcb29f9158f69a4d32aed56096c26`. All 827 focused tests and strict passed. The full duplication report fell to 16,380 lines across 269 files. The local build at `254aa4c1a` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused packing bag card retired at `9a8af0e9ad9aa5a243e3e61962777933b78b222e`. All 827 focused tests and strict passed. The duplication report still counts 16,380 lines across 269 files. The local build at `859bc9090` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused planner address and airport pickers retired at `f6bd5dc596914c15192f6fa8a4e6a51a54e0e3f6`. All 563 focused tests and strict passed. The full duplication report fell to 16,120 lines across 267 files. The local build at `38e0cbe38` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused planner location picker retired at `e2fe5e26dd37b949e1768db41afd5a54483f46c0`. All 611 focused tests and strict passed. The full duplication report fell to 15,964 lines across 265 files. The local build at `e7f41fbc2` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused AirTrail import dialog retired at `e135b4719675e41d9ea09540f6ffffe26f55fa08`. All 411 focused tests and strict passed. The full duplication report fell to 15,802 lines across 263 files. The local build at `949fe669b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused booking costs section and request type retired at `568e778c4e7572c8c1aba6692b295e82b171e0e2`. All 472 focused tests and strict passed. The duplication report fell to 15,714 lines across 262 files. The local build at `bbe382090` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy place form and helpers retired at `329df7e9d0e11045f6b44e127b0453c75ff233dd`. All 694 focused tests and strict passed. The duplication report fell to 15,568 lines across 260 files. The local build at `bc8a5f1f0` passed artifact verification. The generated stylesheet drops six utilities from the retired form. The shipped markup and scripts contain zero occurrences of those utility tokens. The remaining CSS and the scripts match after resolving asset renames. The service worker references and integrity metadata match the new build. [Coordinator status](parallel/coordinator-status.json).

Unused legacy collection picker retired at `3070ba1231776865636cb769aa9f76817fd2448b`. All 515 focused tests and strict passed. The duplication report fell to 15,505 lines across 258 files. The local build at `05ebdf895` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Three unused legacy Collections page components retired at `58bf665c197df89b8f3f69247f37cc9951e1844e`. All 409 focused tests and strict passed. The duplication report fell to 15,271 lines across 252 files. The local build at `af887c046` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy Collections dialogs and hooks retired at `a976f5ce3f00a7230640b8ba5f8713cbbf80ec29`. All 412 focused tests and strict passed. The duplication report fell to 15,095 lines across 247 files. The local build at `2d09ac762` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy collection-save and sidebar modules retired at `8bdfba242c9c10c2dcb02bae3d76f36761b38aff`. All 898 focused tests and strict passed. The duplication report fell to 14,695 lines across 237 files. The local build at `ae72e46ed` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy planner import and category dialogs retired at `0f03b68ea57372dc0c47ad5ba48973f0800d2060`. All 424 client tests, 14 mocked track tests and strict passed. The duplication report fell to 14,181 lines across 235 files. The local build at `1e63d2b1c` passed artifact verification. The generated stylesheet dropped the unused `text-[#b45309]` rule from the legacy file-import dialog. The shipped markup and scripts contain zero occurrences of the utility. The remaining CSS matches byte for byte. The application JavaScript matches after resolving renamed assets. The service worker has equivalent local bindings and verified cache entries for the rebuilt files. [Coordinator status](parallel/coordinator-status.json).

Unused legacy ICS dialog and toolbar retired at `b8f7870224009cb05c812d0c02c9d533af30580c`. All 367 client tests, 12 mocked Family calendar tests and strict passed. The duplication report fell to 14,030 lines across 233 files. The local build at `27ca3a84e` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy day-reorder popup and trip warnings banner retired at `9bd93bd38bbc588ac7c630671c73e856e9ed6ccc`. All 536 focused tests and strict passed. The duplication report fell to 13,984 lines across 231 files. The local build at `109345bd0` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy transit modal and display helpers retired at `e5bf581cb2dc8611e11c41327996c933ef24fb4e`. All 732 focused tests and strict passed. The duplication report fell to 13,716 lines across 227 files. The local build at `12637477b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy booking-import draft converter retired at `645310b99c42a93db532ca48ea937a731d5b6060`. All 624 focused tests and strict passed. The duplication report fell to 13,669 lines across 225 files. The local build at `50ca4de8b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unreachable Family booking-import fallback removed at `60d17e92ba4b7e035a4ff86eb2aad767cfc428f3`. All 225 focused tests and strict passed. The duplication report has 13,669 lines across 225 files. The local build at `b89448594` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Unused legacy background widget and task store retired at `73e2b1843897e04fbda4364bdaf25b7f74cadec3`. All 190 focused tests and strict passed. The duplication report has 13,669 lines across 225 files. The local build at `c4fd112b4` passed artifact verification. The generated site matches byte for byte except for its source commit metadata. [Coordinator status](parallel/coordinator-status.json).

Four unused legacy day-plan files retired at `a9712de2d59c8c97fc84cffd7b42eff194d76583`. All 639 focused tests and strict passed. The duplication report has 13,558 lines across 221 files. The local build at `85d339c36` passed artifact verification. The generated stylesheet dropped two unused background utilities. The remaining stylesheet rules match, and the application JavaScript matches after resolving renamed asset references. The service worker cache entries and artifact integrity metadata match the rebuilt files. [Coordinator status](parallel/coordinator-status.json).

Family planner badge reuse at `8c369b0799e88ca3b605b241db688ed5423f9d61`. All 484 focused tests and five badge render comparisons passed with the retained buttons and menu. The local build at `17fc56501` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Unused legacy day-plan route connector retired at `f4af5e36bce7189d152947d40250a7811e2fd15c`. All 453 focused tests and strict passed. The duplication report has 13,512 lines across 220 files. The local build at `1604e6f57` passed artifact verification. Generated files match byte for byte except for the source commit in the public config. [Coordinator status](parallel/coordinator-status.json).

Family timeline detail callback reuse at `7911abd263fd19d7cf9289e91536032c3aa52238`. All 80 focused tests passed. The duplication report has 13,478 lines across 219 files. The local build at `59f62d6c2` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation file projection at `11688ea122100605c6358161f650da0f59684407`. All 84 focused tests passed. The duplication report has 13,440 lines across 217 files. The local build at `cd6e55965` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation attachment display at `bbc59a7a4c6de6ced9ce14754b6807438b273a4b`. All 86 focused tests and eight markup comparisons passed. The duplication report has 13,382 lines across 217 files. The local build at `4190ae0d5` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation expense display at `f842aa5d8d0aaa6963a173e6cee14e440df53f9d`. All 88 focused tests and twelve expense markup comparisons passed. The duplication report has 13,336 lines across 217 files. The local build at `d28e6230a` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation confirmation code display at `3bca405ba1ce1b7ca32ea232a598153b532d9041`. All 90 focused tests and both confirmation markup comparisons passed. The duplication report has 13,263 lines across 217 files. The local build at `12eae3157` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation dialog focus behavior at `734a14650f4de543c6f531c1ba83e487266a5f84`. All 94 focused tests passed. The duplication report has 13,192 lines across 217 files. The local build at `0fdb58a3a` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation detail panel at `dbe92e99abf92be05fd7e6d0c3bf36ba4bc706a8`. Headless Chrome verified the pointer dismissal fix in both dialogs and all 96 focused tests passed. The duplication report has 13,150 lines across 217 files. The local build at `c7522a48c` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation action footer at `84058bfd6d574659d453a319812cc1767eba658b`. All 98 focused tests and 16 footer comparisons passed. The duplication report has 13,112 lines across 217 files. The local build at `bccb94540` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation detail header at `ae92b0b24270b2f985aeb0b8ba135eb019e06a01`. All 100 focused tests and four header comparisons passed. The duplication report has 13,090 lines across 217 files. The local build at `7f5f6d154` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation date and notes display at `e3000aa2950badf0b852e6a9f19d130cff31845a`. All 102 focused tests and 20 body comparisons passed. The duplication report has 13,046 lines across 215 files. The local build at `67224a903` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Shared Family reservation detail sections at `32d20ae6934fc9ffda976301a0b2f87c7b80936f`. All 102 focused tests and 20 body comparisons passed. The duplication report has 13,046 lines across 215 files. The local build at `a17bf0400` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Family reservation list review at source ba84ff2fca575b45bf0752d813e4f613eb6f935a. All 156 focused tests across 10 files and four source checks passed. This checkpoint records the reachability review and retains the prior qualified build. [Coordinator status](parallel/coordinator-status.json).

Legacy reservation list retirement audit at source 71d37b34d3e6da3b8790551b1bc8c7114b4c5867. All 571 checks and four source checks passed. The audit records the endpoint-only date gap and keeps all legacy tests. [Coverage and repair plan](parallel/legacy-reservation-retirement-audit.md).

Family transport departure ordering at `603fdfd768a7baade1e5240269aca2251953fee4`. All 601 focused tests and four source checks passed. The local build at `6e78f3e7a` passed artifact checks and emitted byte-identical stylesheets. [Coordinator status](parallel/coordinator-status.json).

Phone reservation attachment feedback at `739fcae0cbcb7c35de96466ee03d19205fd0580f`. All 373 focused tests and four source checks passed. The local build at `d0f76901a` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Phone editor attachment feedback at `6844d7be20724f172cd3f9f75152dc33c7f02ea9`. All 262 focused tests and four source checks passed. The local build at `d68a60a7b` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Native reservation focus audit at source `760f2582c191b524abf923589ea74b96ce6c168e`. Seven component probes and the Chromium fixture reproduced the desktop Delete keyboard gap. All 544 reservation regressions and four source checks passed. [Focus audit](parallel/legacy-reservation-retirement-audit.md#native-reservation-focus-audit).

Reservation Delete focus repair at `7385908fa10fdd905b0a09ced5c92b570eecaf01`. All 570 focused tests and four source checks passed. Chromium verified the keyboard behavior and the local build at `52041fcd3` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Reservation list focus repair at `d8b31e64fbe47322c6b8e08c1cdf3c891d17968d`. All 582 focused tests and four source checks passed. The local build at `11dbef76e` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Phone reservation card Delete focus repair at `4336ccc47647d262613fd169b74d2ee45a035785`. All 609 focused tests and four source checks passed. The local build at `498197ad7` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Permanent reservation editor and Costs focus regressions at `de794cbc46ac6e35b0177c3a582804a5cb3d4dd8`. All 614 focused tests and four source checks passed. The source-bound build at `a6ea4a376` retained identical bundled JS and CSS. [Coordinator status](parallel/coordinator-status.json).

Trip files read and Retry repair at `6c7b9eedaa0de2d68c42c417342800fbeae59a70`. All 778 focused tests and four source checks passed. The local build at `04b9f41b4` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Reservation collapse preference coverage at `a7a2909a3ae516b3b052dc089d0c20377f82994c`. All 809 focused tests and four source checks passed. The local build at `72ddcfffc` retained identical bundled JS and CSS. [Coordinator status](parallel/coordinator-status.json).

Unused legacy transport creation request cleanup at `821a9b1f27d818874540e70f932559bd832ba8cf`. All 1016 focused tests and four source checks passed. The local build at `759bf351b` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).

Legacy Transports list retirement at `2c8c60b00502408999521952bc8940f4a11fb0ed`. All 1,069 retained tests and four source checks passed. The local build at `4c9e26ba3` passed artifact verification. [Coordinator status](parallel/coordinator-status.json).
