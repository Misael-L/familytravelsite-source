import primaryPolicy from "../../client/corePrimaryProfiles.json" with { type: "json" };
import { renderScopedAcceptancePage } from "./scoped-acceptance-client.mjs";

const acceptancePath = "/release-acceptance.html";
const fullCommit = /^[0-9a-f]{40}$/;
const privateResponse = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readBinding(request, env) {
  const origin = env.FAMILY_ACCEPTANCE_API_ORIGIN;
  const commit = env.FAMILY_ACCEPTANCE_SOURCE_COMMIT;
  if (
    typeof origin !== "string" ||
    !fullCommit.test(commit ?? "") ||
    (await sha256(origin)) !== primaryPolicy.originSha256
  ) {
    return null;
  }
  const receipt = await env.ASSETS.fetch(
    new URL("/family-public-config.json", request.url),
  );
  if (!receipt.ok) return null;
  const config = await receipt.json();
  if (
    config?.format !== "family.public-config.v1" ||
    config.sourceCommit !== commit ||
    config.writerProfile !== primaryPolicy.fallback ||
    config.pair?.policy !== "family-primary" ||
    config.pair.originSha256 !== primaryPolicy.originSha256
  ) {
    return null;
  }
  return { origin, commit };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== acceptancePath) return env.ASSETS.fetch(request);
    if (
      url.search ||
      (await sha256(url.origin)) !== primaryPolicy.previewSiteSha256
    ) {
      return new Response(null, { status: 404, headers: privateResponse });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { ...privateResponse, Allow: "GET, HEAD" },
      });
    }

    let binding;
    try {
      binding = await readBinding(request, env);
    } catch {
      return new Response(null, { status: 503, headers: privateResponse });
    }
    if (!binding)
      return new Response(null, { status: 503, headers: privateResponse });
    return new Response(
      request.method === "HEAD"
        ? null
        : renderScopedAcceptancePage(binding.origin),
      {
        headers: {
          ...privateResponse,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "frame-ancestors 'none'",
          "X-Family-Acceptance-Source": binding.commit,
        },
      },
    );
  },
};
