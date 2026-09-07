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

## Deploy (for developers)

**Prerequisites:** Node 18+ and a Cloudflare account.

### 1. Authenticate (one time)

For a local machine, log in interactively — this opens a browser to authorize Wrangler:

```bash
npx wrangler login
```

For CI or a headless server, skip the login and provide an API token instead (create it in the Cloudflare dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template):

```bash
export CLOUDFLARE_API_TOKEN=xxxxxxxx   # PowerShell: $env:CLOUDFLARE_API_TOKEN="xxxxxxxx"
```

### 2. Deploy

```bash
npm install
npm run deploy      # = wrangler deploy
```

Wrangler prints the live URL, e.g. `https://signature-demo.<your-subdomain>.workers.dev`. The worker's name (and therefore the subdomain) comes from the `name` field in `wrangler.jsonc` — change it there to rename.

### 3. Custom domain (optional)

To serve it from your own domain instead of `*.workers.dev`, either add a **Custom Domain** to the Worker in the Cloudflare dashboard (Workers & Pages → the worker → Settings → Domains & Routes), or add a route to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "sign.thesqua.re/*", "zone_name": "thesqua.re" }]
```

### 4. Geolocation in production — no setup needed

On the deployed Worker, `request.cf` (country, city, lat/long, timezone) and `CF-Connecting-IP` are populated automatically at the edge — nothing to enable. The Austin, TX / `127.0.0.1` values you see under `wrangler dev` are only local mocks.

> Note: this only applies to *this Worker*. If you instead capture IP/location at a different origin (e.g. a Flask app behind Cloudflare), see the managed-transform note in [`INTEGRATION.md`](./INTEGRATION.md).

### 5. Operate

```bash
wrangler tail                    # stream live logs from the deployed worker
wrangler deployments list        # see deploy history
wrangler rollback [ID]           # roll back to a previous deploy
```

### Optional: deploy from GitHub Actions

Store a `CLOUDFLARE_API_TOKEN` repo secret, then:

```yaml
# .github/workflows/deploy.yml
name: Deploy Worker
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

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
