// Exercise installed Vite/Rolldown together: a successful exit must also produce valid lazy-import JS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(
  new URL("../../client/package.json", import.meta.url),
);
test("installed Vite builds parseable nested lazy imports with their CSS dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "family-build-toolchain-"));
  try {
    await Promise.all(
      Object.entries({
        "index.html": '<script type="module" src="/main.js"></script>',
        "main.js":
          "globalThis.load = () => import('./outer.js').then(() => import('./inner.js'));",
        "outer.js": "import './outer.css'; globalThis.outer = 1;",
        "inner.js": "import './inner.css'; globalThis.inner = 2;",
        "outer.css": ".outer { color: red; }",
        "inner.css": ".inner { color: blue; }",
      }).map(([name, body]) => writeFile(path.join(root, name), body)),
    );
    const { build } = await import(require.resolve("vite"));
    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      build: { write: false },
    });
    const output = Array.isArray(result)
      ? result.flatMap((r) => r.output)
      : result.output;
    const chunks = output.filter((item) => item.type === "chunk");
    assert.ok(
      chunks.length >= 3,
      "The fixture must really split its lazy modules",
    );
    assert.ok(
      output.filter((item) => item.fileName.endsWith(".css")).length >= 2,
    );
    for (const chunk of chunks) {
      const checked = spawnSync(
        process.execPath,
        ["--input-type=module", "--check"],
        {
          input: chunk.code,
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(
        checked.status,
        0,
        `Invalid generated JavaScript: ${chunk.fileName}: ${checked.stderr}`,
      );
      assert.ok(
        !chunk.code.includes("__VITE_PRELOAD__"),
        "No unresolved preload marker",
      );
    }
    assert.ok(
      chunks.some((chunk) => chunk.code.includes("__vite__mapDeps")),
      "CSS preload mapping must remain enabled",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
