import assert from "node:assert/strict";
import test from "node:test";
import { prepareModernAction } from "../src/action-templates.js";
import { actionProtocolVersionV4, DriverFailure, parseInput, protocolVersionV10, protocolVersionV11, type ActionRequest } from "../src/protocol.js";

function action(profile: "uws.browser.1.8" | "uws.browser.1.9" = "uws.browser.1.9"): ActionRequest {
  return {
    version: "udon.browser-driver.v3", profile, operationId: "read", sourceDigest: "sha256:test",
    actionName: "read", allowedOrigins: ["https://example.test"],
    parameters: { id: "a/b?c", count: 1, active: false },
    action: {
      parameters: { type: "object", required: ["id"], properties: {
        id: { type: "string" }, count: { type: "number" }, active: { type: "boolean" },
      } },
      confirmationPolicy: { required: false, prompt: "Open {{id}}" },
      sequence: [
        { navigate: "/records/{{id}}?count={{count}}&active={{active}}" },
        { type_text: { locator: { role: "textbox", name: "Search" }, value: "{{id}}" } },
        { select_option: { locator: { role: "combobox", name: "Page" }, value: "{{count}}" } },
      ],
    },
  };
}

function rejected(request: ActionRequest): void {
  assert.throws(() => prepareModernAction(request), (error: unknown) =>
    error instanceof DriverFailure && error.code === "invalid_response");
}

test("v10 accepts one persistent action envelope and rejects old action profiles", () => {
  const parsed = parseInput(JSON.stringify({ version: protocolVersionV10, type: "action", requestId: "r", operationId: "read", session: "member", action: action() }));
  assert.equal(parsed.version, protocolVersionV10);
  assert.throws(() => parseInput(JSON.stringify({ version: protocolVersionV10, type: "verify", requestId: "r" })), DriverFailure);
});

test("Browser 1.8 and 1.9 render typed URL components and literal input values", () => {
  for (const profile of ["uws.browser.1.8", "uws.browser.1.9"] as const) {
    const sequence = prepareModernAction(action(profile));
    assert.deepEqual(sequence[0], { navigate: "https://example.test/records/a%2Fb%3Fc?count=1&active=false" });
    assert.deepEqual(sequence[1], { type_text: { locator: { role: "textbox", name: "Search" }, value: "a/b?c" } });
    assert.deepEqual(sequence[2], { select_option: { locator: { role: "combobox", name: "Page" }, value: "1" } });
  }
});

test("Browser 1.9 brace escapes resolve once and never rescan inserted values", () => {
  const request = action();
  request.parameters.id = "{{other}}";
  request.action.sequence[0] = { navigate: "/{{{{id}}}}/{{id}}" };
  request.action.sequence[1] = { type_text: { locator: { role: "textbox" }, value: "{{{{id}}}} {{id}}" } };
  const sequence = prepareModernAction(request);
  assert.deepEqual(sequence[0], { navigate: "https://example.test/%7B%7Bid%7D%7D/%7B%7Bother%7D%7D" });
  assert.deepEqual(sequence[1], { type_text: { locator: { role: "textbox" }, value: "{{id}} {{other}}" } });
  request.profile = "uws.browser.1.8";
  rejected(request);
});

test("a no-parameter action may omit its parameter schema", () => {
  const request = action();
  request.parameters = {};
  delete request.action.parameters;
  request.action.confirmationPolicy = { required: false };
  request.action.sequence = [{ navigate: "/static" }];
  assert.deepEqual(prepareModernAction(request), [{ navigate: "https://example.test/static" }]);
});

test("templates fail closed outside approved sinks and URL components", () => {
  for (const navigate of ["https://{{id}}.test/", "/?{{id}}=x", "/?q=x#{{id}}", "/{{missing}}", "/{{ id }}", "/{{id", "/{{{{id}}}}/../ok", "/%2e%2e/ok", "/{{id}}/./ok"]) {
    const request = action();
    request.action.sequence[0] = { navigate };
    rejected(request);
  }
  const locator = action();
  locator.action.sequence[1] = { type_text: { locator: { role: "textbox", name: "{{id}}" }, value: "safe" } };
  rejected(locator);
  const multi = action();
  multi.allowedOrigins.push("https://other.test");
  rejected(multi);
});

