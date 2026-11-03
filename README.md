# @333eco/origin-attest

Lets a person **Sign with HeartBank®**: they sign what they made, with their own passkey, on `sign.333.eco`, and your app gets the **B-Origin℠** record: a signed, timestamped entry in a public log, checkable by anyone with no help from us.

**What a record proves, and what it doesn't.** It proves a passkey signed exactly this claim at this time and that the log can't later remove it. It doesn't prove who imagined the work, or that one person holds one account. A person can trace AI art stroke by stroke.

## In your app

```js
import { claimFor, requestSign, readReturn, packFor, sourceFromHistory } from "@333eco/origin-attest";

const file = await exportPng();                       // your export, as a Blob
const claim = await claimFor(file, {
  tool: "my-editor",                                     // your registered name
  source: sourceFromHistory({ imports, mostly: 0.8 }),// how it was made, from your own history
  rights: "CC0-1.0",                                  // optional: CC0-1.0, CC-BY-4.0, or LicenseRef-All-Rights-Reserved
});
const { url } = await requestSign(claim);             // 403 unless your origin is registered
location.assign(url);                                 // the person signs on sign.333.eco, then follows a link back
```

Back on your registered return page:

```js
const index = readReturn();                           // the record's number
const pack = await packFor(index);                    // { waiting: true } until the next hourly checkpoint
```

A pack holds the record and everything needed to check it later, offline: keep it with the work if you like. Nothing has to be embedded in the file. Metadata gets stripped, so the record lives in the log, and a file finds it by what it still is:

```js
const { records } = await findFile(someFile);
// each: { index, how: "exact" | "same pixels" | "similar", distance?, withdrawnAt?, entry }
```

The search reads the public log directly, so nobody learns what was checked.

## How a work was made

`sourceFromHistory` picks the IPTC digital source type from what your editor saw. It never looks at pixels.

| your history | term | shown as |
|---|---|---|
| your own tools only | `digitalCreation` | Made by hand on a device |
| an import of unknown origin | `composite` | |
| an import carrying AI markers | `compositeSynthetic` | |
| mostly one AI import (`mostly` is your threshold) | `trainedAlgorithmicMedia` | |

`declared: true` means the person chose the term themselves, and it's shown as what they said.

## What survives what

| a platform does this | the file finds its record as |
|---|---|
| nothing | `exact` |
| strips metadata, re-compresses a PNG | `same pixels` |
| re-encodes as JPEG, scales | `similar` (a hint that two pictures look alike, nothing more) |

`pixels` is exact for PNG only: JPEG and other decoders differ from browser to browser, so those files carry `phash` alone.

## Not here yet

- C2PA or CAWG embedding (SPEC §5.7). The record doesn't need it, and a stripped file loses it anyway.
- Self-serve registration. Your origin and return page are added by hand.

CC0.
