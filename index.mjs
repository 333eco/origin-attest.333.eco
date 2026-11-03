// @333eco/origin-attest. CC0. What an app needs to let a person sign what they made: the claim, the trip to sign.333.eco, and the record afterward.
// ⛔ It signs nothing itself and holds no key. The person's own passkey signs, on sign.333.eco, because a passkey is bound to that origin (SPEC T1) and the page
// showing what is signed must not be another site's (T9). A log-in session can never sign; that is the point of the shape.
import { canonical, checkCheckpoint, findRecords, hashFile, packRecord, verifyPack } from "@333eco/origin-verify";
import { canvasDecoder } from "@333eco/origin-verify/media";
import defaultTrust from "@333eco/origin-verify/trust";

export const SIGN_ORIGIN = "https://sign.333.eco";
export const LOG_BASE = "https://log.333.eco/origin/";

const asBytes = async (file) => {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (typeof file?.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  throw new TypeError("a file is a Blob, an ArrayBuffer or a Uint8Array");
};

/**
 * The claim: what this file is, in enumerated fields only (no free text can reach the log, SPEC T17).
 * `source` is the IPTC digital source type the app derives from what it saw (see sourceFromHistory), `declared` says the person chose it themselves.
 */
export async function claimFor(file, { tool, source, mime, rights, imports, declared = false, createdAtDeclared, decode } = {}) {
  if (!tool) throw new TypeError("tool: the app's registered name");
  if (!source) throw new TypeError("source: an IPTC digital source type");
  const bytes = await asBytes(file), type = mime ?? file.type ?? "application/octet-stream";
  const useCanvas = !decode && typeof createImageBitmap === "function" && type.startsWith("image/") && type !== "image/svg+xml";
  const h = await hashFile(bytes, { decode: decode ?? (useCanvas ? (b) => canvasDecoder(b, type) : undefined) });
  return { v: 2, sha256: h.sha256, ...(h.pixels ? { pixels: h.pixels } : {}), ...(h.phash ? { phash: h.phash } : {}), mime: type, bytes: bytes.length, source, tool, declared,
    ...(rights ? { rights } : {}), ...(imports?.length ? { imports } : {}), ...(createdAtDeclared ? { createdAtDeclared } : {}) };
}

/**
 * An editor that knows its own history can say how a work was made, in the same vocabulary as /media (SPEC §10). Nothing here looks at pixels.
 * `imports`: what entered from outside, each { aiMarkers: bool, share: 0..1 of the finished canvas }. `mostly` is where "made of one AI image" begins, and the app must choose it.
 */
export function sourceFromHistory({ imports = [], mostly } = {}) {
  if (!imports.length) return "digitalCreation";
  const ai = imports.filter((i) => i.aiMarkers);
  if (!ai.length) return "composite";
  if (typeof mostly !== "number") throw new TypeError("mostly: the share of the canvas at which one AI image is the work");
  return ai.some((i) => i.share >= mostly) ? "trainedAlgorithmicMedia" : "compositeSynthetic";
}

/** Registers the claim, and gives the address to send the person to. Refused unless this page's origin is a registered caller; the browser, not this code, states the origin. */
export async function requestSign(claim, { signOrigin = SIGN_ORIGIN, fetch: f = globalThis.fetch } = {}) {
  const r = await f(`${signOrigin}/sign/par`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error ?? `the signing request was refused: ${r.status}`); e.code = j.error ?? "refused"; throw e; }
  return { url: `${signOrigin}/sign?request_uri=${encodeURIComponent(j.request_uri)}`, requestUri: j.request_uri, expiresIn: j.expires_in };
}

/** After the person signs, sign.333.eco links back to the caller's registered page with the record's number. Null when this page was reached any other way. */
export function readReturn(hash = globalThis.location?.hash ?? "") {
  const m = /^#index=(\d+)$/.exec(hash);
  return m ? Number(m[1]) : null;
}

const getter = (logBase, f) => async (path) => { const r = await f(logBase + path); if (r.status === 404) return null; if (!r.ok) throw new Error(`${path}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };

/**
 * The record and everything needed to check it later with nobody's help. A record joins the log at the next hourly checkpoint, so until then this answers { waiting: true }: say so once, never as a countdown.
 */
export async function packFor(index, { logBase = LOG_BASE, trust = defaultTrust, fetch: f = globalThis.fetch, header } = {}) {
  const get = getter(logBase, f), raw = await get("checkpoint");
  const cp = await checkCheckpoint(new TextDecoder().decode(raw), trust);
  if (!cp.ok) throw new Error(cp.why);
  if (index >= cp.size) return { waiting: true, size: cp.size };
  return packRecord(get, index, trust, { header });
}

/** Finds a file's records by what it still is: exact bytes, the same pixels after a platform strips or re-encodes it, or a near picture. Reads the public log directly, so nobody learns what was checked. */
export async function findFile(file, { logBase = LOG_BASE, trust = defaultTrust, fetch: f = globalThis.fetch, maxDistance, decode } = {}) {
  const get = getter(logBase, f), bytes = await asBytes(file), type = file.type ?? "";
  const useCanvas = !decode && typeof createImageBitmap === "function" && type.startsWith("image/") && type !== "image/svg+xml";
  const hashes = await hashFile(bytes, { decode: decode ?? (useCanvas ? (b) => canvasDecoder(b, type) : undefined) });
  const cp = await checkCheckpoint(new TextDecoder().decode(await get("checkpoint")), trust);
  if (!cp.ok) throw new Error(cp.why);
  const found = await findRecords(get, cp.size, hashes, maxDistance === undefined ? {} : { maxDistance });
  return { hashes, size: cp.size, records: found };
}
export { verifyPack, canonical };
