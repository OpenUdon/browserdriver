import {networkReasons, type NetworkDiagnostic, type VerificationDiagnostics} from "../src/verification-diagnostics.js";
import {abnormalNetworkEvent, endpointClasses, fatalNetworkEvent, networkPhases, summaryLimit} from "../src/verification-summary.js";

// Private assertion detail, not a driver message. Consumers must select this
// version explicitly; old consumed receipts keep their original readers.
export const fixtureNetworkVersion = "browserdriver.initialization-fixture-network.v1";
export const fixtureNetworkMaxBytes = 65_536;
type Snapshot = ReturnType<VerificationDiagnostics["snapshotV5"]>;
type NetworkFields = Pick<Snapshot, "firstFailure" | "network" | "omittedNetworkEvents" | "summary">;
export type InitializationFixtureNetwork = NetworkFields & {version: typeof fixtureNetworkVersion};

function requireValid(value: unknown): asserts value {
  if (!value) throw new Error("invalid_initialization_fixture_network");
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value));
  const row = value as Record<string, unknown>;
  requireValid(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)));
  return row;
}
function integer(value: unknown, limit = Number.MAX_SAFE_INTEGER): asserts value is number {
  requireValid(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= limit);
}
const eventValues = {
  phase: networkPhases,
  frameFailure: ["none", "main_navigation", "main_origin", "ancestor_url", "ancestor_depth", "unattached"],
  reason: networkReasons, endpoint: endpointClasses, method: ["GET", "HEAD", "POST", "other"],
  resource: ["document", "script", "stylesheet", "image", "xhr", "fetch", "other"],
  frame: ["main", "child", "unavailable"], status: ["none", "1xx", "2xx", "3xx", "4xx", "5xx", "other"],
  transport: ["none", "timeout", "dns", "tls", "connection", "other"],
} as const satisfies Record<keyof NetworkDiagnostic, readonly string[]>;
function event(value: unknown): asserts value is NetworkDiagnostic {
  const row = object(value, Object.keys(eventValues));
  for (const [key, values] of Object.entries(eventValues))
    requireValid((values as readonly unknown[]).includes(row[key]));
}

// Read the producer's compact JSON representation. Requiring JSON.stringify's
// representation also rejects duplicate keys, trailing data and noncanonical
// numbers/escapes. All rejection paths use constant prose, never input text.
export function readInitializationFixtureNetwork(text: string): InitializationFixtureNetwork {
  try {
    requireValid(typeof text === "string" && Buffer.byteLength(text, "utf8") <= fixtureNetworkMaxBytes);
    const parsed: unknown = JSON.parse(text);
    requireValid(JSON.stringify(parsed) === text);
    const root = object(parsed, ["version", "firstFailure", "network", "omittedNetworkEvents", "summary"]);
    requireValid(root.version === fixtureNetworkVersion);
    integer(root.omittedNetworkEvents);
    requireValid(Array.isArray(root.network) && root.network.length <= 32);
    if (root.omittedNetworkEvents > 0) requireValid(root.network.length === 32);
    root.network.forEach(event);
    if (root.firstFailure !== null) {event(root.firstFailure); requireValid(fatalNetworkEvent(root.firstFailure));}
    const summary = object(root.summary, ["unit", "saturated", "counters", "fatalReasons", "firstAbnormal", "lastAbnormal"]);
    requireValid(summary.unit === "diagnostic_events" && typeof summary.saturated === "boolean");
    for (const key of ["firstAbnormal", "lastAbnormal"]) {
      if (summary[key] !== null) {event(summary[key]); requireValid(abnormalNetworkEvent(summary[key]));}
    }
    requireValid((summary.firstAbnormal === null) === (summary.lastAbnormal === null));
    requireValid(Array.isArray(summary.counters) && summary.counters.length === networkPhases.length * endpointClasses.length);
    let events = 0, fatalities = 0;
    summary.counters.forEach((value, index) => {
      const row = object(value, ["phase", "endpoint", "events", "blockedReads", "provider4xx", "provider5xx", "fatal"]);
      requireValid(row.phase === networkPhases[Math.floor(index / endpointClasses.length)] && row.endpoint === endpointClasses[index % endpointClasses.length]);
      integer(row.events, summaryLimit); events += row.events;
      for (const key of ["blockedReads", "provider4xx", "provider5xx", "fatal"]) {
        integer(row[key], summaryLimit); requireValid(row[key] <= row.events);
      }
      fatalities += row.fatal as number;
    });
    requireValid(Array.isArray(summary.fatalReasons) && summary.fatalReasons.length === networkReasons.length);
    let reasons = 0;
    summary.fatalReasons.forEach((value, index) => {
      const row = object(value, ["reason", "count"]);
      requireValid(row.reason === networkReasons[index]); integer(row.count, summaryLimit); reasons += row.count;
    });
    if (!summary.saturated) {
      requireValid(events === root.network.length + root.omittedNetworkEvents && reasons === fatalities);
    }
    requireValid((fatalities === 0) === (root.firstFailure === null));
    return parsed as InitializationFixtureNetwork;
  } catch {
    throw new Error("invalid_initialization_fixture_network");
  }
}

export function initializationFixtureNetwork(snapshot: NetworkFields): InitializationFixtureNetwork {
  // Select only the existing closed guard fields. No request, response, URL,
  // header, body, raw exception or fixture transport object enters this path.
  return readInitializationFixtureNetwork(JSON.stringify({version: fixtureNetworkVersion,
    firstFailure: snapshot.firstFailure, network: snapshot.network,
    omittedNetworkEvents: snapshot.omittedNetworkEvents, summary: snapshot.summary}));
}
