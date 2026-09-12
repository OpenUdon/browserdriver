import type { RegisterMessage, RegistrationInput } from "../src/protocol.js";

export function inputRequest(origin = "https://registration.example"): RegisterMessage {
  return {
    version: "udon.browser-driver.v5", type: "register", requestId: "typed", operationId: "create_member",
    sourceDigest: `sha256:${"a".repeat(64)}`, flow: "member", allowedOrigins: [origin],
    credentialBindings: { identifier: "member_id", password: "member_password" },
    controls: { approval: "submit_member", duplicatePrevention: "operator_attestation", onDuplicate: "fail", ambiguousOutcome: "stop_without_retry", cleanupDisposition: "delete_separately" },
    profile: {
      profile: "uws.browser-registration.1.1", info: { title: "Synthetic member", applicationOrigins: [origin], registrationOrigins: [origin] },
      observationKind: "accessibility_snapshot", evidence: { learnedAt: "2026-09-11T00:00:00Z" }, confidence: "high", expiresAfter: "P30D", verification: { lastVerifiedAt: "2026-09-11T00:00:00Z" },
      credentialSlots: { identifier: { kind: "identifier" }, password: { kind: "password" } },
      inputSlots: {
        name: { type: "string", label: "Name", required: true, minLength: 1 },
        kind: { type: "string", label: "Kind", required: true, enum: ["individual", "business"] },
        company: { type: "string", label: "Company", requiredWhen: { slot: "kind", equals: "business" } },
        quantity: { type: "integer", label: "Quantity", required: true, minimum: 0, maximum: 100 },
        ratio: { type: "number", label: "Ratio", required: true, minimum: 0, maximum: 1 },
        updates: { type: "boolean", label: "Updates", required: false },
        phone: { type: "string", label: "Phone", required: false },
      },
      flows: { member: {
        sequence: [
          { input_checkpoint: { id: "identity", slots: ["identifier", "password", "name", "kind", "company", "quantity", "ratio", "updates", "phone"] } },
          { navigate: `${origin}/register` },
          { type_credential: { slot: "identifier", locator: { role: "textbox", name: "Identifier" } } },
          { type_credential: { slot: "password", locator: { role: "textbox", name: "Password" } } },
          { fill_input: { slot: "name", locator: { role: "textbox", name: "Name" }, control: "fill" } },
          { fill_input: { slot: "kind", locator: { role: "combobox", name: "Kind" }, control: "select" } },
          { fill_input: { slot: "company", locator: { role: "textbox", name: "Company" }, control: "fill" } },
          { fill_input: { slot: "quantity", locator: { role: "textbox", name: "Quantity" }, control: "fill" } },
          { fill_input: { slot: "ratio", locator: { role: "textbox", name: "Ratio" }, control: "fill" } },
          { fill_input: { slot: "updates", locator: { role: "checkbox", name: "Updates" }, control: "check" } },
          { fill_input: { slot: "phone", locator: { role: "textbox", name: "Phone" }, control: "fill" } },
          { input_checkpoint: { id: "details", slots: ["kind", "company", "phone", "updates"] } },
          { fill_input: { slot: "kind", locator: { role: "combobox", name: "Kind" }, control: "select" } },
          { fill_input: { slot: "company", locator: { role: "textbox", name: "Company" }, control: "fill" } },
          { fill_input: { slot: "phone", locator: { role: "textbox", name: "Phone" }, control: "fill" } },
          { fill_input: { slot: "updates", locator: { role: "checkbox", name: "Updates" }, control: "check" } },
          { submit: { locator: { role: "button", name: "Register" } } },
        ],
        effects: ["creates_account", "requires_human_verification"], confirmationPolicy: { required: true },
        success: { origin, path: "/complete", locator: { role: "status", name: "Created" } },
      } },
    },
    input: { version: "uws.browser-registration-input.1.0", profileSha256: "a".repeat(64), registrationType: "member", revision: 1,
      values: { identifier: "synthetic@example.invalid", password: "synthetic-password", name: "Synthetic person", kind: "business", company: "Synthetic company", quantity: 0, ratio: 0.25, updates: true, phone: "5550100" } },
  };
}

export function revisedInput(request: RegisterMessage): RegistrationInput {
  return { ...structuredClone(request.input!), revision: 2, values: { ...request.input!.values, kind: "individual", phone: null, updates: false } };
}

export const inputForm = `<!doctype html><title>Synthetic registration</title><form method="post" action="/complete">
<label>Identifier<input aria-label="Identifier" name="identifier"></label>
<label>Password<input type="password" aria-label="Password" name="password"></label>
<label>Name<input aria-label="Name" name="name"></label>
<label>Kind<select aria-label="Kind" name="kind"><option value="individual">Individual</option><option value="business">Business</option></select></label>
<label>Company<input aria-label="Company" name="company"></label>
<label>Quantity<input aria-label="Quantity" name="quantity" role="textbox" type="number"></label>
<label>Ratio<input aria-label="Ratio" name="ratio" role="textbox" type="number" step="any"></label>
<label>Updates<input aria-label="Updates" name="updates" type="checkbox"></label>
<label>Phone<input aria-label="Phone" name="phone"></label>
<button type="submit">Register</button></form>`;
