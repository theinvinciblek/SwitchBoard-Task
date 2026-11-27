// Parses a Cookie header into { name: value }. Malformed pairs are skipped.
export const parseCookies = (header) => {
  const cookies = {};
  if (typeof header !== "string") return cookies;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }

  return cookies;
};
