// The app's side of Sign. The real ceremony is driven in Chrome by services/b/scripts/drive-attest.mjs; these hold the parts a browser cannot make go wrong on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beginSign, claimFor, finishSign, readReturn, requestSign, sourceFromHistory } from "../index.mjs";

const png = readFileSync(new URL("./fixtures/rgb8.png", import.meta.url));
test("a claim holds only enumerated fields, and the hashes of the file", async () => {
    const c = await claimFor(png, { tool: "my-editor", source: "digitalCreation", mime: "image/png", rights: "CC0-1.0" });
    assert.equal(c.sha256, createHash("sha256").update(png).digest("hex"));
    assert.match(c.pixels, /^[0-9a-f]{64}$/); assert.match(c.phash, /^[0-9a-f]{16}$/);
    assert.deepEqual(Object.keys(c).sort(), ["bytes", "declared", "mime", "phash", "pixels", "rights", "sha256", "source", "tool", "v"]);
    assert.equal(c.declared, false);
});
test("a claim refuses to guess the tool or how the work was made", async () => {
    await assert.rejects(claimFor(png, { source: "digitalCreation" }), /tool/);
    await assert.rejects(claimFor(png, { tool: "my-editor" }), /source/);
    await assert.rejects(claimFor("a string", { tool: "my-editor", source: "digitalCreation" }), /a file is/);
});
test("a file that is not a picture is still signable, by its bytes alone", async () => {
    const c = await claimFor(new TextEncoder().encode("%PDF-1.7"), { tool: "my-editor", source: "digitalCreation", mime: "application/pdf" });
    assert.equal(c.pixels, undefined); assert.equal(c.phash, undefined);
});
test("sourceFromHistory: the editor's own record picks the IPTC term, and the threshold is the app's to choose", () => {
    assert.equal(sourceFromHistory({}), "digitalCreation");
    assert.equal(sourceFromHistory({ imports: [{ ai: false, share: 0.9 }] }), "composite");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.2 }], mostly: 0.8 }), "compositeSynthetic");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.9 }], mostly: 0.8 }), "trainedAlgorithmicMedia");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.45 }, { ai: true, share: 0.45 }], mostly: 0.8 }), "trainedAlgorithmicMedia", "cutting one AI image into pieces changes nothing");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.3 }, { ai: false, share: 0.6 }], mostly: 0.8 }), "compositeSynthetic", "an import with no markers is not counted as AI");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 1 }], mostly: 0.8 }), "trainedAlgorithmicMedia", "a design that is only an AI-assisted template is made with AI");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.5 }], mostly: 0.8 }), "compositeSynthetic", "half template, half the person's own work");
    assert.equal(sourceFromHistory({ imports: [{ ai: true, share: 0.05 }], mostly: 0.8 }), "compositeSynthetic", "a small AI-assisted element still means it can't read as made by hand");
    assert.throws(() => sourceFromHistory({ imports: [{ ai: true, share: 0.9 }] }), /mostly/);
});
test("requestSign: a registered caller gets an address; a refusal is an error with its reason", async () => {
    const ok = await requestSign({ v: 2 }, { signOrigin: "https://s.test", fetch: async (u, i) => { assert.equal(u, "https://s.test/sign/par"); assert.deepEqual(JSON.parse(i.body), { claim: { v: 2 } }); return Response.json({ request_uri: "urn:sign.333.eco:abc", expires_in: 300 }, { status: 201 }); } });
    assert.equal(ok.url, "https://s.test/sign?request_uri=urn%3Asign.333.eco%3Aabc");
    await assert.rejects(requestSign({}, { fetch: async () => Response.json({ error: "origin" }, { status: 403 }) }), (e) => e.code === "origin");
    await assert.rejects(requestSign({}, { fetch: async () => new Response("nope", { status: 500 }) }), /500/);
});
test("readReturn takes a number or a decline, with an optional state, and nothing else", () => {
    assert.deepEqual(readReturn("#index=12"), { index: 12, state: null });
    assert.deepEqual(readReturn("#index=12&state=abc_-1"), { index: 12, state: "abc_-1" });
    assert.deepEqual(readReturn("#declined&state=abc"), { declined: true, state: "abc" });
    for (const h of ["", "#index=", "#index=1x", "#index=1&x=2", "index=1", "#other=1", "#index=1&state=a b", "#declined=1"]) assert.equal(readReturn(h), null, h);
});
const memoryStore = () => { const m = new Map(); return { m, put: async (k, v) => { m.set(k, v); }, get: async (k) => m.get(k), del: async (k) => { m.delete(k); }, keys: async () => [...m.keys()] }; };
const opts = { tool: "my-editor", source: "digitalCreation", mime: "image/png", filename: "a.png", signOrigin: "https://s.test" };
const okFetch = async () => Response.json({ request_uri: "urn:sign.333.eco:abc", expires_in: 900 }, { status: 201 });
test("the round trip: the exact bytes go out, wait, and come back; the state is what finds them; a second visit finds nothing", async () => {
    const store = memoryStore(); let went;
    const { state, claim } = await beginSign(png, { ...opts, store, fetch: okFetch, navigate: (u) => { went = u; } });
    assert.match(went, /^https:\/\/s\.test\/sign\?request_uri=/);
    const back = await finishSign({ hash: `#index=7&state=${state}`, store });
    assert.equal(back.index, 7); assert.equal(back.filename, "a.png");
    assert.equal(createHash("sha256").update(Buffer.from(await back.file.arrayBuffer())).digest("hex"), claim.sha256);
    assert.equal(await finishSign({ hash: `#index=7&state=${state}`, store }), null, "a reload starts no second download");
});
test("a person who goes back without signing still gets their file", async () => {
    const store = memoryStore();
    const { state } = await beginSign(png, { ...opts, store, fetch: okFetch, navigate: () => {} });
    const back = await finishSign({ hash: `#declined&state=${state}`, store });
    assert.equal(back.declined, true); assert.equal(back.index, undefined); assert.ok(back.file.size > 0);
});
test("CONTROLS: a link somebody else made finds nothing; a refused request leaves nothing waiting and goes nowhere", async () => {
    const store = memoryStore();
    const { state } = await beginSign(png, { ...opts, store, fetch: okFetch, navigate: () => {} });
    assert.equal(await finishSign({ hash: "#index=7&state=somebodyelse", store }), null);
    assert.equal(await finishSign({ hash: "#index=7", store }), null, "no state, no file");
    assert.equal(await finishSign({ hash: "", store }), null);
    assert.ok(store.m.has(state), "the real one still waits");
    const s2 = memoryStore(); let went = false;
    await assert.rejects(beginSign(png, { ...opts, store: s2, fetch: async () => Response.json({ error: "origin" }, { status: 403 }), navigate: () => { went = true; } }), (e) => e.code === "origin");
    assert.equal(went, false); assert.equal(s2.m.size, 0);
});
test("a file left behind for a day is cleared the next time someone signs; a recent one stays", async () => {
    const store = memoryStore(), t = 1_000_000_000_000;
    await store.put("old", { at: t - 25 * 3600_000 }); await store.put("recent", { at: t - 3600_000 });
    await beginSign(png, { ...opts, store, fetch: okFetch, navigate: () => {}, now: () => t });
    assert.equal(store.m.has("old"), false); assert.equal(store.m.has("recent"), true);
});
