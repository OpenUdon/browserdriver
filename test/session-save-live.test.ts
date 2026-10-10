import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "playwright";
import { PersistentBrowserDriver } from "../src/driver.js";
import { sessionCandidateFileName, sessionSaveConfiguration } from "../src/session-save.js";
import { FileSessionStateStore, sessionStateFileName } from "../src/session-store.js";
import { fixtureAuthentication, fixtureBinding, fixtureOrigin, fixtureSavePlan } from "./m16-fixture-auth.js";
const { publishPacket } = createRequire(import.meta.url)("../../scripts/m16-packet.cjs") as { publishPacket(path: string, packet: object): Promise<void> };
type LaunchFailure = { version: string; inputState: string; category: string; termination: { state: string; exitCode: number | null; signal: string | null }; features: string[] };
const { reduceLaunchFailure, isClosedLaunchFailure } = createRequire(import.meta.url)("../../scripts/m16-launch-diagnostics.cjs") as {
  reduceLaunchFailure(error: unknown): LaunchFailure; isClosedLaunchFailure(value: unknown): boolean;
};

const live = process.env.BROWSERDRIVER_SESSION_SAVE_LIVE_TEST === "1";
const origin = fixtureOrigin;

test("headed M16 fixture saves after authentication, joins, then loads only raw state with original expiry", { skip: !live, timeout: 120_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-live-"));
  let mutations = 0, reuseWithCookie = 0;
  const application = createServer((request, response) => {
    if (request.method !== "GET") { mutations += 1; response.writeHead(405).end(); return; }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("content-security-policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'");
    if (request.url === "/start") {
      response.setHeader("set-cookie", "m16_fixture=synthetic; Path=/; SameSite=Strict");
      response.end('<!doctype html><h1>Member</h1><script>localStorage.setItem("m16_fixture", "synthetic")</script>');
    } else if (request.url === "/reuse") {
      const cookie = request.headers.cookie?.split("; ").includes("m16_fixture=synthetic");
      if (cookie) reuseWithCookie += 1;
      response.end(`<!doctype html><h1>${cookie ? "Member" : "Missing"}</h1><script>if(localStorage.getItem("m16_fixture")!=="synthetic")document.querySelector("h1").textContent="Missing"</script>`);
    } else response.writeHead(404).end();
  });
  let listening = false;
  let joinedDrivers = 0;
  const drivers: PersistentBrowserDriver[] = [];
  const launchFailures: { phase: string; category: string; diagnostic: LaunchFailure }[] = [];
  let activePhase = "unstarted", launchCalls = 0;
  const realLaunch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", async (...args: Parameters<typeof chromium.launch>) => {
    if (++launchCalls > 2) throw new Error("qualification launch count exceeded");
    try { return await realLaunch(...args); }
    catch (error) {
      const diagnostic = reduceLaunchFailure(error); assert.equal(isClosedLaunchFailure(diagnostic), true);
      launchFailures.push({ phase: activePhase, category: diagnostic.category, diagnostic }); throw error;
    }
  });
  try {
    assert.equal(process.versions.node, "24.14.1");
    assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, "/home/peter/.cache/ms-playwright");
    assert.equal(process.env.CHROME_DEVEL_SANDBOX, "/opt/google/chrome/chrome-sandbox");
    assert.ok(process.env.BROWSERDRIVER_M16_FIXTURE_REPORT?.startsWith("/"));
    assert.ok(process.env.BROWSERDRIVER_M16_FAILURE_REPORT?.startsWith("/"));
    const proofRoot = process.env.BROWSERDRIVER_M16_SANDBOX_PROOFS;
    assert.ok(proofRoot?.startsWith("/"));
    const selfStat = await readFile(`/proc/${process.pid}/stat`, "utf8");
    const worker = { pid: process.pid, start: selfStat.slice(selfStat.lastIndexOf(")") + 2).split(" ")[19]!, uid: process.getuid!() };
    await new Promise<void>((resolve, reject) => {
      application.once("error", reject);
      application.listen(46061, "127.0.0.1", () => { application.off("error", reject); listening = true; resolve(); });
    });
    const now = Date.now(), binding = fixtureBinding;
    const loadRoot = join(root, "load"); await mkdir(loadRoot, { mode: 0o700 });
    const results: object[][] = [];
    for (const phase of ["start", "reuse"] as const) {
      activePhase = phase;
      const staging = join(root, `${phase}-candidate`); await mkdir(staging, { mode: 0o700 });
      const auth = fixtureAuthentication(phase), plan = fixtureSavePlan(phase, auth, now), permission = plan.permissions[0]!;
      const planPath = join(root, `${phase}-plan.json`);
      await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 }); await chmod(planPath, 0o600);
      const save = (await sessionSaveConfiguration(planPath, staging, loadRoot))!;
      const messages: object[] = []; results.push(messages);
      const driver = new PersistentBrowserDriver({ next: async () => ({ done: true, value: undefined }) }, message => messages.push(message), {
        headed: true, sessionSave: save, ...(phase === "reuse" ? { sessionStore: new FileSessionStateStore(loadRoot) } : {}),
      }); drivers.push(driver);
      await driver.authenticate(auth);
      const browser = (driver as unknown as { browser?: Browser }).browser;
      const result = messages.at(-1) as { result?: string; failureCode?: string };
      if (!browser || result.result !== "success") {
        await writeFile(process.env.BROWSERDRIVER_M16_FAILURE_REPORT!, `${JSON.stringify({ version: "browserdriver.m16-fixture-failure.v2", fixtureOnly: true,
          phase, stage: browser ? "authentication_after_launch" : launchCalls ? "launch" : "authentication_before_launch",
          launchCalls, launchFailures, authenticationFailureCode: result.failureCode ?? null })}\n`, { flag: "wx", mode: 0o600 });
        throw new Error("synthetic authentication failed; closed failure report retained");
      }
      assert.ok(browser); assert.equal(browser.version(), "151.0.7922.34");
      // Keep this exact launch alive until the independent controller records
      // positive sandbox proof for its own main PID/start/uid and renderer.
      await publishPacket(join(proofRoot!, "requests", `${phase}.json`), { version: "browserdriver.m16-sandbox-phase.v1", phase, worker });
      const proofDeadline = process.hrtime.bigint() + 30_000_000_000n;
      let acknowledged = false;
      while (process.hrtime.bigint() < proofDeadline) {
        try {
          const bytes = await readFile(join(proofRoot!, "acks", `${phase}.json`));
          assert.ok(bytes.length <= 4096);
          const ack = JSON.parse(bytes.toString("utf8"));
          assert.equal(ack.version, "browserdriver.m16-sandbox-proof.v1"); assert.equal(ack.phase, phase);
          assert.deepEqual(ack.worker, worker); assert.ok(Number.isSafeInteger(ack.main.pid) && ack.main.pid > 0);
          assert.ok(typeof ack.main.start === "string" && /^\d+$/u.test(ack.main.start));
          assert.equal(ack.main.uid, worker.uid); assert.ok(ack.rendererCount > 0);
          acknowledged = true; break;
        } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
        await delay(25);
      }
      assert.equal(acknowledged, true);
      await driver.close();
      joinedDrivers += 1;
      assert.deepEqual(messages.at(-1), { version: auth.version, type: "result", requestId: phase, result: "success" });
      const name = sessionCandidateFileName(binding);
      assert.deepEqual(await readdir(staging), [name]);
      const candidate = JSON.parse(await readFile(join(staging, name), "utf8"));
      assert.equal(candidate.planSHA256, save.planSHA256); assert.equal(candidate.createdAt, permission.createdAt); assert.equal(candidate.expiresAt, permission.expiresAt);
      assert.equal(candidate.bindingSHA256, permission.bindingSHA256); assert.equal(candidate.generation, 3);
      assert.ok(candidate.storageState.cookies.some((cookie: { name: string }) => cookie.name === "m16_fixture"));
      if (phase === "start") {
        // Test-only raw handoff after clean local driver close. This is not
        // host encrypted acceptance or generation/revocation qualification.
        await writeFile(join(loadRoot, sessionStateFileName(binding)), JSON.stringify(candidate.storageState), { mode: 0o600 });
      }
    }
    assert.equal(mutations, 0); assert.equal(reuseWithCookie, 1);
    assert.ok(!JSON.stringify(results).includes("synthetic"));
  } finally {
    for (const driver of drivers) await driver.close();
    if (listening) await new Promise<void>((resolve, reject) => application.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
  assert.equal(application.address(), null);
  await writeFile(process.env.BROWSERDRIVER_M16_FIXTURE_REPORT!, `${JSON.stringify({ version: "browserdriver.m16-fixture-evidence.v1", fixtureOnly: true,
    origin, browserLaunches: drivers.length, joinedDrivers, authenticatedContexts: 2, mutations, reuseWithCookie,
    originalLifetimePreserved: true, rawLegacyHandoffOnly: true, listenerClosed: true, plaintextFixtureRootRemoved: true })}\n`, { flag: "wx", mode: 0o600 });
});
