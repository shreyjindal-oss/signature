/**
 * Signature demo Worker.
 *
 * Static assets (the signing page) are served from ./public via the ASSETS
 * binding. This Worker only handles the API:
 *
 *   POST /api/sign  -> records a signature event and returns the signer's
 *                      IP address, geolocation (from Cloudflare's edge) and a
 *                      server-side timestamp.
 *
 * On Cloudflare, the IP and location come for free from the incoming request:
 *   - IP:  the `CF-Connecting-IP` header
 *   - Geo: the `request.cf` object (country, city, region, lat/long, etc.)
 * No third-party geolocation API or API key is needed.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/sign" && request.method === "POST") {
      return handleSign(request);
    }

    // Everything else -> static assets (index.html, etc.)
    return env.ASSETS.fetch(request);
  },
};

async function handleSign(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { signature, method, signerName } = body;

  if (!signature || typeof signature !== "string") {
    return json({ error: "Missing signature image" }, 400);
  }

  // Cloudflare populates request.cf on deployed Workers. In `wrangler dev`
  // some fields may be undefined, so we guard every read.
  const cf = request.cf || {};

  const record = {
    // What was captured
    method: method || "unknown", // draw | type | upload
    signerName: signerName || null,

    // Who / where / when
    ip:
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      null,
    location: {
      country: cf.country || null,
      region: cf.region || null,
      city: cf.city || null,
      postalCode: cf.postalCode || null,
      latitude: cf.latitude || null,
      longitude: cf.longitude || null,
      timezone: cf.timezone || null,
      colo: cf.colo || null, // Cloudflare data centre that served the request
    },
    timestamp: new Date().toISOString(), // server clock, UTC — do not trust the browser's
    userAgent: request.headers.get("User-Agent") || null,

    // The signature itself (data URL). In a real system you'd persist this;
    // here we simply echo it back so the demo can show what was captured.
    signatureLength: signature.length,
  };

  return json(record);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
