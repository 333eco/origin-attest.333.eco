// @333eco/origin-attest. CC0. What an app needs to let a person sign what they made: the claim, the trip to sign.333.eco, and the record afterward.
// ⛔ It signs nothing itself and holds no key. The person's own passkey signs, on sign.333.eco, because a passkey is bound to that origin (SPEC T1) and the page
// showing what is signed must not be another site's (T9). A log-in session can never sign; that is the point of the shape.
import { canonical, checkCheckpoint, embedPack, findRecords, hashFile, packRecord, verifyFile, verifyPack } from "@333eco/origin-verify";
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
 * `imports`: what entered from outside, and your own library's assets that AI helped make, each { ai: bool, share: 0..1 }. `ai` is true when the asset carries AI markers or you know AI helped make it. `share` is the import's part of the VISIBLE pixels of the finished work: what was painted over, erased or left
 * transparent does not count, because a sprite on a transparent canvas is the whole picture however small it sits. AI shares ADD, so cutting one image into pieces changes nothing.
 * `mostly` is where the work is made with AI rather than combined with it, and the app must choose it. We recommend 0.8.
 */
export function sourceFromHistory({ imports = [], mostly } = {}) {
  if (!imports.length) return "digitalCreation";
  const ai = imports.filter((i) => i.ai);
  if (!ai.length) return "composite";
  if (typeof mostly !== "number") throw new TypeError("mostly: the share of the visible pixels at which AI imports are the work");
  return ai.reduce((sum, i) => sum + i.share, 0) >= mostly ? "trainedAlgorithmicMedia" : "compositeSynthetic";
}

/**
 * Registers the claim, and gives the address to send the person to. Refused unless this page's origin is a registered caller; the browser, not this code, states the origin.
 * `state` comes back on the return page, and never enters the log.
 */
export async function requestSign(claim, { signOrigin = SIGN_ORIGIN, state, fetch: f = globalThis.fetch } = {}) {
  const r = await f(`${signOrigin}/sign/par`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim, ...(state ? { state } : {}) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error ?? `the signing request was refused: ${r.status}`); e.code = j.error ?? "refused"; throw e; }
  return { url: `${signOrigin}/sign?request_uri=${encodeURIComponent(j.request_uri)}`, requestUri: j.request_uri, expiresIn: j.expires_in };
}

/** How this page was reached from sign.333.eco: { index, state } after signing, { declined: true, state } if the person went back without signing, null any other way. */
export function readReturn(hash = globalThis.location?.hash ?? "") {
  const signed = /^#index=(\d+)(?:&state=([A-Za-z0-9_-]{1,64}))?$/.exec(hash);
  if (signed) return { index: Number(signed[1]), state: signed[2] ?? null };
  const declined = /^#declined(?:&state=([A-Za-z0-9_-]{1,64}))?$/.exec(hash);
  return declined ? { declined: true, state: declined[1] ?? null } : null;
}

// ── keeping the file while the person is away ────────────────────────────────────────────────────────────────────
const PENDING_FOR_MS = 24 * 3600_000;
/** IndexedDB on this origin. The bytes stay on the device; only their hashes went anywhere. */
const indexedStore = () => {
  const open = () => new Promise((ok, no) => { const r = indexedDB.open("origin-attest", 1); r.onupgradeneeded = () => r.result.createObjectStore("pending"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((ok, no) => { const t = db.transaction("pending", mode), req = fn(t.objectStore("pending")); t.oncomplete = () => { db.close(); ok(req?.result); }; t.onerror = t.onabort = () => { db.close(); no(t.error); }; }); };
  return { put: (k, v) => tx("readwrite", (s) => s.put(v, k)), get: (k) => tx("readonly", (s) => s.get(k)), del: (k) => tx("readwrite", (s) => s.delete(k)), keys: () => tx("readonly", (s) => s.getAllKeys()) };
};
const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The whole trip out. Hashes these exact bytes, keeps them on this device, registers the claim and sends the person to sign. Export once and pass that file: re-rendering on return can change the bytes,
 * and then the record would describe a different file from the one they get. If it throws, nothing has happened and nothing was signed: let them download anyway.
 */
export async function beginSign(file, { filename = "download", store = indexedStore(), navigate = (u) => globalThis.location.assign(u), signOrigin, fetch: f, now = Date.now, ...claimOptions } = {}) {
  const bytes = await asBytes(file), mime = claimOptions.mime ?? file.type ?? "application/octet-stream";
  const claim = await claimFor(bytes, { ...claimOptions, mime });
  for (const k of await store.keys()) { const old = await store.get(k); if (!old || now() - old.at > PENDING_FOR_MS) await store.del(k); }
  const state = randomState();
  await store.put(state, { bytes, mime, filename, claim, at: now() });
  const { url } = await requestSign(claim, { state, ...(signOrigin ? { signOrigin } : {}), ...(f ? { fetch: f } : {}) }).catch(async (e) => { await store.del(state); throw e; });
  navigate(url);
  return { claim, state };
}

/**
 * The trip back, on your registered return page. Gives back the same bytes, whether or not the person signed. Null when this page was reached any other way, or when no file on this device waits under that
 * `state`, so a link somebody else made can't start a download. Call `download()` at once, and keep a button that calls it too: a browser may ask first, or refuse a download nobody tapped.
 */
export async function finishSign({ hash = globalThis.location?.hash ?? "", store = indexedStore() } = {}) {
  const back = readReturn(hash);
  if (!back?.state) return null;
  const held = await store.get(back.state);
  if (!held) return null;
  await store.del(back.state);
  const file = new Blob([held.bytes], { type: held.mime });
  return { ...back, file, filename: held.filename, claim: held.claim, download: () => saveFile(file, held.filename) };
}
function saveFile(file, filename) {
  const url = URL.createObjectURL(file), a = Object.assign(document.createElement("a"), { href: url, download: filename, style: "display:none" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const getter = (logBase, f) => async (path) => { const r = await f(logBase + path); if (r.status === 404) return null; if (!r.ok) throw new Error(`${path}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };

/**
 * The record and everything needed to check it later with nobody's help. A record joins the log at the next hourly checkpoint, so until then this answers { waiting: true }: say so once, never as a countdown.
 */
export async function packFor(index, { logBase = LOG_BASE, trust = defaultTrust, fetch: f = globalThis.fetch, header, opening } = {}) {
  const get = getter(logBase, f), raw = await get("checkpoint");
  const cp = await checkCheckpoint(new TextDecoder().decode(raw), trust);
  if (!cp.ok) throw new Error(cp.why);
  if (index >= cp.size) return { waiting: true, size: cp.size };
  return packRecord(get, index, trust, { header, ...(opening ? { opening } : {}) });
}

/**
 * A copy of the file with its proof inside (PNG or JPEG), so it can be checked with nothing else and no network. The picture is untouched, and the proof comes out to the exact signed bytes.
 * Answers { waiting: true } until the record has joined the log. Refuses a file the record does not describe.
 * `opening` also carries the passkey's signature, and with it the passkey's public key: anyone can link every file carrying the same key. Pass it only on the signer's own choice.
 */
export async function embedProof(file, index, options = {}) {
  const pack = await packFor(index, options);
  if (pack.waiting) return pack;
  const type = file.type ?? (options.mime ?? "application/octet-stream");
  return { file: new Blob([embedPack(await asBytes(file), pack)], { type }), pack };
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
export { verifyPack, verifyFile, canonical };
