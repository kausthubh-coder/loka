// Signs a release installer with Loka's EdDSA update key and writes the WinSparkle appcast the browser polls.
//
//   LOKA_EDDSA_PRIVATE_KEY=<seed> node scripts/alpha/appcast.mjs --version 0.19.2.13 \
//     --file dist/Loka-0.19.2.13-windows-x64-mini-installer.exe \
//     --url https://github.com/kausthubh-coder/loka/releases/download/v0.19.2.13/Loka-0.19.2.13-windows-x64-mini-installer.exe \
//     --out dist/appcast.xml
//   node scripts/alpha/appcast.mjs generate-key        prints a new private seed and its public key, once
//
// The private key is the same format `winsparkle-tool generate-key` writes: the base64 of a 32-byte Ed25519 seed, one
// line. The public key (base64 of the 32 raw bytes) is what build.py bakes into the browser as WINSPARKLE_ED_KEY, and
// the signature is Ed25519 over the whole file, base64, 64 bytes: what third_party/winsparkle/src/signatureverifier.cpp
// and chrome/installer/helium_update_helper/payload_verifier.cc check.
//
// The browser compares sparkle:version with its Helium version (0.19.2.<revision.txt>), so --version must be that
// four-part number, not an alpha label.

import { createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// DER prefixes that wrap a raw Ed25519 seed (PKCS#8) and raw public key (SPKI), from RFC 8410.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** @param {string} seedBase64 the private key as winsparkle-tool stores it */
export function keyFromSeed(seedBase64) {
	const seed = Buffer.from(seedBase64.trim(), "base64");
	if (seed.length !== 32) throw new Error(`the private key must be a base64 32-byte seed, got ${seed.length} bytes`);
	return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
}

/** The base64 public key for WINSPARKLE_ED_KEY. @param {import("node:crypto").KeyObject} privateKey */
export function publicKeyOf(privateKey) {
	const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
	return spki.subarray(SPKI_PREFIX.length).toString("base64");
}

/** The sparkle:edSignature for a file. @param {import("node:crypto").KeyObject} privateKey @param {Buffer} bytes */
export const signFile = (privateKey, bytes) => sign(null, bytes, privateKey).toString("base64");

/**
 * @param {{ version: string, url: string, length: number, signature: string, notes: string, date?: Date }} item
 */
export function appcastXml({ version, url, length, signature, notes, date = new Date() }) {
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(
			`version must be four numbers like 0.19.2.13 (the Helium version the browser reports), got ${version}`,
		);
	}
	if (!url.startsWith("https://")) throw new Error("WinSparkle refuses a download URL that isn't https");
	/** @param {string} s */
	const xmlText = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
	return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Loka</title>
    <item>
      <title>Loka ${version}</title>
      <pubDate>${date.toUTCString()}</pubDate>
      <sparkle:releaseNotesLink>${xmlText(notes)}</sparkle:releaseNotesLink>
      <enclosure url="${xmlText(url)}" sparkle:version="${version}" sparkle:os="windows-x64" length="${length}" type="application/octet-stream" sparkle:edSignature="${signature}"/>
    </item>
  </channel>
</rss>
`;
}

function main() {
	const argv = process.argv.slice(2);
	if (argv[0] === "generate-key") {
		const seed = randomBytes(32).toString("base64");
		console.log(`private key (LOKA_EDDSA_PRIVATE_KEY, keep it secret):\n${seed}\n`);
		console.log(`public key (WINSPARKLE_ED_KEY, goes in the build):\n${publicKeyOf(keyFromSeed(seed))}`);
		return;
	}
	/** @param {string} name */
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		const value = i < 0 ? undefined : argv[i + 1];
		if (!value) {
			console.error(
				"Usage: node scripts/alpha/appcast.mjs --version <a.b.c.d> --file <installer> --url <https url> --out <appcast.xml>",
			);
			process.exit(1);
		}
		return value;
	};
	const version = arg("version");
	const file = arg("file");
	const url = arg("url");
	const out = arg("out");
	const seed = process.env.LOKA_EDDSA_PRIVATE_KEY;
	if (!seed) {
		console.error("LOKA_EDDSA_PRIVATE_KEY isn't set; the appcast needs the update signing key.");
		process.exit(1);
	}
	const privateKey = keyFromSeed(seed);
	// A signature only helps if the browser was built with this key's public half.
	const built = process.env.WINSPARKLE_ED_KEY;
	if (built && built.trim() !== publicKeyOf(privateKey)) {
		console.error(
			`LOKA_EDDSA_PRIVATE_KEY's public key is ${publicKeyOf(privateKey)}, but the build has WINSPARKLE_ED_KEY=${built}: browsers built with that key would refuse this update.`,
		);
		process.exit(1);
	}
	const bytes = readFileSync(file);
	const xml = appcastXml({
		version,
		url,
		length: statSync(file).size,
		signature: signFile(privateKey, bytes),
		notes: `https://github.com/kausthubh-coder/loka/releases/tag/v${version}`,
	});
	writeFileSync(out, xml);
	console.log(`${out}: ${version}, ${bytes.length} bytes, public key ${publicKeyOf(privateKey)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
