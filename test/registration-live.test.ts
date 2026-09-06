import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { PersistentBrowserDriver } from "../src/driver.js";
import type { RegisterMessage } from "../src/protocol.js";

const live = process.env.BROWSERDRIVER_REGISTRATION_LIVE_TEST === "1";

test("headed Chromium registration enforces approval, one POST, uncertainty, retry refusal, and redirect origin", { skip: !live }, async () => {
  const counts = { gets: 0, posts: 0, escaped: 0 };
  const escaped = createServer((_request, response) => {
    counts.escaped += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>escaped</title>");
  });
  const escapedOrigin = await listen(escaped);
  let indeterminate = false;
  let repeatPost = false;
  let unexpectedFrame = false;
  const application = createServer((request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/redirect")) {
      counts.gets += 1;
      response.writeHead(302, { location: request.url === "/redirect" ? "/redirect-stage" : `${escapedOrigin}/escaped` });
      response.end();
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/register")) {
      counts.gets += 1;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Register</title>
        <link rel="stylesheet" href="${escapedOrigin}/unapproved.css">
        ${unexpectedFrame ? '<iframe src="/redirect"></iframe>' : ''}
        <form method="post" action="/complete">
        <label>Identifier <input aria-label="Identifier" name="identifier"></label>
        <label>Password <input aria-label="Password" name="password" type="password"></label>
        <button type="submit">Register</button></form>`);
      return;
    }
    if (request.method === "POST" && request.url === "/complete") {
      counts.posts += 1;
      request.resume();
      request.on("end", () => {
        if (repeatPost) {
          response.writeHead(307, { location: "/complete" }).end();
          return;
        }
        if (indeterminate) {
          response.writeHead(500, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><title>Unavailable</title>");
        } else {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><title>Complete</title><div role=status>Created</div>");
        }
      });
      return;
    }
    response.writeHead(404).end();
  });
  const applicationOrigin = await listen(application);
  const previousIdentifier = process.env.BROWSERDRIVER_LIVE_IDENTIFIER;
  const previousPassword = process.env.BROWSERDRIVER_LIVE_PASSWORD;
  process.env.BROWSERDRIVER_LIVE_IDENTIFIER = "loopback-test@example.invalid";
  process.env.BROWSERDRIVER_LIVE_PASSWORD = "not-retained";
  const messages: Array<Record<string, unknown>> = [];
  let checkpointMode: "continue" | "deny" | "timeout" = "continue";
  const source = {
    next: async (signal?: AbortSignal): Promise<IteratorResult<string>> => {
      if (checkpointMode === "timeout") {
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
      const checkpoint = messages.findLast((message) => message.type === "registration_checkpoint")!;
      return { done: false, value: JSON.stringify({
        version: "udon.browser-driver.v4", type: "registration_checkpoint_response",
        requestId: checkpoint.requestId, checkpointId: checkpoint.checkpointId, decision: checkpointMode,
      }) };
    },
  };
  const driver = new PersistentBrowserDriver(source, (message) => messages.push(message as Record<string, unknown>), {
    headed: true, registrationCheckpointTimeoutMs: 50,
  });
  try {
    checkpointMode = "continue";
    await driver.register(registrationRequest(applicationOrigin, "success", `sha256:${"1".repeat(64)}`));
    assert.equal(result(messages, "success").result, "success", JSON.stringify(messages));
    assert.equal(counts.posts, 1);
    assert.equal(counts.escaped, 0);
    assert.deepEqual(messages.filter((message) => message.type === "registration_checkpoint" && message.requestId === "success")
      .map((message) => message.kind), ["consent", "submit_approval"]);

    checkpointMode = "deny";
    await driver.register(registrationRequest(applicationOrigin, "denied", `sha256:${"2".repeat(64)}`));
    assert.equal(result(messages, "denied").failureCode, "registration_checkpoint_denied");
    assert.equal(counts.posts, 1);

    checkpointMode = "timeout";
    await driver.register(registrationRequest(applicationOrigin, "timeout", `sha256:${"3".repeat(64)}`));
    assert.equal(result(messages, "timeout").failureCode, "registration_checkpoint_timeout");
    assert.equal(counts.posts, 1);

    checkpointMode = "continue";
    indeterminate = true;
    const beforeIndeterminate = counts.gets;
    const indeterminateRequest = registrationRequest(applicationOrigin, "indeterminate", `sha256:${"4".repeat(64)}`);
    indeterminateRequest.profile.flows.create!.success.path = "/expected-after-submit";
    await driver.register(indeterminateRequest);
    assert.equal(result(messages, "indeterminate").failureCode, "registration_indeterminate");
    assert.equal(counts.posts, 2);
    await driver.register(registrationRequest(applicationOrigin, "indeterminate_retry", `sha256:${"4".repeat(64)}`, "register_indeterminate"));
    assert.equal(result(messages, "indeterminate_retry").failureCode, "registration_indeterminate");
    assert.equal(counts.posts, 2);
    assert.equal(counts.gets, beforeIndeterminate + 1);

    indeterminate = false;
    const redirectRequest = registrationRequest(applicationOrigin, "redirect", `sha256:${"5".repeat(64)}`);
    redirectRequest.profile.flows.create!.sequence[0] = { navigate: `${applicationOrigin}/redirect` };
    await driver.register(redirectRequest);
    assert.equal(result(messages, "redirect").failureCode, "origin_rejected");
    assert.equal(counts.escaped, 0);
    assert.equal((driver as unknown as { sessions: Map<string, unknown> }).sessions.size, 0);

    repeatPost = true;
    await driver.register(registrationRequest(applicationOrigin, "repeat_post", `sha256:${"6".repeat(64)}`));
    assert.equal(result(messages, "repeat_post").failureCode, "registration_indeterminate");
    assert.equal(counts.posts, 3, "307 must not transmit a second POST");

    repeatPost = false;
    unexpectedFrame = true;
    await driver.register(registrationRequest(applicationOrigin, "unexpected_frame", `sha256:${"7".repeat(64)}`));
    assert.equal(result(messages, "unexpected_frame").failureCode, "invalid_response");
    assert.equal(counts.posts, 3);
    assert.equal(counts.escaped, 0);

    const wire = JSON.stringify(messages);
    assert.equal(wire.includes("loopback-test@example.invalid"), false);
    assert.equal(wire.includes("not-retained"), false);
    assert.equal(wire.includes("/register"), false);
    assert.equal(wire.includes("/complete"), false);
  } finally {
    await driver.close();
    await close(application);
    await close(escaped);
    restoreEnvironment("BROWSERDRIVER_LIVE_IDENTIFIER", previousIdentifier);
    restoreEnvironment("BROWSERDRIVER_LIVE_PASSWORD", previousPassword);
  }
});

function registrationRequest(origin: string, requestId: string, sourceDigest: string, operationId = `register_${requestId}`): RegisterMessage {
  return {
    version: "udon.browser-driver.v4", type: "register", requestId, operationId, sourceDigest,
    profile: {
      profile: "uws.browser-registration.1.0",
      info: { title: "Loopback registration", applicationOrigins: [origin], registrationOrigins: [origin] },
      observationKind: "accessibility_snapshot", evidence: { learnedAt: "2026-08-26T00:00:00Z", source: "loopback" },
      confidence: "high", expiresAfter: "P1D", verification: { lastVerifiedAt: "2026-08-26T00:00:00Z" },
      credentialSlots: { identifier: { kind: "identifier" }, password: { kind: "password" } },
      flows: {
        create: {
          sequence: [
            { navigate: `${origin}/register?action=startnew` },
            { type_credential: { locator: { role: "textbox", name: "Identifier" }, slot: "identifier" } },
            { type_credential: { locator: { role: "textbox", name: "Password" }, slot: "password" } },
            { human_checkpoint: { kind: "consent" } },
            { submit: { locator: { role: "button", name: "Register" } } },
          ],
          effects: ["creates_account", "requires_human_verification"], confirmationPolicy: { required: true },
          success: { origin, path: "/complete", locator: { role: "status", text: "Created" } },
        },
      },
    },
    flow: "create", allowedOrigins: [origin],
    credentialBindings: { identifier: "live_identifier", password: "live_password" },
    credentialEnvironment: { live_identifier: "BROWSERDRIVER_LIVE_IDENTIFIER", live_password: "BROWSERDRIVER_LIVE_PASSWORD" },
    controls: {
      approval: "approve_registration", duplicatePrevention: "operator_attestation", onDuplicate: "fail",
      ambiguousOutcome: "stop_without_retry", cleanupDisposition: "delete_separately",
    },
  };
}

function result(messages: Array<Record<string, unknown>>, requestId: string): Record<string, unknown> {
  return messages.findLast((message) => message.type === "result" && message.requestId === requestId)!;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing loopback address");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