test("missing, non-scalar, unsafe-integer, and control-text parameters stop before browser actions", () => {
  const missing = action(); delete missing.parameters.id; rejected(missing);
  const composite = action(); composite.parameters.id = { nested: true }; rejected(composite);
  const integer = action(); integer.action.parameters = { type: "object", properties: { id: { type: "integer" } } }; integer.parameters = { id: Number.MAX_SAFE_INTEGER + 1 }; rejected(integer);
  for (const value of ["line\nnext", "\u202eabc", "\u2067abc"]) {
    const request = action(); request.parameters.id = value; rejected(request);
  }
  const select = action(); select.parameters.id = "line\nnext";
  select.action.confirmationPolicy = { required: false };
  select.action.sequence = [{ select_option: { locator: { role: "combobox" }, value: "{{id}}" } }];
  assert.deepEqual(prepareModernAction(select)[0], { select_option: { locator: { role: "combobox" }, value: "line\nnext" } });
});

test("v10 preserves Browser 1.8 signed 64-bit integers and rejects them in Browser 1.9", () => {
  const request = action("uws.browser.1.8");
  request.action.parameters = { type: "object", required: ["id"], properties: { id: { type: "integer" } } };
  request.parameters = { id: 0 };
  request.action.sequence = [{ navigate: "/number/{{id}}" }];
  const envelope = { version: protocolVersionV10, type: "action", requestId: "wide", operationId: "read", session: "member", action: request };
  const raw = JSON.stringify(envelope).replace('"parameters":{"id":0}', '"parameters":{"id":9223372036854775807}');
  const parsed = parseInput(raw);
  assert.equal(parsed.type, "action");
  if (parsed.type !== "action") return;
  assert.deepEqual(prepareModernAction(parsed.action)[0], { navigate: "https://example.test/number/9223372036854775807" });
  parsed.action.profile = "uws.browser.1.9";
  rejected(parsed.action);
  rejected({ ...request, parameters: { id: -(1n << 63n) - 1n } });
});

test("Browser 1.10 keeps Browser 1.9 template semantics in persistent v11", () => {
  const request: ActionRequest = {
    ...action("uws.browser.1.9"), version: actionProtocolVersionV4, profile: "uws.browser.1.10",
  };
  request.parameters.id = "{{other}}";
  request.action.sequence[0] = { navigate: "/{{{{id}}}}/{{id}}" };
  request.action.sequence[1] = { type_text: { locator: { role: "textbox" }, value: "{{{{id}}}} {{id}}" } };
  assert.deepEqual(prepareModernAction(request)[0], {
    navigate: "https://example.test/%7B%7Bid%7D%7D/%7B%7Bother%7D%7D",
  });
  assert.deepEqual(prepareModernAction(request)[1], {
    type_text: { locator: { role: "textbox" }, value: "{{id}} {{other}}" },
  });

  const raw = JSON.stringify({
    version: protocolVersionV11, type: "action", requestId: "wide", operationId: "read", session: "member",
    action: {
      version: actionProtocolVersionV4, profile: "uws.browser.1.10", operationId: "read", sourceDigest: "sha256:test",
      actionName: "read", allowedOrigins: ["https://example.test"], parameters: { count: 0 },
      action: { parameters: { type: "object", properties: { count: { type: "integer" } } }, sequence: [{ navigate: "/{{count}}" }] },
    },
  }).replace('"parameters":{"count":0}', '"parameters":{"count":9007199254740992}');
  const parsed = parseInput(raw);
  assert.equal(parsed.version, protocolVersionV11);
  assert.equal(parsed.type, "action");
  if (parsed.type !== "action") throw new Error("v11 action did not parse");
  assert.equal(parsed.action.parameters.count, 9007199254740992n);
  rejected(parsed.action);
});
