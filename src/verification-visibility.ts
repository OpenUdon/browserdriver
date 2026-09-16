import type { JSHandle, Page } from "playwright";
import type { VerificationDescriptor } from "./protocol.js";
import { permitsVerificationURL } from "./verification-policy.js";

export const frameVisibilities = ["unavailable", "visible", "hidden", "ambiguous"] as const;
export interface FrameObservation {
  visibility: typeof frameVisibilities[number];
  associatedFrames: number;
}

// Executed on a frame-element handle in the parent page. Walking out through a
// shadow host does not open a closed root or read the frame's challenge content.
export function boundFrameGeometry(frame: Element, widget: Element | null): { bound: boolean; visible: boolean } {
  if (!widget?.isConnected || !frame.isConnected) return { bound: false, visible: false };
  let current: Node | null = frame;
  for (let depth = 0; current && depth < 32; depth++) {
    if (current === widget) {
      const box = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return { bound: true, visible: box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.visibility !== "collapse" };
    }
    const root = current.getRootNode();
    current = current.parentNode ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return { bound: false, visible: false };
}

// Driver frame discovery includes frames in shadow trees. Classification uses
// the existing provider policy; it neither grants traffic nor establishes ready.
// Unavailable covers missing/detached/opaque bindings instead of asserting that
// no human-visible widget exists. Limit work independently of page complexity.
export async function observeProviderFrame(page: Page, widget: JSHandle<Element | null>, provider: VerificationDescriptor["provider"]): Promise<FrameObservation> {
  const unavailable: FrameObservation = { visibility: "unavailable", associatedFrames: 0 };
  try {
    const frames = page.frames();
    if (frames.length > 33) return unavailable;
    let associatedFrames = 0, visible = false;
    for (const frame of frames) {
      if (frame === page.mainFrame() || frame.parentFrame() !== page.mainFrame()) continue;
      if (!permitsVerificationURL(provider, frame.url().split("#", 1)[0]!, "GET", true)) continue;
      const element = await frame.frameElement();
      try {
        const geometry = await element.evaluate(boundFrameGeometry, widget);
        // Recheck frame ownership and URL after the asynchronous DOM observation.
        if (frame.isDetached() || frame.parentFrame() !== page.mainFrame() ||
            !permitsVerificationURL(provider, frame.url().split("#", 1)[0]!, "GET", true)) return unavailable;
        if (geometry.bound) { associatedFrames++; visible ||= geometry.visible; }
      } finally { await element.dispose(); }
    }
    return { associatedFrames, visibility: associatedFrames > 1 ? "ambiguous" : associatedFrames === 0 ? "unavailable" : visible ? "visible" : "hidden" };
  } catch { return unavailable; }
}
