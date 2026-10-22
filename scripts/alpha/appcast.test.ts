import { expect, test } from "bun:test";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { appcastXml, keyFromSeed, publicKeyOf, signFile } from "./appcast.mjs";

// What the browser checks, in the same shapes it checks them: a 32-byte raw public key (payload_verifier.cc decodes
// WINSPARKLE_ED_KEY and requires 32 bytes), a 64-byte signature over the whole file, and an appcast whose enclosure
// carries sparkle:version, sparkle:os and sparkle:edSignature.

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const seed = randomBytes(32).toString("base64");

test("the public key is the raw 32 bytes WinSparkle and the update helper decode", () => {
	const raw = Buffer.from(publicKeyOf(keyFromSeed(seed)), "base64");
	expect(raw.length).toBe(32);
});

test("a signature over a file is 64 bytes and verifies with that public key", () => {
	const key = keyFromSeed(seed);
	const file = randomBytes(100_000);
	const signature = Buffer.from(signFile(key, file), "base64");
	expect(signature.length).toBe(64);
	const spki = Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyOf(key), "base64")]);
	const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });
	expect(verify(null, file, publicKey, signature)).toBe(true);
	const tampered = Buffer.from(file);
	tampered[0] = (tampered[0] ?? 0) ^ 1;
	expect(verify(null, tampered, publicKey, signature)).toBe(false);
});

test("the same seed gives the same public key, so the secret and the build agree", () => {
	expect(publicKeyOf(keyFromSeed(seed))).toBe(publicKeyOf(keyFromSeed(seed)));
	expect(() => keyFromSeed(randomBytes(31).toString("base64"))).toThrow("32-byte seed");
});

test("the appcast names the version, the x64 enclosure and its signature", () => {
	const xml = appcastXml({
		version: "0.19.2.13",
		url: "https://github.com/kausthubh-coder/loka/releases/download/v0.19.2.13/Loka-0.19.2.13-windows-x64-mini-installer.exe",
		length: 123456,
		signature: "c2ln",
		notes: "https://github.com/kausthubh-coder/loka/releases/tag/v0.19.2.13",
		date: new Date("2026-10-22T00:00:00Z"),
	});
	expect(xml).toContain('xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"');
	expect(xml).toContain('sparkle:version="0.19.2.13"');
	expect(xml).toContain('sparkle:os="windows-x64"');
	expect(xml).toContain('sparkle:edSignature="c2ln"');
	expect(xml).toContain('length="123456"');
	expect(xml).toContain("<pubDate>Thu, 22 Oct 2026 00:00:00 GMT</pubDate>");
});

test("an alpha label or an http URL is refused: the browser would never offer it", () => {
	const ok = { url: "https://example.com/x.exe", length: 1, signature: "c2ln", notes: "https://example.com" };
	expect(() => appcastXml({ ...ok, version: "0.1.0-alpha.13" })).toThrow("four numbers");
	expect(() => appcastXml({ ...ok, version: "0.19.2.13", url: "http://example.com/x.exe" })).toThrow("https");
});
