import {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import SignaturePad from "signature_pad";

/**
 * SignatureField — a native React signature capture field.
 *
 * Three modes (Draw / Type / Upload), always outputs a PNG data URL.
 * It captures only — your form submits the PNG to your own backend, which
 * records IP / location / timestamp and hands the image to your team.
 *
 * Install the one dependency:  npm install signature_pad
 * Load the cursive fonts once in your app (index.html or a global CSS):
 *   <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&family=Homemade+Apple&display=swap" rel="stylesheet" />
 *
 * Props
 *   signerName          (string, optional)  controlled name; needed for Type mode
 *   onSignerNameChange  (fn, optional)      setter when name is controlled
 *   onChange            (fn, optional)      called with { dataUrl, method } | null on every change
 *   height              (number)            pad height in px (default 200)
 *   penColor            (string)            ink colour (default "#101828")
 *
 * Ref API (use this on submit)
 *   ref.current.getSignature()  -> { dataUrl, method } | null
 *   ref.current.clear()
 *
 * Example
 *   const sigRef = useRef(null);
 *   const [name, setName] = useState("");
 *   async function submit() {
 *     const sig = sigRef.current.getSignature();
 *     if (!sig) return alert("Please add a signature");
 *     await fetch(`/api/agreements/${id}/sign`, {
 *       method: "POST",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({ signaturePng: sig.dataUrl, method: sig.method, signerName: name }),
 *     });
 *   }
 *   <SignatureField ref={sigRef} signerName={name} onSignerNameChange={setName} />
 */

const DEFAULT_FONTS = [
  { id: "DancingScript", family: "'Dancing Script', cursive" },
  { id: "GreatVibes", family: "'Great Vibes', cursive" },
  { id: "Sacramento", family: "'Sacramento', cursive" },
  { id: "HomemadeApple", family: "'Homemade Apple', cursive" },
];

const SignatureField = forwardRef(function SignatureField(props, ref) {
  const {
    signerName,
    onSignerNameChange,
    onChange,
    height = 200,
    penColor = "#101828",
    fonts = DEFAULT_FONTS,
  } = props;

  const nameControlled = signerName !== undefined;
  const [internalName, setInternalName] = useState("");
  const name = nameControlled ? signerName : internalName;
  const setName = nameControlled ? onSignerNameChange || (() => {}) : setInternalName;

  const [tab, setTab] = useState("draw");
  const [font, setFont] = useState(fonts[0].id);
  const [uploadUrl, setUploadUrl] = useState(null);

  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const fileRef = useRef(null);

  // Keep latest values available to stable event handlers.
  const stateRef = useRef({});
  stateRef.current = { tab, name, font, fonts, uploadUrl };

  const fontFamily = (id) => (fonts.find((f) => f.id === id) || fonts[0]).family;

  // ---- signature -> PNG for the current mode ----
  function typedSignatureDataURL() {
    const value = (stateRef.current.name || "").trim();
    if (!value) return null;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = 600;
    const h = 200;
    const c = document.createElement("canvas");
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = penColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 72;
    do {
      ctx.font = size + "px " + fontFamily(stateRef.current.font);
      if (ctx.measureText(value).width <= w - 40) break;
      size -= 2;
    } while (size > 18);
    ctx.fillText(value, w / 2, h / 2);
    return c.toDataURL("image/png");
  }

  function currentSignature() {
    const s = stateRef.current;
    if (s.tab === "draw") {
      const pad = padRef.current;
      return !pad || pad.isEmpty() ? null : { dataUrl: pad.toDataURL("image/png"), method: "draw" };
    }
    if (s.tab === "type") {
      const url = typedSignatureDataURL();
      return url ? { dataUrl: url, method: "type" } : null;
    }
    if (s.tab === "upload") {
      return s.uploadUrl ? { dataUrl: s.uploadUrl, method: "upload" } : null;
    }
    return null;
  }

  const emit = () => onChange && onChange(currentSignature());

  // ---- high-DPI canvas (crisp strokes on retina & in print) ----
  function resize() {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.parentElement.getBoundingClientRect();
    const data = pad.toData();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    pad.clear();
    if (data.length) pad.fromData(data);
  }

  // ---- init signature_pad once ----
  useEffect(() => {
    const pad = new SignaturePad(canvasRef.current, {
      penColor,
      minWidth: 0.7,
      maxWidth: 2.6,
      backgroundColor: "rgba(255,255,255,0)",
    });
    padRef.current = pad;
    const onEnd = () => emit();
    pad.addEventListener("endStroke", onEnd);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      pad.removeEventListener("endStroke", onEnd);
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refit when returning to the Draw tab (canvas has layout then).
  useEffect(() => {
    if (tab === "draw") resize();
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Re-emit typed signature as the name/font change.
  useEffect(() => {
    if (tab === "type") emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, font]);

  // ---- upload: normalise anything (JPG, etc.) to PNG ----
  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const c = document.createElement("canvas");
        c.width = img.naturalWidth * ratio;
        c.height = img.naturalHeight * ratio;
        const ctx = c.getContext("2d");
        ctx.scale(ratio, ratio);
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        const png = c.toDataURL("image/png");
        setUploadUrl(png);
        stateRef.current.uploadUrl = png;
        emit();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }

  function clearAll() {
    if (padRef.current) padRef.current.clear();
    setUploadUrl(null);
    stateRef.current.uploadUrl = null;
    if (fileRef.current) fileRef.current.value = "";
    emit();
  }

  useImperativeHandle(ref, () => ({
    getSignature: currentSignature,
    clear: clearAll,
  }));

  // ---- markup ----
  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-selected={tab === id}
      className="sf-tab"
    >
      {label}
    </button>
  );

  return (
    <div className="sf-field">
      <style>{css}</style>

      {!nameControlled && (
        <>
          <label className="sf-label" htmlFor="sf-name">Full name</label>
          <input
            id="sf-name"
            className="sf-input"
            type="text"
            value={name}
            placeholder="e.g. Jane Smith"
            onChange={(e) => setName(e.target.value)}
          />
        </>
      )}

      <div className="sf-tabs" role="tablist">
        {tabBtn("draw", "Draw")}
        {tabBtn("type", "Type")}
        {tabBtn("upload", "Upload")}
      </div>

      {/* DRAW */}
      <div hidden={tab !== "draw"}>
        <div className="sf-box" style={{ height }}>
          <div className="sf-line" />
          <canvas ref={canvasRef} className="sf-canvas" />
        </div>
        <div className="sf-row">
          <button type="button" className="sf-btn" onClick={clearAll}>Clear</button>
          <span className="sf-hint">Sign above the line</span>
        </div>
      </div>

      {/* TYPE */}
      <div hidden={tab !== "type"}>
        <div className="sf-preview" style={{ height, fontFamily: fontFamily(font) }}>
          {name.trim() || "Your name"}
        </div>
        <div className="sf-fonts">
          {fonts.map((f) => (
            <button
              key={f.id}
              type="button"
              className="sf-fontchip"
              aria-selected={font === f.id}
              style={{ fontFamily: f.family }}
              onClick={() => setFont(f.id)}
            >
              Signature
            </button>
          ))}
        </div>
      </div>

      {/* UPLOAD */}
      <div hidden={tab !== "upload"}>
        <label className="sf-box sf-upload" style={{ height }}>
          {uploadUrl ? (
            <img src={uploadUrl} alt="Signature preview" className="sf-uploadimg" />
          ) : (
            <span className="sf-hint">Click to choose an image of your signature</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </label>
      </div>
    </div>
  );
});

const css = `
.sf-field { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1d24; }
.sf-label { display:block; font-weight:600; font-size:13px; margin:0 0 6px; }
.sf-input { width:100%; padding:10px 12px; border:1px solid #e2e5ea; border-radius:8px; font-size:15px; margin-bottom:16px; box-sizing:border-box; }
.sf-tabs { display:flex; gap:6px; margin-bottom:12px; }
.sf-tab { flex:1; padding:9px 0; border:1px solid transparent; border-radius:8px; background:#f0f2f5; font-weight:600; font-size:14px; color:#6b7280; cursor:pointer; }
.sf-tab[aria-selected="true"] { background:#fff; border-color:#2f6fed; color:#2f6fed; }
.sf-box { position:relative; border:1px dashed #c8cdd6; border-radius:10px; background:#fff; overflow:hidden; }
.sf-canvas { display:block; width:100%; height:100%; touch-action:none; }
.sf-line { position:absolute; left:20px; right:20px; bottom:46px; border-bottom:1px solid #d7dbe2; pointer-events:none; }
.sf-row { display:flex; align-items:center; gap:10px; margin-top:10px; }
.sf-row .sf-hint { margin-left:auto; }
.sf-hint { color:#6b7280; font-size:13px; }
.sf-btn { padding:9px 14px; border:1px solid #e2e5ea; border-radius:8px; background:#fff; font-weight:600; font-size:14px; cursor:pointer; }
.sf-preview { display:flex; align-items:center; justify-content:center; border:1px dashed #c8cdd6; border-radius:10px; background:#fff; font-size:44px; padding:0 16px; text-align:center; overflow:hidden; }
.sf-fonts { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
.sf-fontchip { padding:8px 14px; border:1px solid #e2e5ea; border-radius:8px; background:#fff; cursor:pointer; font-size:22px; line-height:1; }
.sf-fontchip[aria-selected="true"] { border-color:#2f6fed; box-shadow:0 0 0 1px #2f6fed; }
.sf-upload { display:flex; align-items:center; justify-content:center; cursor:pointer; }
.sf-uploadimg { max-height:100%; max-width:100%; }
`;

export default SignatureField;
