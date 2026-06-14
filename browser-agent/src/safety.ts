const BLOCKED_SCHEMES = ["javascript:", "file:", "data:", "chrome:", "about:", "view-source:"];

export function assertSafeUrl(input: string, allowedOrigins: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw Object.assign(new Error("Invalid URL."), { statusCode: 400 });
  }
  const lower = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.includes(lower)) {
    throw Object.assign(new Error(`Disallowed URL scheme: ${lower}`), { statusCode: 400 });
  }
  if (lower !== "http:" && lower !== "https:") {
    throw Object.assign(new Error(`Only http(s) URLs are allowed.`), { statusCode: 400 });
  }
  // Block link-local / loopback navigation to reduce SSRF surface on the host.
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw Object.assign(new Error("Refusing to navigate to private/loopback host."), {
      statusCode: 400,
    });
  }
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsed.origin)) {
    throw Object.assign(new Error(`Origin not in allow-list: ${parsed.origin}`), {
      statusCode: 400,
    });
  }
  return parsed;
}
