import type { BrowserContext, Frame, Page } from "playwright";
import { DriverFailure, type ContextSpec } from "./protocol.js";
import { exactOrigin } from "./security.js";

export type BrowserTarget = Page | Frame;

// RuntimeContexts resolves only the portable UWS popup/frame graph. Main is
// implicit. Missing, duplicate, extra, or changed targets fail closed.
export class RuntimeContexts {
  private readonly definitions = new Map<string, ContextSpec>();
  private readonly targets = new Map<string, BrowserTarget>();
  private expectedPopup: string | undefined;
  private popupEvents: Page[] = [];
  private unexpectedPopup = false;

  constructor(
    private readonly browserContext: BrowserContext,
    main: Page,
    definitions: Record<string, ContextSpec> | undefined,
    private allowed: ReadonlySet<string>,
  ) {
    this.targets.set("main", main);
    if (typeof this.browserContext.on === "function") {
      this.browserContext.on("page", (page) => {
        if (!this.expectedPopup) this.unexpectedPopup = true;
        this.popupEvents.push(page);
      });
    }
    this.merge(definitions);
  }

  setAllowed(allowed: ReadonlySet<string>): void {
    this.allowed = allowed;
  }

  mergeForAction(values: Record<string, ContextSpec> | undefined, allowed: ReadonlySet<string>): void {
    const structuralOrigins = new Set(allowed);
    for (const definition of this.definitions.values()) structuralOrigins.add(definition.origin);
    const combined = Object.fromEntries(this.definitions);
    for (const [id, value] of Object.entries(values ?? {})) {
      const previous = this.definitions.get(id);
      if (previous && !sameContext(previous, value)) throw new DriverFailure("invalid_context");
      if (!allowed.has(exactOrigin(value.origin)) || value.origin !== exactOrigin(value.origin)) throw new DriverFailure("origin_rejected");
      combined[id] = value;
    }
    validateDefinitions(combined, structuralOrigins);
    for (const [id, value] of Object.entries(values ?? {})) this.definitions.set(id, { ...value });
    this.allowed = allowed;
  }

  merge(values: Record<string, ContextSpec> | undefined): void {
    const combined = Object.fromEntries(this.definitions);
    for (const [id, value] of Object.entries(values ?? {})) {
      const previous = this.definitions.get(id);
      if (previous && !sameContext(previous, value)) throw new DriverFailure("invalid_context");
      combined[id] = value;
    }
    validateDefinitions(combined, this.allowed);
    for (const [id, value] of Object.entries(values ?? {})) this.definitions.set(id, { ...value });
  }

  async target(id = "main"): Promise<BrowserTarget> {
    const selected = id || "main";
    const selectedDefinition = this.definitions.get(selected);
    if (selectedDefinition && !this.allowed.has(exactOrigin(selectedDefinition.origin))) throw new DriverFailure("origin_rejected");
    const cached = this.targets.get(selected);
    if (cached) {
      await this.revalidate(selected, cached, selectedDefinition);
      return cached;
    }
    const definition = this.definitions.get(selected);
    if (!definition || definition.kind !== "frame") throw new DriverFailure("invalid_context");
    const parent = await this.target(definition.parent);
    const frames = directFrames(parent).filter((frame) => frameMatches(frame, definition));
    if (frames.length !== 1) throw new DriverFailure(frames.length > 1 ? "ambiguous_locator" : "invalid_context");
    this.targets.set(selected, frames[0]!);
    return frames[0]!;
  }

  // The main page begins at about:blank before the reviewed first navigation.
  // Only that navigation lookup may use the initial page without an origin;
  // every other lookup continues to require an allowed current origin.
  async navigationTarget(id = "main"): Promise<BrowserTarget> {
    const selected = id || "main";
    const target = this.targets.get(selected);
    if (selected === "main" && target && isPage(target) && target.url() === "about:blank") {
      if ((typeof target.isClosed === "function" && target.isClosed()) || !this.browserContext.pages().includes(target)) {
        throw new DriverFailure("invalid_context");
      }
      return target;
    }
    return this.target(selected);
  }

  definition(id: string): ContextSpec | undefined { return this.definitions.get(id); }

  registerPopup(id: string, parent: string, page: Page): void {
    const definition = this.definitions.get(id);
    if (!definition || definition.kind !== "popup" || definition.parent !== (parent || "main") || this.targets.has(id)) {
      throw new DriverFailure("invalid_context");
    }
    const origin = exactOrigin(page.url());
    if (!this.allowed.has(origin)) throw new DriverFailure("origin_rejected");
    if (origin !== exactOrigin(definition.origin)) throw new DriverFailure("invalid_context");
    this.targets.set(id, page);
  }

  beginPopup(id: string): void {
    if (this.expectedPopup || this.unexpectedPopup || this.popupEvents.length !== 0 || this.targets.has(id)) {
      throw new DriverFailure("invalid_context");
    }
    this.expectedPopup = id;
  }

  completePopup(id: string, parent: string, page: Page): void {
    if (this.expectedPopup !== id || this.unexpectedPopup || this.popupEvents.length !== 1 || this.popupEvents[0] !== page) {
      throw new DriverFailure("invalid_context");
    }
    this.expectedPopup = undefined;
    this.popupEvents = [];
    this.registerPopup(id, parent, page);
  }

