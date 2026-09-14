// Local, human-operated desktop diagnosis. This entry cannot load a provider.
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { FixturePresentationFailure, PresentationObserver, type PresentationSample } from "./fixture-window.js";
import { fixtureConfirmationHTML, providerFixtureLaunchOptions, waitForFixtureConfirmation } from "./provider-fixture.js";

export function fixturePresentationHTML(): string {
  return fixtureConfirmationHTML("turnstile", "before_approval").replace("<h1>",
    "<p><strong>LOCAL WINDOW DIAGNOSTIC: the Ready button confirms visibility and closes this window. No verification will start.</strong></p><h1>");
}

export function allowPresentationRequest(url: string, method: string, readyURL: string): boolean {
  return url === readyURL && method === "GET";
}

export async function runFixturePresentationDiagnostic(progress: (sample: PresentationSample) => void) {
  const started = Date.now(), operationDeadline = started + 330_000;
  let browser: Browser | undefined, context: BrowserContext | undefined;
  let confirmedAt: number | null = null, confirmationDeadline: number | null = null;
  let phase: "setup" | "navigation" | "presentation" | "confirmation" = "setup";
  let failure: "cancelled" | "confirmation_timeout" | "network_blocked" | "presentation_unavailable" | "diagnostic_failed" | "teardown_failed" | null = null;
  let blockedRequests = 0, localRequests = 0;
  let observer: PresentationObserver | undefined;
  const teardown = {context: false, browser: false, server: false};
  const server = createServer((request, response) => {
    request.resume(); // No body is read or retained, including unexpected methods.
    if (request.method === "GET" && request.url === "/ready") {
      localRequests++;
      response.writeHead(200, {"content-type": "text/html", "cache-control": "no-store"}).end(fixturePresentationHTML());
    } else {
      blockedRequests++;
      response.writeHead(405).end();
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {server.once("error", reject); server.listen(0, "127.0.0.1", resolve);});
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("local_setup");
    const readyURL = `http://verification-fixture.test:${address.port}/ready`;
    browser = await chromium.launch(providerFixtureLaunchOptions());
    context = await browser.newContext({serviceWorkers: "block", acceptDownloads: false});
    context.setDefaultTimeout(5_000);
    await context.route("**/*", async route => {
      if (allowPresentationRequest(route.request().url(), route.request().method(), readyURL)) await route.continue();
      else {blockedRequests++; await route.abort();}
    });
    await context.routeWebSocket("**/*", async socket => {blockedRequests++; await socket.close();});
    const page = await context.newPage();
    observer = new PresentationObserver(page, started, progress);
    phase = "navigation";
    await page.goto(readyURL, {waitUntil: "domcontentloaded", timeout: 5_000});
    phase = "presentation";
    await observer.capture("before_foreground");
    await page.bringToFront();
    await observer.capture("after_foreground");
    confirmationDeadline = Math.min(operationDeadline, Date.now() + 300_000);
    phase = "confirmation";
    await waitForFixtureConfirmation(page, {assertSafe: () => {
      if (blockedRequests) throw new Error("network_blocked");
    }}, confirmationDeadline, Date.now, phase => observer!.capture(phase));
    confirmedAt = Date.now();
    if (blockedRequests) failure = "network_blocked";
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    failure ??= code === "provider_fixture_cancelled" ? "cancelled" :
      code === "provider_fixture_confirmation_timeout" ? "confirmation_timeout" :
      blockedRequests ? "network_blocked" : error instanceof FixturePresentationFailure ? "presentation_unavailable" : "diagnostic_failed";
  } finally {
    try {await context?.close(); teardown.context = true;} catch {failure = "teardown_failed";}
    try {await browser?.close(); teardown.browser = true;} catch {failure = "teardown_failed";}
    server.closeAllConnections();
    try {await new Promise<void>((resolve, reject) => server.close(error => error && server.listening ? reject(error) : resolve())); teardown.server = !server.listening;}
    catch {failure = "teardown_failed";}
  }
  return {version: "browserdriver.fixture-presentation.v2" as const,
    outcome: failure === null && confirmedAt !== null ? "confirmed" : "failure", failureCode: failure,
    phase, durationMs: Date.now() - started, confirmedAt, confirmationDeadline,
    chromiumSandbox: true, samples: observer?.trace.samples ?? [], omittedSamples: observer?.trace.omitted ?? 0, localRequests, blockedRequests,
    providerExecution: false, applicationSubmission: false, qualifiesRuntime: false, teardown};
}
