import { DriverFailure, isRecord, type ActionRequest, type BrowserStep } from "./protocol.js";
import { assertAllowedURL } from "./security.js";

type ModernProfile = "uws.browser.1.8" | "uws.browser.1.9";
type ScalarType = "string" | "boolean" | "integer" | "number";
const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const unsafeText = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

function invalid(): never { throw new DriverFailure("invalid_response"); }

function scalarText(value: unknown, type: ScalarType, profile: ModernProfile): string {
  if (type === "string") return typeof value === "string" ? value : invalid();
  if (type === "boolean") return typeof value === "boolean" ? String(value) : invalid();
  if (type === "integer" && typeof value === "bigint") {
    if (profile === "uws.browser.1.9" || value < -(1n << 63n) || value > (1n << 63n) - 1n) invalid();
    return value.toString();
  }
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  if (type === "integer") {
    if (!Number.isSafeInteger(value)) invalid();
    return String(value);
  }
  return JSON.stringify(value);
}

function parameterTexts(request: ActionRequest, profile: ModernProfile): Record<string, string> {
  const schema = request.action.parameters ?? {};
  if (!isRecord(schema) || (schema.type !== undefined && schema.type !== "object") || !isRecord(request.parameters)) invalid();
  const properties = schema.properties === undefined ? {} : schema.properties;
  if (!isRecord(properties)) invalid();
  const required = schema.required;
  if (required !== undefined && (!Array.isArray(required) || required.some(name => typeof name !== "string"))) invalid();
  const values: Record<string, string> = Object.create(null);
  for (const [name, declaration] of Object.entries(properties)) {
    if (!namePattern.test(name) || !isRecord(declaration)) invalid();
    const type = declaration.type;
    if (type !== "string" && type !== "boolean" && type !== "integer" && type !== "number") continue;
    const supplied = Object.hasOwn(request.parameters, name);
    const value = supplied ? request.parameters[name] : declaration.default;
    if (value === undefined) {
      if (required?.includes(name)) invalid();
      continue;
    }
    values[name] = scalarText(value, type, profile);
  }
  for (const name of Object.keys(request.parameters)) if (!Object.hasOwn(properties, name)) invalid();
  return values;
}

interface TemplateToken { start: number; end: number; text: string }

function tokens(input: string, values: Record<string, string>, profile: ModernProfile): TemplateToken[] {
  const found: TemplateToken[] = [];
  for (let index = 0; index < input.length;) {
    if (profile === "uws.browser.1.9" && input.startsWith("{{{{", index)) {
      found.push({ start: index, end: index + 4, text: "{{" }); index += 4; continue;
    }
    if (profile === "uws.browser.1.9" && input.startsWith("}}}}", index)) {
      found.push({ start: index, end: index + 4, text: "}}" }); index += 4; continue;
    }
    if (input.startsWith("{{", index)) {
      const end = input.indexOf("}}", index + 2);
      if (end < 0) invalid();
      const name = input.slice(index + 2, end);
      if (!namePattern.test(name) || !Object.hasOwn(values, name)) invalid();
      found.push({ start: index, end: end + 2, text: values[name]! });
      index = end + 2; continue;
    }
    if (input.startsWith("}}", index)) invalid();
    index++;
  }
  return found;
}

