"""Reproduce U04-E actual-module witnesses against the unchanged qualified source.

Five passing witnesses intentionally document existing defects. They are not
post-repair success criteria. No hosted access or database operation occurs.
"""
from pathlib import Path
import argparse, json, os, shutil, subprocess, time

ROOT = Path(__file__).resolve().parents[3]
QUALIFIED = "b50fbdc2c267249f339ada5e37c340927ed27798"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
out = args.output.expanduser().resolve()
if out.parent != Path("/private/tmp") or not out.name.startswith("family-packing-capabilities-"):
    raise SystemExit("Choose a new /private/tmp/family-packing-capabilities-* directory.")
if out.exists():
    raise SystemExit("Output already exists; earlier evidence will not be overwritten.")
node = shutil.which("node")
if not node or not subprocess.check_output([node, "--version"], text=True).startswith("v24."):
    raise SystemExit("Put the installed Node24 on PATH; this runner installs nothing.")
manifest = json.loads((ROOT / "docs/family-integration/qualified-source.json").read_text())
if manifest["qualifiedCommit"] != QUALIFIED:
    raise SystemExit("This historical audit requires the accepted pre-repair qualified source.")
out.mkdir(mode=0o700)
with (out / "source-guard.log").open("w") as log:
    subprocess.run([node, "scripts/family/check-qualified-source.mjs"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
template = Path(__file__).with_name("capability-audit.template.tsx")
test = out / "capability-audit.test.tsx"
test.write_text(template.read_text().replace("__ROOT__", str(ROOT)))
config = out / "audit.config.mts"
config.write_text("import base from " + json.dumps(str(ROOT / "client/vitest.config.ts")) + ";\n" +
 "export default {...base,resolve:{...base.resolve,alias:[" +
 "{find:/^vitest$/,replacement:" + json.dumps(str(ROOT / "node_modules/vitest/dist/index.js")) + "}," +
 "{find:/^fake-indexeddb\\/auto$/,replacement:" + json.dumps(str(ROOT / "node_modules/fake-indexeddb/auto/index.js")) + "}," +
 "...(Array.isArray(base.resolve?.alias)?base.resolve.alias:Object.entries(base.resolve?.alias??{}).map(([find,replacement])=>({find,replacement})))],dedupe:['vitest','react','react-dom','@testing-library/react']}," +
 "test:{...base.test,root:" + json.dumps(str(ROOT / "client")) + ",include:[" + json.dumps(str(test)) + "],reporters:['default']}};\n")
command = [node, str(ROOT / "node_modules/vitest/vitest.mjs"), "run", "--config", str(config), "--maxWorkers=1", "--reporter=default", "--reporter=json", "--outputFile=" + str(out / "results.json")]
env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=8192"}
started = time.monotonic()
with (out / "tests.log").open("w") as log:
    result = subprocess.run(command, cwd=ROOT / "client", env=env, stdout=log, stderr=subprocess.STDOUT)
receipt = {"actual_exit": result.returncode, "seconds": round(time.monotonic() - started, 2), "qualified_runtime": QUALIFIED, "command": command, "database_or_hosted_operations": False}
if result.returncode == 0:
    data = json.loads((out / "results.json").read_text())
    assert data["numTotalTests"] == data["numPassedTests"] == 33
    receipt.update({"audit_witnesses": 33, "healthy_boundary_witnesses": 28, "reproduced_defect_witnesses": 5})
(out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
raise SystemExit(result.returncode)
