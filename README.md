# @333eco/origin-attest

Lets a person **Sign with HeartBank®**: they sign what they made, with their own passkey, on `sign.333.eco`, and your app gets the **B-Origin℠** record: a signed, timestamped entry in a public log, checkable by anyone with no help from us.

**What a record proves, and what it doesn't.** It proves a passkey signed exactly this claim at this time and that the log can't later remove it. It doesn't prove who imagined the work, or that one person holds one account. A person can trace AI art stroke by stroke.

## In your app

Keep a plain **Download** button, and add **Sign and download** beside it. Signing adds a permanent public record and asks for a passkey, so it's the person's choice each time.

```js
import { beginSign, finishSign, sourceFromHistory } from "@333eco/origin-attest";

// The button. Export once, and pass that file: a second export can change the bytes.
await beginSign(await exportPng(), {
  filename: "my-design.png",
  tool: "my-editor",                                   // your registered name
  source: sourceFromHistory({ imports, mostly: 0.8 }), // how it was made, from your own history
  rights: "CC0-1.0",                                   // optional
});
// The person is now on sign.333.eco, which shows what they are signing and who asked. The file waits on their device, in IndexedDB.
// If this throws, nothing was signed: let them download anyway.
```

On your registered return page, in the browser:

```js
const back = await finishSign();
if (back) {
  back.download();                  // the same bytes they started with
  showAButtonThatCalls(back.download);
  // back.index is the record's number. back.declined means they went back without signing, and it's their file either way.
}
```

Keep that button: a browser may ask first, or refuse a download nobody tapped. Saying the record is on its way is fine, once: *"Signed. It joins the public log within the hour."* ⛔ Never a countdown.

A record joins the log at the next hourly checkpoint. After that, a pack holds it and everything needed to check it later, offline:

```js
const pack = await packFor(back.index);   // { waiting: true } until the checkpoint
```

Nothing has to be embedded in the file. Metadata gets stripped, so the record lives in the log, and a file finds it by what it still is:

```js
const { records } = await findFile(someFile);
// each: { index, how: "exact" | "same pixels" | "similar", distance?, withdrawnAt?, entry }
```

The search reads the public log directly, so nobody learns what was checked.

Every record is real and permanent, test signatures too. A signer can withdraw one, which shows as an event and never as erasure.

## How a work was made

`sourceFromHistory` picks the IPTC digital source type from what your editor knows. It never looks at pixels.

```js
sourceFromHistory({
  imports: [
    { ai: true,  share: 0.35 },   // a template AI helped make: 35% of what can be seen
    { ai: false, share: 0.20 },   // a photo the person uploaded, no AI markers
  ],
  mostly: 0.8,
});
```

| what's in the work | term | shown as |
|---|---|---|
| the person's own tools, and templates made without AI | `digitalCreation` | Made by hand on a device |
| uploads with no AI markers, nothing known to be AI | `composite` | Combined from several works |
| AI assets under `mostly` | `compositeSynthetic` | Combined, partly with AI |
| AI assets at or over `mostly` | `trainedAlgorithmicMedia` | Made with AI |

**What counts as `ai: true`:** an upload carrying AI markers, and anything in your own library that AI helped make, templates and clip art included, however much a person did as well. Tag those assets when you add them. If you don't know how an asset was made, list it with `ai: false`, so the work reads as `composite` and never as made by hand. Leave out only what you know was made without AI.

**`share` is the asset's part of the visible pixels of the finished work.** Count what can still be seen: what was painted over or erased doesn't count, and transparent pixels are in neither side of the fraction, because a graphic on a transparent canvas is the whole picture however small it sits. AI shares add, so cutting one image into pieces changes nothing.

**`mostly`: we recommend 0.8.** Both AI labels say AI is there, so the threshold only decides between *made with* and *combined with*. A wrong *Made with AI* takes credit from someone who did real work; a wrong *Combined, partly with AI* still discloses the AI. So the line sits high, and 0.8 still means real added work, a fifth of what's visible.

**What this can't see.** An upload with no markers may still be AI, which is why `composite` never says otherwise. Someone can trace AI art stroke by stroke, and it reads as `digitalCreation`. A label is what the editor knew, not a finding about the work.

`declared: true` means the person chose the term themselves, and it's shown as what they said.

## What survives what

| a platform does this | the file finds its record as |
|---|---|
| nothing | `exact` |
| strips metadata, re-compresses a PNG | `same pixels` |
| strips a JPEG's metadata, re-encodes as JPEG, scales | `similar` (a hint that two pictures look alike, nothing more) |

`pixels` is exact for PNG only: JPEG and other decoders differ from browser to browser, so those files carry `phash` alone. Prefer PNG where the record matters.

## Not here yet

- C2PA or CAWG embedding (SPEC §5.7). The record doesn't need it, and a stripped file loses it anyway.
- Self-serve registration. Your origin and one return page are added by hand.

CC0.
