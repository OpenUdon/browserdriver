import type { Page } from "playwright";

// Ready-page metadata only; no page-screen coordinates or desktop visibility claims.
export type Bounds = {left: number; top: number; width: number; height: number;
  windowState: "normal" | "minimized" | "maximized" | "fullscreen"};
export type PagePresentation = {visibility: "visible" | "hidden" | "unknown";
  focused: boolean | null};
export type PresentationSample = {phase: "before_foreground" | "after_foreground" | "waiting" | "decision";
  elapsedMs: number; bounds: Bounds | null; page: PagePresentation | null};

export function reduceWindowBounds(value: unknown): Bounds | null {
  try {
    const {left, top, width, height, windowState} = value as Bounds;
    if (![left, top, width, height].every(Number.isSafeInteger) || Math.abs(left) > 100_000 || Math.abs(top) > 100_000 ||
        width < 1 || width > 32_768 || height < 1 || height > 32_768 ||
        !["normal", "minimized", "maximized", "fullscreen"].includes(windowState)) return null;
    return {left, top, width, height, windowState};
  } catch {return null;}
}

// Executed in the disposable page. Never return DOM, titles or arbitrary strings.
export function readPagePresentation(): PagePresentation {
  try {
    const visibility = document.visibilityState;
    const focused = document.hasFocus();
    return {visibility: visibility === "visible" || visibility === "hidden" ? visibility : "unknown",
      focused: typeof focused === "boolean" ? focused : null};
  } catch {return {visibility: "unknown", focused: null};}
}

export class PresentationTrace {
  readonly samples: PresentationSample[] = [];
  omitted = 0;
  private lastState = "";
  add(sample: PresentationSample): boolean {
    const state = JSON.stringify({...sample, elapsedMs: 0});
    if (state === this.lastState) return false;
    this.lastState = state;
    // Keep both initial foreground samples and the latest 30 transitions.
    if (this.samples.length === 32) {this.samples.splice(2, 1); this.omitted++;}
    this.samples.push(sample);
    return true;
  }
}

export async function samplePresentation(page: Page, phase: PresentationSample["phase"], started: number): Promise<PresentationSample> {
  let bounds: Bounds | null = null, presentation: PagePresentation | null = null;
  // The outer diagnostic supervisor is authoritative if CDP becomes unresponsive.
  const session = await page.context().newCDPSession(page);
  try {
    bounds = reduceWindowBounds((await session.send("Browser.getWindowForTarget")).bounds);
    presentation = await page.evaluate(readPagePresentation);
  } finally {await session.detach();}
  return {phase, elapsedMs: Math.max(0, Date.now() - started), bounds, page: presentation};
}

export class FixturePresentationFailure extends Error {
  readonly code = "provider_fixture_presentation_failed";
  constructor() {super("provider_fixture_presentation_failed");}
}

export class PresentationObserver {
  readonly trace = new PresentationTrace();
  private lastSampleAt = -Infinity;
  private emitted = 0;
  constructor(private readonly page: Page, private readonly started: number,
    private readonly progress: (sample: PresentationSample) => void) {}

  async capture(phase: PresentationSample["phase"]): Promise<void> {
    if (phase === "waiting" && Date.now() - this.lastSampleAt < 500) return;
    let sample: PresentationSample;
    try {sample = await samplePresentation(this.page, phase, this.started);}
    catch {sample = {phase, elapsedMs: Math.max(0, Date.now() - this.started), bounds: null, page: null};}
    this.lastSampleAt = Date.now();
    if (this.trace.add(sample) && this.emitted < 32) {this.emitted++; this.progress(sample);}
    if (!sample.bounds || !sample.page) throw new FixturePresentationFailure();
  }

  snapshot() {
    return {version: "browserdriver.fixture-window.v1" as const,
      samples: this.trace.samples, omittedSamples: this.trace.omitted};
  }
}
