import { describe, expect, it } from "vitest";
import {
  authorizationHeader,
  baseString,
  percentEncode,
} from "@/lib/api/photos/smugmug-oauth";

/**
 * What these tests can and cannot prove.
 *
 * They CAN prove the two things that are pure specification and that a bad
 * signature would come from: RFC 3986 encoding, and the RFC 5849 base-string
 * construction (sorting, merging query with oauth params, dropping the query
 * off the URL). Those are the steps that fail silently as a flat 401.
 *
 * They CANNOT prove the credentials work. That needs a live call against the
 * org account, which is NEEDS-FROM-TONY #4 and has not happened. The signature
 * assertion below is a REGRESSION LOCK against a fixed nonce and timestamp —
 * it catches a future change to the signing code, and says nothing about
 * whether SmugMug will accept it.
 */

describe("percentEncode", () => {
  it("encodes the five characters encodeURIComponent leaves alone", () => {
    // This is the whole reason the helper exists. A gallery called
    // "Frozen Jr. (Cast A)" would otherwise sign wrong.
    expect(percentEncode("!'()*")).toBe("%21%27%28%29%2A");
  });

  it("leaves the RFC 3986 unreserved set untouched", () => {
    const unreserved = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    expect(percentEncode(unreserved)).toBe(unreserved);
  });

  it("encodes space as %20, never as +", () => {
    expect(percentEncode("Frozen Jr")).toBe("Frozen%20Jr");
  });

  it("encodes reserved delimiters", () => {
    expect(percentEncode("a&b=c?d/e")).toBe("a%26b%3Dc%3Fd%2Fe");
  });
});

describe("baseString", () => {
  it("is METHOD & encoded-url & encoded-sorted-params", () => {
    expect(baseString("get", "https://api.smugmug.com/api/v2!authuser", { b: "2", a: "1" })).toBe(
      "GET&https%3A%2F%2Fapi.smugmug.com%2Fapi%2Fv2%21authuser&a%3D1%26b%3D2"
    );
  });

  it("sorts by encoded key, not by raw key", () => {
    // '!' encodes to %21 and '%' (0x25) sorts before 'a' (0x61), so the pair
    // list is "%21z=2&a=1". That whole string is then encoded AGAIN into the
    // base string, which is why %21 appears as %2521 here. Sorting the raw
    // keys would put 'a' first and produce a signature SmugMug rejects.
    const out = baseString("GET", "https://x.test/p", { a: "1", "!z": "2" });
    expect(out.endsWith("%2521z%3D2%26a%3D1")).toBe(true);
  });

  it("drops the query off the URL before encoding it", () => {
    // The query is signed via the params map. Leaving it on the URL too would
    // sign it twice, which is the other classic 401.
    const out = baseString("GET", "https://x.test/p?zz=9", { a: "1" });
    expect(out).toBe("GET&https%3A%2F%2Fx.test%2Fp&a%3D1");
  });

  /**
   * The one genuine conformance check in this file.
   *
   * RFC 5849 §3.4.1.1 publishes a worked example and its exact base string.
   * Reproduced here with one parameter removed — the example includes `a3`
   * twice, and a repeated key cannot be expressed in the Record<string,string>
   * this signer takes. That is a real limitation and an acceptable one:
   * SmugMug's v2 API takes no repeated query parameters.
   *
   * Everything else is the RFC's, character for character, so this exercises
   * the encode-sort-encode-again pipeline against a published answer rather
   * than against my own output.
   */
  it("matches the RFC 5849 §3.4.1.1 example base string", () => {
    const out = baseString("POST", "http://example.com/request", {
      a2: "r b",
      b5: "=%3D",
      "c@": "",
      c2: "",
      oauth_consumer_key: "9djdj82h48djs9d2",
      oauth_token: "kkk9d7dh3k39sjv7",
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: "137131201",
      oauth_nonce: "7d8f3e4a",
    });

    expect(out).toBe(
      "POST&http%3A%2F%2Fexample.com%2Frequest&" +
        "a2%3Dr%2520b%26b5%3D%253D%25253D%26c%2540%3D%26c2%3D%26" +
        "oauth_consumer_key%3D9djdj82h48djs9d2%26" +
        "oauth_nonce%3D7d8f3e4a%26" +
        "oauth_signature_method%3DHMAC-SHA1%26" +
        "oauth_timestamp%3D137131201%26" +
        "oauth_token%3Dkkk9d7dh3k39sjv7"
    );
  });
});

describe("authorizationHeader", () => {
  const creds = {
    apiKey: "test-consumer-key",
    apiSecret: "test-consumer-secret",
    oauthToken: "test-token",
    oauthSecret: "test-token-secret",
  };

  it("signs the query string as well as the oauth params", () => {
    // Two URLs differing only in a query parameter must not produce the same
    // signature — if they did, paging would be signed as though it were not
    // there and every page past the first would 401.
    const a = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2/album/X!images?start=1&count=100", "n", "1700000000");
    const b = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2/album/X!images?start=101&count=100", "n", "1700000000");
    expect(a).not.toBe(b);
  });

  it("carries every required oauth parameter", () => {
    const header = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2!authuser", "abc", "1700000000");
    expect(header.startsWith("OAuth ")).toBe(true);
    for (const key of [
      "oauth_consumer_key",
      "oauth_token",
      "oauth_signature_method",
      "oauth_timestamp",
      "oauth_nonce",
      "oauth_version",
      "oauth_signature",
    ]) {
      expect(header).toContain(`${key}="`);
    }
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_version="1.0"');
  });

  it("does not leak query parameters into the header", () => {
    const header = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2/user/novapa!albums?count=100", "abc", "1700000000");
    expect(header).not.toContain("count");
  });

  it("percent-encodes the signature so a + or / in the base64 survives", () => {
    const header = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2!authuser", "abc", "1700000000");
    const sig = /oauth_signature="([^"]+)"/.exec(header)?.[1] ?? "";
    expect(sig).not.toContain("+");
    expect(sig).not.toContain("/");
    expect(sig).not.toContain("=");
  });

  it("is stable for a fixed nonce and timestamp (regression lock, not conformance)", () => {
    const header = authorizationHeader(creds, "GET", "https://api.smugmug.com/api/v2!authuser", "fixednonce", "1700000000");
    expect(/oauth_signature="([^"]+)"/.exec(header)?.[1]).toBe("wZN8DdJYy8HFMukos4%2Fd1X2Bex4%3D");
  });
});
