import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PersistentBrowserDriver } from "../src/driver.js";
import { inputForm, inputRequest, revisedInput } from "./registration-input-fixture.js";

test("headed v5 applies typed snapshots, clears inactive values and stops substituted or denied revisions", { skip: process.env.BROWSERDRIVER_REGISTRATION_LIVE_TEST !== "1", timeout: 120_000 }, async () => {
  const submitted: URLSearchParams[] = [];
  let gets = 0;
  let socketMode = false, mixedMode = false, upgrades = 0;
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/register") {
      gets += 1;
      const html = mixedMode ? inputForm.replace('<button type="submit">', '<label>Company choice<select aria-label="Company choice" name="company_choice"><option value="Synthetic company">Synthetic company</option></select></label><button type="submit">') : inputForm;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html + (socketMode ? `<script>new WebSocket('ws://${request.headers.host}/private-channel')</script>` : ""));
    } else if (request.method === "POST" && request.url === "/complete") {
      let body = "";
      request.on("data", chunk => { body += String(chunk); });
      request.on("end", () => {
        submitted.push(new URLSearchParams(body));
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end('<div role="status" aria-label="Created">Created</div>');
      });
    } else response.writeHead(404).end();
  });
  server.on("upgrade", (_request, socket) => { upgrades += 1; socket.destroy(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const messages: Array<Record<string, unknown>> = [];
  let mode: "apply" | "stop" | "stale" | "identity" | "approval" = "apply";
  let active = inputRequest(origin);
  const source = { next: async () => {
    const pending = messages.at(-1)!;
    if (pending.type === "registration_input_checkpoint") {
      const input = revisedInput(active);
      if (mode === "stale") input.revision = 1;
      if (mode === "identity") input.values.identifier = "different@example.invalid";
      return { done: false as const, value: JSON.stringify({ version: active.version, type: "registration_input_response", requestId: pending.requestId, checkpointId: pending.checkpointId,
        ...(mode === "stop" ? { decision: "stop" } : { decision: "apply", input }) }) };
    }
    return { done: false as const, value: JSON.stringify({ version: active.version, type: "registration_checkpoint_response", requestId: pending.requestId, checkpointId: pending.checkpointId, decision: "continue",
      inputRevision: pending.inputRevision, inputSha256: mode === "approval" ? "b".repeat(64) : pending.inputSha256 }) };
  } };
  const driver = new PersistentBrowserDriver(source, message => messages.push(message as Record<string, unknown>), { headed: true });
  try {
    await driver.register(active);
    assert.equal(messages.at(-1)!.result, "success");
    assert.equal(submitted.length, 1);
    const form = submitted[0]!;
    assert.equal(form.get("identifier"), active.input!.values.identifier);
    assert.equal(form.get("password"), active.input!.values.password);
    assert.equal(form.get("name"), active.input!.values.name);
    assert.equal(form.get("kind"), "individual");
    assert.equal(form.get("company"), "");
    assert.equal(form.get("phone"), "");
    assert.equal(form.get("quantity"), "0");
    assert.equal(form.get("ratio"), "0.25");
    assert.equal(form.has("updates"), false);
    assert.deepEqual(messages.filter(message => message.type === "registration_input_checkpoint").map(message => message.checkpointId), ["details"]);
    for (const next of ["stop", "stale", "identity", "approval"] as const) {
      mode = next;
      active = inputRequest(origin); active.operationId = `create_${mode}`; active.requestId = mode;
      await driver.register(active);
      assert.equal(messages.at(-1)!.failureCode, mode === "stop" ? "registration_checkpoint_denied" : "invalid_response", mode);
      assert.equal(submitted.length, 1);
    }
    const beforeInvalid = gets;
    active = inputRequest(origin); active.requestId = "invalid_start"; active.input!.values.name = null;
    await driver.register(active);
    assert.equal(messages.at(-1)!.failureCode, "invalid_response");
    assert.equal(gets, beforeInvalid);
    socketMode = true; active = inputRequest(origin); active.operationId = "socket_denied"; active.requestId = "socket_denied";
    await driver.register(active);
    assert.equal(messages.at(-1)!.failureCode, "invalid_response");
    assert.equal(upgrades, 0); assert.equal(submitted.length, 1);
    socketMode = false; mixedMode = true; mode = "apply";
    active = inputRequest(origin); active.operationId = "mixed_controls"; active.requestId = "mixed_controls";
    active.profile.inputSlots!.company!.enum = ["Synthetic company"];
    active.profile.flows.member!.sequence.splice(11, 0, { fill_input: { slot: "company", locator: { role: "combobox", name: "Company choice" }, control: "select" } });
    await driver.register(active);
    assert.equal(messages.at(-1)!.result, "success"); assert.equal(submitted.length, 2);
    assert.equal(submitted[1]!.get("company"), ""); assert.equal(submitted[1]!.has("company_choice"), false);
    const wire = JSON.stringify(messages);
    for (const secret of ["synthetic@example.invalid", "synthetic-password", "Synthetic person", "Synthetic company", "5550100"]) assert.equal(wire.includes(secret), false);
  } finally {
    await driver.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