function interpolate(input: string, values: Record<string, string>, profile: ModernProfile, url: boolean): string {
  const found = tokens(input, values, profile);
  if (url) {
    const hash = input.indexOf("#");
    const query = input.indexOf("?");
    const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.exec(input);
    const authorityEnd = absolute ? input.slice(absolute[0].length).search(/[/?#]/u) : 0;
    const pathStart = absolute ? (authorityEnd < 0 ? input.length : absolute[0].length + authorityEnd) : 0;
    for (const token of found) {
      const inPath = token.start >= pathStart && (query < 0 || token.start < query) && (hash < 0 || token.start < hash);
      const inQuery = query >= 0 && token.start > query && (hash < 0 || token.start < hash) &&
        input.slice(Math.max(query + 1, input.lastIndexOf("&", token.start) + 1), token.start).includes("=");
      if (!inPath && !inQuery) invalid();
    }
  }
  let result = "", offset = 0;
  for (const token of found) {
    result += input.slice(offset, token.start) + (url ? encodeURIComponent(token.text).replace(/[!'()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) : token.text);
    offset = token.end;
  }
  return result + input.slice(offset);
}

function noTemplate(value: unknown): void {
  if (typeof value === "string") { if (value.includes("{{") || value.includes("}}")) invalid(); return; }
  if (Array.isArray(value)) { value.forEach(noTemplate); return; }
  if (isRecord(value)) Object.values(value).forEach(noTemplate);
}

function navigation(raw: string, values: Record<string, string>, profile: ModernProfile, origins: string[]): string {
  const rendered = interpolate(raw, values, profile, true);
  const rawPath = rendered.split(/[?#]/u, 1)[0]!;
  const path = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/u.test(rawPath)
    ? rawPath.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/u, "") : rawPath;
  for (const segment of path.split("/")) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { invalid(); }
    if (decoded === "." || decoded === "..") invalid();
  }
  let target: URL;
  try {
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(rendered) && origins.length !== 1) invalid();
    target = new URL(rendered, `${origins[0]}/`);
  } catch { invalid(); }
  assertAllowedURL(target.href, new Set(origins));
  return target.href;
}

/** Resolve every approved sink before the first browser macro executes. */
export function prepareModernAction(request: ActionRequest): BrowserStep[] {
  const profile = request.profile;
  if (profile !== "uws.browser.1.8" && profile !== "uws.browser.1.9" || !Array.isArray(request.action.sequence)) invalid();
  const values = parameterTexts(request, profile);
  noTemplate([request.operationId, request.sourceDigest, request.actionName, request.allowedOrigins]);
  noTemplate(request.contexts);
  noTemplate(request.action.outputs);
  const { parameters: _parameters, sequence: _sequence, outputs: _outputs, confirmationPolicy: _confirmationPolicy, ...metadata } = request.action;
  noTemplate(metadata);
  if (request.action.confirmationPolicy) {
    const { prompt: _prompt, ...policy } = request.action.confirmationPolicy;
    noTemplate(policy);
  }
  if (request.action.confirmationPolicy?.prompt !== undefined) {
    const prompt = interpolate(request.action.confirmationPolicy.prompt, values, profile, false);
    if (profile === "uws.browser.1.9" && unsafeText.test(prompt)) invalid();
  }
  return request.action.sequence.map(step => {
    const names = Object.keys(step);
    if (names.length !== 1) invalid();
    if ("navigate" in step) {
      if (typeof step.navigate === "string") return { navigate: navigation(step.navigate, values, profile, request.allowedOrigins) };
      if (!isRecord(step.navigate) || typeof step.navigate.url !== "string") invalid();
      noTemplate(step.navigate.context);
      return { navigate: { ...step.navigate, url: navigation(step.navigate.url, values, profile, request.allowedOrigins) } } as BrowserStep;
    }
    if ("type_text" in step || "select_option" in step) {
      const key = "type_text" in step ? "type_text" : "select_option";
      const part: unknown = (step as Record<string, unknown>)[key];
      if (!isRecord(part) || typeof part.value !== "string") invalid();
      const { value: _value, ...other } = part;
      noTemplate(other);
      const value = interpolate(part.value, values, profile, false);
      if (key === "type_text" && profile === "uws.browser.1.9" && unsafeText.test(value)) invalid();
      return { [key]: { ...part, value } } as BrowserStep;
    }
    if (!"click check_radio uncheck wait_for".split(" ").includes(names[0]!)) invalid();
    noTemplate(step);
    return step;
  });
}
