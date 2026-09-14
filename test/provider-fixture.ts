import { createServer } from "node:http";
import { chromium, type Browser, type BrowserContext, type LaunchOptions, type Page } from "playwright";
import { DriverFailure, type VerificationDescriptor } from "../src/protocol.js";
import { VerificationGuard } from "../src/verification.js";
import { verificationDescriptor } from "./verification-fixture.js";
import { sandboxedChromiumOptions } from "../src/browser-launch.js";
import { FixturePresentationFailure, PresentationObserver, type PresentationSample } from "./fixture-window.js";

export const officialProviders = {
  turnstile: { marker: "cf-turnstile", api: "turnstile", script: "https://challenges.cloudflare.com/turnstile/v0/api.js", key: "1x00000000000000000000AA" },
  recaptcha_v2: { marker: "g-recaptcha", api: "grecaptcha", script: "https://www.google.com/recaptcha/api.js", key: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" },
  hcaptcha: { marker: "h-captcha", api: "hcaptcha", script: "https://js.hcaptcha.com/1/api.js", key: "10000000-ffff-ffff-ffff-000000000001" },
} as const;
type Provider = VerificationDescriptor["provider"];
type Activation = VerificationDescriptor["activation"];
export type FixturePhase = "setup" | "confirmation" | "navigation" | "binding" | "initialization" | "before_approval" |
  "submit_trigger" | "after_submit" | "completion" | "complete";
export interface FixtureCallbacks { loaded: boolean; rendered: boolean; errors: number; expired: number; completed: number; executed: number }
export const fixtureErrorSources = ["script_load_error", "render_exception", "invalid_widget", "duplicate_render",
  "trigger_before_render", "duplicate_trigger", "execute_exception", "execute_rejection",
  "provider_error_callback", "completion_submit_exception", "completion_before_trigger", "duplicate_completion", "invalid_snapshot"] as const;
export const fixtureEventKinds = ["sdk_onload", "render_enter", "render_return", "trigger_requested", "execute_enter",
  "execute_return", "execute_settled", "completion_callback", "expired_callback", ...fixtureErrorSources] as const;
type FixtureErrorSource = typeof fixtureErrorSources[number];
type FixtureEventKind = typeof fixtureEventKinds[number];
export interface FixtureSnapshot extends FixtureCallbacks {
  events: Array<{sequence: number; kind: FixtureEventKind}>;
  omittedEvents: number;
  firstError: {sequence: number; source: FixtureErrorSource} | null;
}
const emptyCallbacks = (): FixtureSnapshot => ({ loaded: false, rendered: false, errors: 0, expired: 0, completed: 0, executed: 0,
  events: [], omittedEvents: 0, firstError: null });

// Executed inside the browser before the snapshot crosses Playwright. Extra
// properties, exception prose, callback arguments and widget IDs never leave.
export function reduceFixtureSnapshot(value: unknown): FixtureSnapshot {
  const invalid = (): FixtureSnapshot => ({loaded:false, rendered:false, errors:1, expired:0, completed:0, executed:0,
    events:[], omittedEvents:0, firstError:{sequence:0, source:"invalid_snapshot"}});
  try {
    const raw = value as FixtureSnapshot | null;
    if (!raw) return invalid();
    // Read each untrusted property once before validating it. Re-reading a
    // getter after checking its value could export a different, private value.
    const item = {loaded:raw.loaded,rendered:raw.rendered,errors:raw.errors,expired:raw.expired,
      completed:raw.completed,executed:raw.executed,omittedEvents:raw.omittedEvents};
    const rawEvents = raw.events, rawFirst = raw.firstError;
    const first = rawFirst === null ? null : {sequence:rawFirst.sequence,source:rawFirst.source};
    if (!Array.isArray(rawEvents)) return invalid();
    const eventCount = rawEvents.length;
    if (!Number.isSafeInteger(eventCount) || eventCount < 0 || eventCount > 32) return invalid();
    const events: FixtureSnapshot["events"] = [];
    for (let index=0;index<eventCount;index++) {
      const event=rawEvents[index]!;
      events.push({sequence:event.sequence,kind:event.kind});
    }
    const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
    if (!item || typeof item.loaded !== "boolean" || typeof item.rendered !== "boolean" ||
      ![item.errors,item.expired,item.completed,item.executed].every(n=>integer(n)&&n<=2) ||
      !integer(item.omittedEvents) || (item.omittedEvents > 0 && events.length !== 32)) return invalid();
    if (first !== null && (!first || !integer(first.sequence) || !fixtureErrorSources.includes(first.source))) return invalid();
    if ((item.errors > 0) !== (first !== null)) return invalid();
    if (!events.every((event,index)=>event && integer(event.sequence) && event.sequence===item.omittedEvents+index+1 && fixtureEventKinds.includes(event.kind))) return invalid();
    if (first) {
      if (first.sequence > item.omittedEvents+events.length || (first.sequence === 0 && first.source !== "invalid_snapshot")) return invalid();
      if (first.sequence > item.omittedEvents && events[first.sequence-item.omittedEvents-1]!.kind !== first.source) return invalid();
    }
    if (events.some(event=>fixtureErrorSources.includes(event.kind as FixtureErrorSource)) && !first) return invalid();
    return {loaded:item.loaded, rendered:item.rendered, errors:item.errors, expired:item.expired, completed:item.completed, executed:item.executed,
      events:events.map(event=>({sequence:event.sequence,kind:event.kind})), omittedEvents:item.omittedEvents,
      firstError:first && {sequence:first.sequence,source:first.source}};
  } catch {return invalid();}
}

const readFixtureSnapshot = new Function("return " + `() => {
  const fixtureErrorSources = ${JSON.stringify(fixtureErrorSources)};
  const fixtureEventKinds = ${JSON.stringify(fixtureEventKinds)};
  const reduce = ${reduceFixtureSnapshot.toString()};
  try {return reduce(window.fixtureSnapshot?.());} catch {return reduce(null);}
}`)() as () => FixtureSnapshot;
export const fixtureReadyTimeoutMs = 300_000;
export const fixtureVerificationTimeoutMs = 120_000;

class FixtureConfirmationFailure extends Error {
  constructor(readonly code: "provider_fixture_cancelled" | "provider_fixture_confirmation_timeout") { super(code); }
}

export async function waitForFixtureConfirmation(page: Page, guard: Pick<VerificationGuard, "assertSafe">, deadline: number, now = Date.now,
  observe?: (phase: "waiting" | "decision") => Promise<void>): Promise<void> {
  while (true) {
    guard.assertSafe();
    if (page.isClosed()) throw new FixtureConfirmationFailure("provider_fixture_cancelled");
    if (now() >= deadline) throw new FixtureConfirmationFailure("provider_fixture_confirmation_timeout");
    let decision: string;
    try {
      decision = await page.evaluate(() => {
        const value = (window as unknown as {fixtureDecision: () => unknown}).fixtureDecision();
        return value === "ready" || value === "cancelled" ? value : "waiting";
      });
    } catch (error) {
      if (page.isClosed()) throw new FixtureConfirmationFailure("provider_fixture_cancelled");
      throw error;
    }
    try {await observe?.(decision === "waiting" ? "waiting" : "decision");}
    catch (error) {
      if (page.isClosed()) throw new FixtureConfirmationFailure("provider_fixture_cancelled");
      throw error;
    }
    // A reply queued before expiry cannot grant an extension if evaluation
    // completes after the advertised confirmation deadline.
    guard.assertSafe();
    if (page.isClosed()) throw new FixtureConfirmationFailure("provider_fixture_cancelled");
    if (now() >= deadline) throw new FixtureConfirmationFailure("provider_fixture_confirmation_timeout");
    if (decision === "cancelled") throw new FixtureConfirmationFailure("provider_fixture_cancelled");
    if (decision === "ready") return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export function fixtureConfirmationHTML(provider: Provider, activation: Activation): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Ready for ${provider}?</title>
    <h1>Ready for ${provider}: ${activation}?</h1>
    <p>Official test key; local form; no accounts.</p>
    <p>You must click any verification checkbox and complete any visible challenge yourself.
    The fixture controls Submit. Keep this window in view.</p>
    <p>The two-minute verification countdown starts when you click the button below.
    Provider loading counts toward those two minutes. You have five minutes to start or cancel.</p>
    <button id="ready" type="button">I'm ready—start verification</button>
    <button id="cancel" type="button">Cancel fixture</button>
    <script>(() => {
      let decision = 'waiting';
      window.fixtureDecision = () => decision;
      for (const [id, value] of [['ready', 'ready'], ['cancel', 'cancelled']]) {
        document.getElementById(id).addEventListener('click', event => {
          if (!event.isTrusted || decision !== 'waiting') return;
          decision = value;
          document.getElementById('ready').disabled = true;
          document.getElementById('cancel').disabled = true;
        });
      }
    })();</script></html>`;
}

// Only this disposable fixture owns these scripts. No executable source is
// accepted from a profile, and the test never operates a provider challenge.
export function providerFixtureHTML(provider: Provider, activation: Activation, deadline = Date.now() + fixtureVerificationTimeoutMs): string {
  const config = officialProviders[provider], invisible = activation === "approved_submit";
  const key = provider === "turnstile" && invisible ? "1x00000000000000000000BB" : config.key;
  const options = provider === "turnstile" ? `execution: '${invisible ? "execute" : "render"}', retry: 'never', 'refresh-expired': 'never',` : `size: '${invisible ? "invisible" : "normal"}',`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${provider}: ${activation}</title>
    <h1>${provider}: ${activation}</h1><p>Official test key; local form; no accounts.</p>
    <p>Click any verification checkbox and complete any visible challenge yourself. The fixture controls Submit.</p>
    <p role="timer" id="countdown">Verification starting; 120-second limit.</p>
    <form action="/register" method="post"><div id="fixture-widget" class="${config.marker}"></div><button type="submit">Submit fixture</button></form>
    <script>
      (() => {
        let widgetID, sequence=0;
        const state = {loaded:false, rendered:false, errors:0, expired:0, completed:0, executed:0,
          events:[], omittedEvents:0, firstError:null};
        const record = kind => {
          if (state.events.length === 32) {state.events.shift();state.omittedEvents++;}
          state.events.push({sequence:++sequence,kind});
        };
        const error = source => {
          record(source);
          state.errors = Math.min(2, state.errors + 1);
          state.firstError ??= {sequence,source};
        };
        // Fixed vocabulary and saturated counters only; no callback arguments.
        window.fixtureSnapshot = () => ({...state,events:state.events.map(event=>({...event})),firstError:state.firstError&&{...state.firstError}});
        window.fixtureScriptError = () => error('script_load_error');
        window.fixtureLoad = () => {
          record('sdk_onload');
          if (state.loaded) {error('duplicate_render');return;}
          state.loaded = true;
          try {
            record('render_enter');
            widgetID = window.${config.api}.render(document.getElementById('fixture-widget'), {
              sitekey: '${key}', ${options}
              callback: () => {
                record('completion_callback');
                state.completed = Math.min(2, state.completed + 1);
                if (state.completed > 1) {error('duplicate_completion');return;}
                if (${invisible}) {
                  if (!state.executed) {error('completion_before_trigger');return;}
                  if (state.errors || state.expired) return;
                  try {document.querySelector('form').submit();} catch {error('completion_submit_exception');}
                }
              },
              'error-callback': () => error('provider_error_callback'),
              'expired-callback': () => {record('expired_callback');state.expired = Math.min(2, state.expired + 1);}
            });
            record('render_return');
            state.rendered = ${provider === "recaptcha_v2" ? "Number.isSafeInteger(widgetID) && widgetID >= 0" : "typeof widgetID === 'string' && widgetID.length > 0"};
            if (!state.rendered) error('invalid_widget');
          } catch { error('render_exception'); }
        };
        if (${invisible}) document.querySelector('form').addEventListener('submit', event => {
          event.preventDefault();record('trigger_requested');
          if (!state.rendered) {error('trigger_before_render');return;}
          if (state.executed) {error('duplicate_trigger');return;}
          if (state.errors || state.expired) return;
          state.executed++;
          try {
            record('execute_enter');
            const execution = window.${config.api}.execute(widgetID);
            record('execute_return');
            // Some integrations return a promise; settlement never establishes
            // readiness, and neither result nor rejection value is inspected.
            if (execution && typeof execution.then === 'function') {
              Promise.resolve(execution).then(()=>record('execute_settled'),()=>error('execute_rejection'));
            }
          } catch {error('execute_exception');}
        });
      })();
    </script><script>
      (() => {const update = () => {
        const seconds = Math.max(0, Math.ceil((${deadline} - Date.now()) / 1000));
        document.getElementById('countdown').textContent = seconds ? seconds + ' seconds remaining for verification' : 'Verification time expired';
      }; update(); setInterval(update, 250);})();
    </script><script src="${config.script}?onload=fixtureLoad&render=explicit" async defer onerror="window.fixtureScriptError()"></script></html>`;
}

async function readCallbacks(page: Page): Promise<FixtureSnapshot> {
  return page.evaluate(readFixtureSnapshot);
}

// Shared sandboxed launch policy; fixture-only host mapping stays local to it.
export function providerFixtureLaunchOptions(): LaunchOptions {
  return {...sandboxedChromiumOptions(true), timeout: 30_000, args: ["--host-resolver-rules=MAP verification-fixture.test 127.0.0.1", "--no-proxy-server"]};
}

export async function runProviderFixture(provider: Provider, activation: Activation,
  progress: (event: {phase: FixturePhase; state: string; presentation?: PresentationSample}) => void) {
  const started = Date.now(), operationDeadline = started + 30_000 + fixtureReadyTimeoutMs + fixtureVerificationTimeoutMs;
  let deadline = operationDeadline, confirmedAt: number | null = null, confirmationDeadline: number | null = null;
  let phase: FixturePhase = "setup", failure: string | null = null, localPosts = 0;
  let callbacks = emptyCallbacks(), guard: VerificationGuard | undefined, browser: Browser | undefined, context: BrowserContext | undefined;
  let presentation: PresentationObserver | undefined;
  const teardown = {context: false, browser: false, server: false};
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new DriverFailure("verification_timeout"); return ms; };
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/register") {
      localPosts++;
      request.resume(); // Discard provider response without inspecting it.
      response.writeHead(localPosts === 1 ? 303 : 409, localPosts === 1 ? {location: "/complete"} : {}).end();
    } else if (request.method === "GET" && request.url === "/ready") {
      response.writeHead(200, {"content-type": "text/html", "cache-control": "no-store"}).end(fixtureConfirmationHTML(provider, activation));
    } else if (request.method === "GET" && request.url === "/register" && confirmedAt !== null) {
      response.writeHead(200, {"content-type": "text/html", "cache-control": "no-store"}).end(providerFixtureHTML(provider, activation, deadline));
    } else if (request.method === "GET" && request.url === "/complete") {
      response.writeHead(200, {"content-type": "text/html"}).end("<p>Local fixture submission received</p>");
    } else { response.writeHead(405).end(); }
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture_setup");
    const origin = `http://verification-fixture.test:${address.port}`;
    browser = await chromium.launch(providerFixtureLaunchOptions());
    context = await browser.newContext({serviceWorkers: "block", acceptDownloads: false});
    context.setDefaultTimeout(5_000);
    guard = new VerificationGuard(context, verificationDescriptor(provider, activation, origin), new Set([origin]),
      new Set([origin + "/ready", origin + "/register", origin + "/complete"]), operationDeadline);
    await guard.install();
    const page = await context.newPage();
    await guard.watchRedirects(page);
    phase = "confirmation";
    await page.goto(origin + "/ready", {waitUntil: "domcontentloaded", timeout: 5_000});
    presentation = new PresentationObserver(page, started, sample => progress({phase: "confirmation", state: "window_observation", presentation: sample}));
    await presentation.capture("before_foreground");
    await page.bringToFront();
    await presentation.capture("after_foreground");
    confirmationDeadline = Math.min(operationDeadline - fixtureVerificationTimeoutMs, Date.now() + fixtureReadyTimeoutMs);
    progress({phase, state: "awaiting_confirmation"});
    await waitForFixtureConfirmation(page, guard, confirmationDeadline, Date.now, phase => presentation!.capture(phase));
    confirmedAt = Date.now();
    guard.submission.startPhase();
    deadline = guard.submission.deadline;
    progress({phase, state: "confirmed"});
    phase = "navigation";
    await page.goto(origin + "/register", {waitUntil: "domcontentloaded", timeout: remaining()});
    phase = "binding";
    const submit = page.getByRole("button", {name: "Submit fixture", exact: true});
    await guard.bindSubmit(submit);
    const wait = async (until: "initialized" | "ready" | "post") => {
      let previous = "";
      while (until !== "post" || !guard!.postCount()) {
        remaining();
        let state;
        try {
          callbacks = await readCallbacks(page);
          state = await guard!.state();
        } catch (error) {
          if (until === "post" && guard!.postCount()) {guard!.assertSafe(); return;}
          throw error;
        }
        if (callbacks.errors) throw new DriverFailure("verification_failed");
        if (callbacks.expired) throw new DriverFailure("verification_expired");
        if (state !== previous) {previous = state; progress({phase, state});}
        if (until === "initialized" && callbacks.rendered || until === "ready" && state === "ready") return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      guard!.assertSafe();
    };
    phase = "initialization";
    await wait("initialized");
    if (activation === "before_approval") {phase = "before_approval"; await wait("ready");}
    phase = "submit_trigger";
    guard.beginSubmit();
    await submit.click({timeout: remaining()});
    phase = "after_submit";
    await wait("post");
    phase = "completion";
    await page.waitForURL(origin + "/complete", {timeout: remaining()});
    guard.finishSubmit();
    if (localPosts !== 1) throw new Error("fixture_post_count");
    phase = "complete";
  } catch (error) {
    failure ??= error instanceof DriverFailure || error instanceof FixtureConfirmationFailure || error instanceof FixturePresentationFailure ? error.code : Date.now() >= deadline ? "verification_timeout" : "provider_fixture_failed";
    // A route failure can precede a generic page/navigation rejection.
    try {guard?.assertSafe();} catch (guardError) {if (guardError instanceof DriverFailure) failure = guardError.code;}
  } finally {
    try {if (guard) await guard.close(); else await context?.close(); teardown.context = true;}
    catch (error) {
      teardown.context = guard?.diagnostics().shutdown.contextClosed ?? false;
      failure ??= error instanceof DriverFailure ? error.code : "provider_fixture_teardown";
    }
    try {await browser?.close(); teardown.browser = true;} catch {failure ??= "provider_fixture_teardown";}
    server.closeAllConnections();
    try {await new Promise<void>((resolve, reject) => server.close(error => error && server.listening ? reject(error) : resolve())); teardown.server = !server.listening;}
    catch {failure ??= "provider_fixture_teardown";}
  }
  return {version: "browserdriver.provider-fixture.v4" as const, chromiumSandbox: true,
    presentation: presentation?.snapshot() ?? {version: "browserdriver.fixture-window.v1" as const, samples: [], omittedSamples: 0},
    provider, activation, outcome: failure ? "failure" : "success",
    failureCode: failure, phase, durationMs: Date.now() - started, lastObservedCallbacks: callbacks, localPosts,
    confirmation: {confirmedAt, deadline: confirmationDeadline}, verificationDeadline: confirmedAt === null ? null : deadline,
    counts: guard?.counts() ?? null, diagnostics: guard?.diagnostics() ?? null, teardown};
}
