# Signature demo

A small prototype for capturing a supplier's signature on a digital agreement, with the signer's **IP address**, **geolocation**, and a **server-side timestamp** recorded at the moment they sign.

Built as a Cloudflare Worker so the IP and location come straight from the edge — no third-party geolocation API or API key.

**Live demo:** https://signature-demo.mohit6683.workers.dev/

**Integrating into the website?** See [`INTEGRATION.md`](./INTEGRATION.md) — React component, Jinja path, and the backend IP/location capture. The reusable React field is in [`react/SignatureField.jsx`](./react/SignatureField.jsx).

## What it does

The signing page offers three ways to sign, the same as DocuSign:

- **Draw** — a smooth, pressure/velocity-weighted pad ([signature_pad](https://github.com/szimek/signature_pad), vendored locally). The canvas is scaled by `devicePixelRatio`, so strokes stay crisp on retina screens and when printed.
- **Type** — type your name and pick a handwriting font (Dancing Script, Great Vibes, Sacramento, Homemade Apple). Rendered to an image so the output is consistent with the other modes.
- **Upload** — upload an image of an existing signature.

On **Sign & record**, the browser POSTs the signature image to `/api/sign`, and the Worker returns:

| Field       | Source                                             |
| ----------- | -------------------------------------------------- |
| IP address  | `CF-Connecting-IP` request header                  |
| Location    | `request.cf` (country, region, city, lat/long, tz) |
| Timestamp   | Worker's UTC clock (never the browser's)           |
| User agent  | `User-Agent` request header                        |

## Run it locally

```bash
npm install
npm run dev        # wrangler dev -> http://127.0.0.1:8787
```

In `wrangler dev`, Cloudflare fills `request.cf` with sample data (Austin, TX) and the IP shows as `127.0.0.1`. Deploy to see real signer values.

## Deploy to Cloudflare

```bash
npm run deploy     # wrangler deploy
```

Requires `wrangler login` (or a `CLOUDFLARE_API_TOKEN`) once.

## Project layout

```
public/
  index.html                     signing page (all UI + JS inline)
  vendor/signature_pad.umd.min.js  vendored, no CDN dependency
src/
  index.js                       Worker: serves assets + POST /api/sign
react/
  SignatureField.jsx             reusable React component for the website
wrangler.jsonc                   Worker + static-assets config
INTEGRATION.md                   how to embed the field natively in the site
```

## Notes & next steps

This is a **capture** prototype — it echoes the recorded data back rather than persisting it. For production you'd typically:

- Persist each signature event (e.g. Cloudflare D1 or R2) with the audit fields above.
- Embed the signature into the agreement PDF at print resolution — in Python, [`pyHanko`](https://github.com/MatthiasValvekens/pyHanko) can also hash, digitally sign, and timestamp the PDF so any later edit is detectable.
- Add bot protection on the signing endpoint (Cloudflare Turnstile).

The `request.cf` geolocation is approximate (IP-based) — fine as supporting evidence, not as proof of identity.
