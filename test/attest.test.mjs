// The app's side of Sign. The real ceremony is driven in Chrome by services/b/scripts/drive-attest.mjs; these hold the parts a browser cannot make go wrong on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { claimFor, readReturn, requestSign, sourceFromHistory } from "../index.mjs";

const png = readFileSync(new URL("../../origin-verify/test/fixtures/png/rgb8.png", import.meta.url));
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
    assert.equal(sourceFromHistory({ imports: [{ aiMarkers: false, share: 0.9 }] }), "composite");
    assert.equal(sourceFromHistory({ imports: [{ aiMarkers: true, share: 0.2 }], mostly: 0.8 }), "compositeSynthetic");
    assert.equal(sourceFromHistory({ imports: [{ aiMarkers: true, share: 0.9 }], mostly: 0.8 }), "trainedAlgorithmicMedia");
    assert.throws(() => sourceFromHistory({ imports: [{ aiMarkers: true, share: 0.9 }] }), /mostly/);
});
test("requestSign: a registered caller gets an address; a refusal is an error with its reason", async () => {
    const ok = await requestSign({ v: 2 }, { signOrigin: "https://s.test", fetch: async (u, i) => { assert.equal(u, "https://s.test/sign/par"); assert.deepEqual(JSON.parse(i.body), { claim: { v: 2 } }); return Response.json({ request_uri: "urn:sign.333.eco:abc", expires_in: 300 }, { status: 201 }); } });
    assert.equal(ok.url, "https://s.test/sign?request_uri=urn%3Asign.333.eco%3Aabc");
    await assert.rejects(requestSign({}, { fetch: async () => Response.json({ error: "origin" }, { status: 403 }) }), (e) => e.code === "origin");
    await assert.rejects(requestSign({}, { fetch: async () => new Response("nope", { status: 500 }) }), /500/);
});
test("readReturn takes the number and nothing else", () => {
    assert.equal(readReturn("#index=12"), 12);
    for (const h of ["", "#index=", "#index=1x", "#index=1&x=2", "index=1", "#other=1"]) assert.equal(readReturn(h), null, h);
});