  pages(): Page[] {
    return [...this.targets.values()].filter(isPage);
  }

  allResolvedTargets(): BrowserTarget[] { return [...this.targets.values()]; }

  async revalidateResolved(): Promise<void> {
    for (const id of [...this.targets.keys()]) await this.target(id);
  }

  async resolveAll(): Promise<void> {
    for (const id of this.definitions.keys()) await this.target(id);
    await this.revalidateResolved();
    this.assertNoExtraPages();
  }

  assertNoExtraPages(): void {
    if (this.unexpectedPopup || (this.popupEvents.length !== 0 && !this.expectedPopup)) throw new DriverFailure("invalid_context");
    const registered = new Set(this.pages());
    const actual = this.browserContext.pages();
    if (actual.length !== registered.size || actual.some((page) => !registered.has(page))) throw new DriverFailure("invalid_context");
  }

  private async revalidate(id: string, target: BrowserTarget, definition: ContextSpec | undefined): Promise<void> {
    if (isPage(target)) {
      if ((typeof target.isClosed === "function" && target.isClosed()) || !this.browserContext.pages().includes(target)) {
        throw new DriverFailure("invalid_context");
      }
      let origin: string;
      try { origin = exactOrigin(target.url()); } catch { throw new DriverFailure("origin_rejected"); }
      if (!this.allowed.has(origin)) throw new DriverFailure("origin_rejected");
      if (id === "main") return;
      if (!definition || definition.kind !== "popup") throw new DriverFailure("invalid_context");
      await this.target(definition.parent);
      if (origin !== exactOrigin(definition.origin)) throw new DriverFailure("invalid_context");
      return;
    }
    if (!definition || definition.kind !== "frame" || (typeof target.isDetached === "function" && target.isDetached())) {
      throw new DriverFailure("invalid_context");
    }
    const parent = await this.target(definition.parent);
    const frames = directFrames(parent).filter((frame) => frameMatches(frame, definition));
    if (frames.length !== 1 || frames[0] !== target) {
      throw new DriverFailure(frames.length > 1 ? "ambiguous_locator" : "invalid_context");
    }
    let origin: string;
    try { origin = exactOrigin(target.url()); } catch { throw new DriverFailure("origin_rejected"); }
    if (!this.allowed.has(origin)) throw new DriverFailure("origin_rejected");
    if (origin !== exactOrigin(definition.origin)) throw new DriverFailure("invalid_context");
  }
}

export function validateDefinitions(values: Record<string, ContextSpec>, allowed: ReadonlySet<string>): void {
  const entries = Object.entries(values);
  if (entries.length > 32) throw new DriverFailure("invalid_response");
  for (const [id, value] of entries) {
    if (!identifier.test(id) || id === "main" || !value || !["popup", "frame"].includes(value.kind) || !identifier.test(value.parent)) {
      throw new DriverFailure("invalid_response");
    }
    const origin = exactOrigin(value.origin);
    if (origin !== value.origin || !allowed.has(origin)) throw new DriverFailure("origin_rejected");
    if (value.kind === "popup" && (value.path !== undefined || value.name !== undefined)) throw new DriverFailure("invalid_response");
    if (value.kind === "frame" && value.path === undefined && value.name === undefined) throw new DriverFailure("invalid_response");
    if (value.path !== undefined && !cleanPath(value.path)) throw new DriverFailure("invalid_response");
    if (value.name !== undefined && (!value.name || value.name.length > 256)) throw new DriverFailure("invalid_response");
  }
  for (const id of Object.keys(values)) {
    let current = id;
    const seen = new Set<string>();
    let depth = 0;
    while (current !== "main") {
      if (seen.has(current) || depth >= 4) throw new DriverFailure("invalid_response");
      seen.add(current);
      const definition = values[current];
      if (!definition) throw new DriverFailure("invalid_response");
      current = definition.parent;
      depth += 1;
    }
  }
}

function directFrames(target: BrowserTarget): Frame[] {
  return isPage(target) ? target.mainFrame().childFrames() : target.childFrames();
}

function frameMatches(frame: Frame, definition: ContextSpec): boolean {
  try {
    const parsed = new URL(frame.url());
    return exactOrigin(frame.url()) === exactOrigin(definition.origin) &&
      (definition.path === undefined || parsed.pathname === definition.path) &&
      (definition.name === undefined || frame.name() === definition.name);
  } catch {
    return false;
  }
}

function isPage(value: BrowserTarget): value is Page {
  return "mainFrame" in value;
}

function cleanPath(value: string): boolean {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("\\")) return false;
  return value.split("/").slice(1).every((part) => {
    try {
      const decoded = decodeURIComponent(part);
      return decoded !== "." && decoded !== ".." && !decoded.includes("/");
    } catch { return false; }
  });
}

const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;

function sameContext(left: ContextSpec, right: ContextSpec): boolean {
  return left.kind === right.kind && left.parent === right.parent && left.origin === right.origin &&
    left.path === right.path && left.name === right.name;
}
