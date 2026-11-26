# Reproduce the bounded C3 audit

Use the unchanged accepted checkout, installed Node24/dependencies, Docker and strict marked local schema122 project. These are current-behavior witnesses and a temporary constraint model, not a migration or native/browser acceptance.

Run from the isolated checkout:

```sh
python3 docs/family-integration/packing-authoring-audit-tests/run_audit.py \
  --output /private/tmp/trek-u04c3-audit-rerun-UNIQUE \
  --fixture /private/tmp/trek-u04c2c3-sdk-fixtures-20261111/live-fixture.json
```

The output must be new and canonical under /private/tmp; the fixture stays private and is never copied/printed. If expired or absent, use the already approved strict122 synthetic fixture preparer, not production credentials. The database script uses its real Auth-issued AAL2 claims for local role witnesses; it does not claim fresh HTTP/MFA acceptance. All domain SQL is in a final ROLLBACK, with nine domain/audit table counts/hashes and strict schema/source checks before/after. The model creates temporary relations only. Native probes run outside application roots through the actual unchanged client config with mocked writer results. Output contains no private filled SQL or credential fixture. Full client/type/build/browser qualification is inherited from unchanged C2c3, not rerun by this command.
