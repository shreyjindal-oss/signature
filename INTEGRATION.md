# Integrating the signature field into the website

This prototype has two independent parts:

1. **Front-end capture** — a signature field (Draw / Type / Upload) that always outputs a **PNG**. This is the part that becomes a native piece of our page. It is *not* an iframe or a hosted widget.
2. **The IP / location / timestamp record** — captured server-side when the signature is submitted.

The field only *captures* and produces a PNG. Storing the signature and generating the signed PDF are handled by our team downstream.

**Live demo:** https://signature-demo.mohit6683.workers.dev/

---

## React (the target stack)

One dependency, one component file (`react/SignatureField.jsx`).

```bash
npm install signature_pad
```

Load the cursive fonts once, globally (e.g. in `index.html`):

```html
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&family=Homemade+Apple&display=swap" rel="stylesheet" />
```

Use the component and read the PNG on submit through a ref:

```jsx
import { useRef, useState } from "react";
import SignatureField from "./components/SignatureField";

function AgreementForm({ agreementId }) {
  const sigRef = useRef(null);
  const [name, setName] = useState("");

  async function submit() {
    const sig = sigRef.current.getSignature();     // { dataUrl, method } | null
    if (!sig) return alert("Please add a signature");
    await fetch(`/api/agreements/${agreementId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signaturePng: sig.dataUrl,   // data:image/png;base64,...
        method: sig.method,          // "draw" | "type" | "upload"
        signerName: name,
      }),
    });
  }

  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      <SignatureField ref={sigRef} signerName={name} onSignerNameChange={setName} />
      <button onClick={submit}>Sign agreement</button>
    </>
  );
}
```

**Component API**

| Prop / method | Purpose |
| --- | --- |
| `signerName`, `onSignerNameChange` | Controlled name (needed by Type mode). Omit both and the field renders its own name input. |
| `onChange(result \| null)` | Fires on every change; `result = { dataUrl, method }`. |
| `height`, `penColor`, `fonts` | Presentation. |
| `ref.getSignature()` | Returns `{ dataUrl, method }` or `null` — call on submit. |
| `ref.clear()` | Reset the field. |

**JSX runtime:** the file targets the automatic JSX runtime (standard in any new Vite / Next / CRA app). If the bundler uses the classic runtime, add `import React from "react";` at the top.

---

## Jinja (today, before the migration)

No need to wait for React. The demo's `public/index.html` is framework-agnostic HTML + JS — the same pad init, the high-DPI fix, the three modes and the PNG export drop straight into a Jinja template now. Swap in the React component during the migration.

---

## Recording IP / location / timestamp (backend)

The field posts the PNG to our own endpoint; that endpoint records the audit fields. In Flask:

```python
from datetime import datetime, timezone

@app.post("/api/agreements/<agreement_id>/sign")
def sign(agreement_id):
    data = request.get_json()
    png = data["signaturePng"]  # data:image/png;base64,...

    record = {
        "signer":    data.get("signerName"),
        "method":    data.get("method"),
        "ip":        request.headers.get("CF-Connecting-IP", request.remote_addr),
        "country":   request.headers.get("CF-IPCountry"),
        "city":      request.headers.get("CF-IPCity"),        # see note below
        "latitude":  request.headers.get("CF-IPLatitude"),
        "longitude": request.headers.get("CF-IPLongitude"),
        "timezone":  request.headers.get("CF-IPTimezone"),
        "timestamp": datetime.now(timezone.utc).isoformat(),  # server clock, UTC
    }
    # hand `png` + `record` to storage / the PDF step
    return {"ok": True}
```

**Cloudflare note.** The rich geolocation (`request.cf`) that the Worker gets for free is **Worker-only**. At a normal origin behind Cloudflare you get `CF-Connecting-IP` and `CF-IPCountry` by default; for **city / latitude / longitude** enable the **"Add visitor location headers"** Managed Transform in the Cloudflare dashboard (Rules → Transform Rules → Managed Transforms). Two clean options:

- **Enable the managed transform** and capture everything at the Flask origin (above), or
- **Keep the Worker** in this repo purely as the geo/timestamp recorder and call it from the page.

Either way there is no second app embedded in the page.

---

## Output format

Every mode outputs **PNG**:

- **Draw** — `signature_pad`, canvas scaled by `devicePixelRatio` for crisp strokes.
- **Type** — the typed name rendered in a handwriting font to a canvas → PNG.
- **Upload** — any uploaded image (JPG, etc.) is drawn to a canvas and re-exported as PNG.
