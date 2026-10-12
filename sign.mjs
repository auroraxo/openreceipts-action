#!/usr/bin/env node
// openreceipts-action: sign an openreceipts/v1 release receipt. Zero deps.
//
// Inputs (env):
//   OPENRECEIPTS_KEY   Ed25519 private key: PEM PKCS8 or base64 raw 32-byte seed (required)
//   GH_REPO            owner/repo (required)
//   RELEASE_TAG        git tag of the published release
//   RELEASE_URL        html url of the release
//   INPUT_ISSUER       issuer override (default: repo owner)
//   INPUT_PATH         output path override (default: receipts/release-<tag>.json)
//
// Outputs: GITHUB_OUTPUT (receipt-path, pubkey) + the receipt file on disk.
// The receipt is self-contained; verification needs no network (see
// auroraxo/openreceipts verify.mjs / receipt.py).

import {
  createPrivateKey,
  createPublicKey,
  sign as edSign,
} from "node:crypto";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendFileSync } from "node:fs";

const SCHEMA = "openreceipts/v1";

function pyEsc(str) {
  let out = "";
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7e) {
      if (cp > 0xffff) {
        const v = cp - 0x10000;
        out += "\\u" + (0xd800 + (v >> 10)).toString(16).padStart(4, "0");
        out += "\\u" + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
      } else {
        out += "\\u" + cp.toString(16).padStart(4, "0");
      }
    } else out += ch;
  }
  return out;
}

// Python-compatible canonical: json.dumps(sort_keys=True, separators=(",",":"))
function canonical(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (typeof v === "object") {
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => pyEsc(JSON.stringify(k)) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  }
  if (typeof v === "string") return pyEsc(JSON.stringify(v));
  return JSON.stringify(v);
}

function loadPrivateKey(keyInput) {
  const s = keyInput.trim();
  if (s.includes("BEGIN")) {
    return createPrivateKey({ key: s, format: "pem", type: "pkcs8" });
  }
  const raw = Buffer.from(s, "base64");
  if (raw.length !== 32)
    throw new Error("key is neither a PEM nor a base64 raw 32-byte seed");
  // PKCS8(Ed25519) = fixed 16-byte prefix + 32-byte seed
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    raw,
  ]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function rawPubkey(priv) {
  const jwk = createPublicKey(priv).export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const keyInput = process.env.OPENRECEIPTS_KEY;
if (!keyInput) fail("OPENRECEIPTS_KEY is not set (pass your private key as input `key`)");

const repo = process.env.GH_REPO;
if (!repo || !repo.includes("/")) fail(`GH_REPO is not a repo: ${repo}`);

const [owner] = repo.split("/");
const issuer = process.env.INPUT_ISSUER || owner;
const tag = process.env.RELEASE_TAG || "untagged";
const outPath =
  process.env.INPUT_PATH || join("receipts", `release-${tag}.json`);

let priv;
try {
  priv = loadPrivateKey(keyInput);
} catch (err) {
  fail(`cannot load private key: ${err.message}`);
}
const pubRaw = rawPubkey(priv);

const receipt = {
  schema: SCHEMA,
  issuer,
  type: "release",
  subject: repo,
  issued_at: new Date().toISOString(),
  claims: {
    version: tag,
    ...(process.env.RELEASE_URL ? { url: process.env.RELEASE_URL } : {}),
  },
};

const bodyBytes = Buffer.from(canonical(receipt), "utf8");
const sig = edSign(null, bodyBytes, priv);
const doc = {
  receipt,
  pubkey: pubRaw.toString("base64"),
  sig: sig.toString("base64"),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");

// self-check: verify what we just wrote
const ok = await import("node:crypto").then(({ verify }) =>
  verify(null, bodyBytes, createPublicKey(priv), sig)
);
if (!ok) fail("self-verification of signature failed");

const digest = createHash("sha256").update(bodyBytes).digest("hex");
console.log(`signed -> ${outPath}`);
console.log(`OK  release/${repo}  version=${tag}  sha256=${digest}`);
console.log(`pubkey: ${doc.pubkey}`);

const out = process.env.GITHUB_OUTPUT;
if (out) {
  appendFileSync(out, `receipt-path=${outPath}\n`);
  appendFileSync(out, `pubkey=${doc.pubkey}\n`);
}
