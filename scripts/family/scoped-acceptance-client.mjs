// Generate only for the maintenance acceptance artifact. This page has no app
// boot, service worker registration, or credential entry.
export function renderScopedAcceptancePage(apiOrigin) {
  const api = new URL(apiOrigin);
  if (api.protocol !== "https:" || api.origin !== apiOrigin || api.port) {
    throw new Error("An exact HTTPS API origin is required");
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="release-acceptance-api-origin" content="${api.origin}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${api.origin}; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>Release acceptance</title>
</head>
<body><main><h1>Release acceptance</h1><p>Controlled database verification during maintenance.</p></main></body>
</html>
`;
}

// Operator-only browser check. Invoke one command at a time from the verified
// acceptance page with a fresh, pre-authorized MFA session. Keep IDs for retries.
export async function verifyScopedSave(input) {
  const {
    expectedPage,
    apiOrigin,
    publishableKey,
    sessionToken,
    tripId,
    operationId,
    targetId,
    feature,
  } = input;
  const api = new URL(apiOrigin);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  if (
    location.href !== expectedPage ||
    location.protocol !== "https:" ||
    location.pathname !== "/release-acceptance.html" ||
    location.search ||
    location.hash ||
    document.querySelector('meta[name="release-acceptance-api-origin"]')
      ?.content !== api.origin ||
    api.protocol !== "https:" ||
    api.origin !== apiOrigin ||
    api.origin === location.origin ||
    ![tripId, operationId, targetId].every(
      (id) => typeof id === "string" && uuid.test(id),
    ) ||
    !/^sb_publishable_[\w-]+$/.test(publishableKey) ||
    !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(sessionToken)
  ) {
    throw new Error("Invalid acceptance binding");
  }

  let claims;
  try {
    const encoded = sessionToken.split(".")[1];
    claims = JSON.parse(
      atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
    );
  } catch {
    throw new Error("Invalid acceptance session");
  }
  if (
    claims?.role !== "authenticated" ||
    claims.aal !== "aal2" ||
    !uuid.test(claims.session_id)
  ) {
    throw new Error("An MFA user session is required");
  }

  const features = {
    task: { reader: "tasks", collection: "tasks", entity: "task", extras: {} },
    packing: {
      reader: "packing",
      collection: "items",
      entity: "item",
      extras: { quantity: 1 },
    },
  };
  if (!Object.hasOwn(features, feature))
    throw new Error("Unsupported acceptance feature");
  const { reader, collection, entity, extras } = features[feature];
  const name = "Release check " + operationId.slice(0, 8);
  async function call(fn, body) {
    const response = await fetch(api.origin + "/rest/v1/rpc/" + fn, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "family_release_smoke",
        apikey: publishableKey,
        Authorization: "Bearer " + sessionToken,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error("Scoped REST check returned HTTP " + response.status);
    return response.json();
  }

  const trip = { p_trip_id: tripId };
  const lookup = { ...trip, p_operation_id: operationId };
  const read = () => call("get_family_trip_" + reader + "_v1", trip);
  const receipt = () =>
    call("get_family_trip_" + feature + "_receipt_v1", lookup);
  const matches = (row) => row?.id === targetId && row.name === name;

  // An operation already recorded by the database stays a read-only receipt
  // check. In particular, never create a new operation after a lost reply.
  function checkReceipt(record) {
    if (record.trip_id !== tripId || record.operation_id !== operationId) {
      throw new Error("Unexpected receipt identity");
    }
  }
  const prior = await receipt();
  checkReceipt(prior);
  if (prior.status === "unknown") {
    const { scope } = await read();
    if (scope?.trip_id !== tripId) throw new Error("Unexpected trip scope");
    const result = await call("execute_family_trip_" + feature + "_v1", {
      ...lookup,
      p_scope: scope,
      p_action: "create",
      p_target_id: targetId,
      p_expected_revision: null,
      p_expected_collection_revision: null,
      p_values: { name, ...extras },
    });
    if (!matches(result[entity]))
      throw new Error("Saved entity identity mismatch");
  } else if (prior.status !== "committed" || !matches(prior.result?.[entity])) {
    throw new Error("Prior receipt identity mismatch");
  }

  const saved = await receipt();
  checkReceipt(saved);
  const refreshed = await read();
  if (
    saved.status !== "committed" ||
    !matches(saved.result?.[entity]) ||
    refreshed.scope?.trip_id !== tripId ||
    !refreshed[collection]?.some(matches)
  ) {
    throw new Error("Saved entity could not be verified");
  }
  return {
    feature,
    verified: true,
    reconciledPriorReceipt: prior.status === "committed",
  };
}
