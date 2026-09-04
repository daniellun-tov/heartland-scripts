/* Heartland - sales console.

   THIS FILE IS THE SOURCE. It used to be built from heartland-sales-console.html
   by build_console.py; that HTML went stale, was found to be missing two shipped
   features, and has been deleted. Edit this file, push, pin the SHA.

   On the page, all that is needed is:

     <style>html,body{margin:0;padding:0;background:#f0eeea}
     @media(prefers-color-scheme:dark){html,body{background:#131311}}</style>
     <script>(function(){try{var p=localStorage.getItem("hl_console_scheme");
     if(p==="light"||p==="dark"){var c=p==="dark"?"#131311":"#f0eeea";
     document.documentElement.style.background=c;
     document.documentElement.style.colorScheme=p;}}catch(e){}}());<\/script>
     <div id="hl-console-host"></div>
     <script src="https://cdn.jsdelivr.net/gh/daniellun-tov/heartland-scripts@<sha>/heartland-console.js" defer><\/script>

   The first style block paints the right ground before this file arrives; the
   inline script is what stops a saved LIGHT choice flashing dark on a dark
   machine (and vice versa) in the moment before the console boots. Neither is
   load-bearing - both only remove a flash.

   To white-label, add data-hl-brand="<slug>" to the host div and a matching entry
   to BRANDS below. Nothing else changes.

   Everything else - every style, every element, every handler - is in here,
   sealed inside a shadow root so the marketing site's stylesheet cannot reach it. */
(function () {
  'use strict';

  var TPL = [
    "<style>",
    "  /* ── THE THEME LAYER ───────────────────────────────────────────────────────────",
    "     Two layers, deliberately.",
    "",
    "     1. SEMANTIC TOKENS are what every rule below reads. Nothing in the component",
    "        CSS names a colour; it names a job - plane, surface, ink, rule, brand.",
    "     2. THE BRAND supplies the values. The Heartland brand is written here as the",
    "        base, in both schemes. A white-label brand supplies overrides for the same",
    "        token names and the script writes them as inline custom properties on the",
    "        host, which beat these rules. So a new brand is a registry entry - never a",
    "        new stylesheet, and never an edit to anything below the token blocks.",
    "",
    "     :root never matches inside a shadow tree, so the tokens live on :host. The",
    "     scheme is resolved to light or dark IN SCRIPT and stamped on the host as",
    "     data-scheme, so there is exactly one source of truth. The stylesheet carries",
    "     no prefers-color-scheme query of its own - it would be a second one. */",
    "",
    "  :host {",
    "    display: block;",
    "    min-height: 100vh;",
    "    color-scheme: light;",
    "",
    "    /* surfaces */",
    "    --plane:#f0eeea;          /* the page behind everything - Off White */",
    "    --surface:#ffffff;        /* cards, drawer */",
    "    --surface-2:#f7f5f2;      /* table head, inset panels */",
    "    --plane-hover:rgba(24,25,26,0.04);",
    "",
    "    /* text */",
    "    --ink:#18191a;            /* Almost Black */",
    "    --ink-2:#5b564c;          /* labels, secondary */",
    "    --ink-muted:#8b8578;      /* placeholders, empty states */",
    "",
    "    /* lines */",
    "    --rule:#dedad2;           /* dividers */",
    "    --ring:rgba(24,25,26,0.10);",
    "    --shadow:0 1px 2px rgba(24,25,26,.05), 0 1px 3px rgba(24,25,26,.04);",
    "    --shadow-lg:0 10px 40px rgba(24,25,26,.16);",
    "",
    "    /* brand. Gold is 2.4:1 on white, so it is a FILL that carries dark text -",
    "       never small text, never a thin border. --accent is the deepened gold that",
    "       interactive text uses instead, and it passes AA on every surface here. */",
    "    --brand:#bfa279;",
    "    --brand-ink:#18191a;      /* 7.3:1 on --brand */",
    "    --brand-soft:rgba(191,162,121,0.16);",
    "    --accent:#836333;         /* 5.5:1 on surface, 4.8:1 on plane */",
    "    --accent-ink:#ffffff;",
    "",
    "    /* status. Each has a text-safe value and, where the accessible colour is too",
    "       dark to scan at 8px, a separate vivid fill for the dot. */",
    "    --good:#1c7a3e;      --good-fill:#1c7a3e;",
    "    --warning:#8a5c00;   --warning-fill:#c98a00;",
    "    --serious:#a8461f;   --serious-fill:#a8461f;",
    "    --critical:#c0271f;  --critical-fill:#c0271f;",
    "    --dot-ring:rgba(24,25,26,0.16);",
    "",
    "    /* shape + type */",
    "    --radius:0.5rem;          /* --radius--medium on the site */",
    "    --radius-sm:0.25rem;      /* --radius--small */",
    "    --font:\"Source Sans 3\", \"Source Sans Pro\", system-ui, -apple-system, \"Segoe UI\", sans-serif;",
    "    --font-display:\"Source Sans 3\", \"Source Sans Pro\", system-ui, -apple-system, \"Segoe UI\", sans-serif;",
    "    --tracking:0.08em;",
    "  }",
    "",
    "  :host([data-scheme=\"dark\"]) {",
    "    color-scheme: dark;",
    "    --plane:#131311;",
    "    --surface:#1b1b19;",
    "    --surface-2:#232320;",
    "    --plane-hover:rgba(255,255,255,0.05);",
    "    --ink:#f5f3ef;",
    "    --ink-2:#b5b0a6;",
    "    --ink-muted:#87827a;",
    "    --rule:#302f2b;",
    "    --ring:rgba(255,255,255,0.11);",
    "    --shadow:0 1px 2px rgba(0,0,0,.4);",
    "    --shadow-lg:0 10px 40px rgba(0,0,0,.55);",
    "    --brand:#bfa279;",
    "    --brand-ink:#18191a;",
    "    --brand-soft:rgba(191,162,121,0.18);",
    "    --accent:#c9b18b;         /* 8.3:1 on surface - gold reads directly on dark */",
    "    --accent-ink:#18191a;",
    "    --good:#4ac26d;      --good-fill:#4ac26d;",
    "    --warning:#e0a836;   --warning-fill:#e0a836;",
    "    --serious:#e08a5a;   --serious-fill:#e08a5a;",
    "    --critical:#f0645c;  --critical-fill:#f0645c;",
    "    --dot-ring:rgba(255,255,255,0.18);",
    "  }",
    "",
    "  /* ── base ─────────────────────────────────────────────────────────────────── */",
    "  * { box-sizing:border-box; }",
    "  :host {",
    "    background:var(--plane); color:var(--ink);",
    "    font:15px/1.5 var(--font);",
    "    -webkit-font-smoothing:antialiased;",
    "  }",
    "  .wrap { max-width:1280px; margin:0 auto; padding:20px 20px 72px; }",
    "  .card {",
    "    background:var(--surface); border:1px solid var(--ring);",
    "    border-radius:var(--radius); box-shadow:var(--shadow);",
    "  }",
    "  h1 { font:600 1.15rem/1.25 var(--font-display); margin:0; letter-spacing:-0.01em; }",
    "  h2 { font:600 .95rem/1.3 var(--font-display); margin:0 0 10px; }",
    "  a { color:var(--accent); }",
    "  label { display:block; font-size:.8125rem; color:var(--ink-2); margin-bottom:5px; }",
    "  input, select, textarea {",
    "    width:100%; padding:9px 11px; font:inherit; color:var(--ink);",
    "    background:var(--surface); border:1px solid var(--rule);",
    "    border-radius:var(--radius-sm);",
    "  }",
    "  :host([data-scheme=\"dark\"]) input,",
    "  :host([data-scheme=\"dark\"]) select,",
    "  :host([data-scheme=\"dark\"]) textarea { background:var(--plane); }",
    "  input::placeholder, textarea::placeholder { color:var(--ink-muted); }",
    "  input:focus, select:focus, textarea:focus { outline:2px solid var(--accent); outline-offset:1px; }",
    "  button {",
    "    font:inherit; padding:8px 14px; border-radius:var(--radius-sm); cursor:pointer;",
    "    border:1px solid var(--ring); background:var(--surface); color:var(--ink);",
    "    transition:background .12s ease, border-color .12s ease, color .12s ease;",
    "  }",
    "  button:hover { border-color:var(--rule); background:var(--surface-2); }",
    "  /* The primary action wears the brand. Gold carries dark text, never white. */",
    "  button.primary { background:var(--brand); border-color:transparent; color:var(--brand-ink); font-weight:600; }",
    "  button.primary:hover { background:var(--brand); filter:brightness(1.06); }",
    "  button.danger { color:var(--critical); border-color:var(--critical); background:transparent; }",
    "  button.danger:hover { background:color-mix(in srgb, var(--critical) 10%, transparent); border-color:var(--critical); }",
    "  /* Outlined and in the accent, for an action that shows rather than changes. The",
    "     solid button in this drawer is the one that ends a deal; nothing safe should",
    "     look like it. */",
    "  button.ghost { background:transparent; border-color:var(--accent); color:var(--accent); font-weight:600; }",
    "  button.ghost:hover { background:var(--brand-soft); border-color:var(--accent); }",
    "  button[disabled] { opacity:.5; cursor:default; }",
    "  button:focus-visible, [tabindex]:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }",
    "  .row { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }",
    "  .err { color:var(--critical); font-size:.8125rem; min-height:1.2em; }",
    "  .ok { color:var(--good); font-size:.8125rem; min-height:1.2em; }",
    "  .muted { color:var(--ink-muted); }",
    "  .mono { font-variant-numeric:tabular-nums; }",
    "",
    "  /* ── the brand mark ───────────────────────────────────────────────────────── */",
    "  /* White-label note: the wordmark reads its text from data-brand-label on the",
    "     host, so a rebrand changes no markup. */",
    "",
    "  /* ── the scheme switch ────────────────────────────────────────────────────── */",
    "  .schemeswitch {",
    "    display:inline-flex; align-items:center; padding:2px; gap:2px;",
    "    background:var(--surface-2); border:1px solid var(--ring);",
    "    border-radius:var(--radius-sm);",
    "  }",
    "  .schemeswitch button {",
    "    border:0; background:none; padding:5px 10px; border-radius:calc(var(--radius-sm) - 1px);",
    "    font-size:.75rem; font-weight:500; color:var(--ink-2); line-height:1.4;",
    "  }",
    "  .schemeswitch button:hover { background:var(--plane-hover); color:var(--ink); }",
    "  .schemeswitch button[aria-pressed=\"true\"] {",
    "    background:var(--surface); color:var(--ink); font-weight:600;",
    "    box-shadow:var(--shadow);",
    "  }",
    "",
    "  /* ── login ────────────────────────────────────────────────────────────────── */",

    "",
    "  /* ── header ───────────────────────────────────────────────────────────────── */",
    "  header.top {",
    "    display:flex; align-items:flex-start; justify-content:space-between;",
    "    gap:16px; flex-wrap:wrap; margin-bottom:14px;",
    "  }",
    "  header.top .row { align-items:center; }",
    "  .who { font-size:.8125rem; color:var(--ink-2); margin-top:2px; }",
    "  nav.tabs { display:flex; gap:4px; margin-bottom:16px; border-bottom:1px solid var(--rule); }",
    "  nav.tabs button {",
    "    border:0; background:none; border-radius:0; padding:9px 14px;",
    "    color:var(--ink-2); border-bottom:2px solid transparent; margin-bottom:-1px;",
    "  }",
    "  nav.tabs button:hover { background:none; color:var(--ink); }",
    "  nav.tabs button[aria-selected=\"true\"] { color:var(--ink); border-bottom-color:var(--brand); font-weight:600; }",
    "  .count {",
    "    display:inline-block; margin-left:6px; font-size:.75rem; padding:0 6px;",
    "    border-radius:20px; background:var(--rule); color:var(--ink-2);",
    "    font-variant-numeric:tabular-nums;",
    "  }",
    "  .count.hot { background:var(--critical); color:#fff; }",
    "",
    "  /* ── today ────────────────────────────────────────────────────────────────── */",
    "  .group { margin-bottom:18px; padding:16px; }",
    "  .group h2 { display:flex; align-items:center; gap:8px; }",
    "  .group .why { font-size:.8125rem; color:var(--ink-2); margin:-4px 0 12px; }",
    "  .item {",
    "    display:flex; gap:12px; align-items:baseline; justify-content:space-between;",
    "    padding:9px 0; border-bottom:1px solid var(--rule); flex-wrap:wrap;",
    "  }",
    "  .item:last-child { border-bottom:0; }",
    "  .item .lead { font-weight:600; }",
    "  .item .meta { font-size:.8125rem; color:var(--ink-2); }",
    "  .none { color:var(--ink-muted); font-size:.875rem; padding:4px 0; }",
    "",
    "  /* ── filters + table ──────────────────────────────────────────────────────── */",
    "  .filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:12px; }",
    "  .filters .f { min-width:150px; }",
    "  .filters .f.grow { flex:1 1 220px; }",
    "  /* A capped height so the head can stick. A pipeline is long and the column",
    "     names are what tell you which number you are reading. */",
    "  .tablewrap { overflow:auto; max-height:70vh; }",
    "  table { width:100%; border-collapse:separate; border-spacing:0; font-size:.875rem; }",
    "  th,td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--rule); vertical-align:top; }",
    "  th {",
    "    position:sticky; top:0; z-index:1;",
    "    font-size:.6875rem; text-transform:uppercase; letter-spacing:var(--tracking);",
    "    color:var(--ink-2); font-weight:600; white-space:nowrap;",
    "    background:var(--surface-2);",
    "  }",
    "  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }",
    "  tbody tr { cursor:pointer; }",
    "  tbody tr:hover td { background:var(--brand-soft); }",
    "  tbody tr:last-child td { border-bottom:0; }",
    "",
    "  /* ── status + pills ───────────────────────────────────────────────────────── */",
    "  .pill { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }",
    "  /* The ring keeps a dot legible on any surface, so the dot never has to carry",
    "     the meaning on colour alone. */",
    "  .dot {",
    "    width:8px; height:8px; border-radius:50%; background:var(--ink-muted);",
    "    flex:0 0 auto; box-shadow:inset 0 0 0 1px var(--dot-ring);",
    "  }",
    "  .s-confirmed .dot { background:var(--good-fill); }",
    "  .s-awaiting_payment .dot,.s-awaiting_clearance .dot,.s-held .dot { background:var(--warning-fill); }",
    "  .s-payment_failed .dot { background:var(--serious-fill); }",
    "  .s-cancelled .dot,.s-refunded .dot { background:var(--critical-fill); }",
    "  .tag {",
    "    display:inline-block; font-size:.75rem; border:1px solid var(--rule);",
    "    border-radius:20px; padding:1px 8px; color:var(--ink-2); white-space:nowrap;",
    "    font-variant-numeric:tabular-nums;",
    "  }",
    "  .tag.crit { color:var(--critical); border-color:var(--critical); background:color-mix(in srgb, var(--critical) 8%, transparent); }",
    "  .tag.warn { color:var(--warning); border-color:var(--warning); background:color-mix(in srgb, var(--warning) 10%, transparent); }",
    "",
    "  /* ── drawer ───────────────────────────────────────────────────────────────── */",
    "  .scrim { position:fixed; inset:0; background:rgba(0,0,0,.42); display:none; }",
    "  :host([data-scheme=\"dark\"]) .scrim { background:rgba(0,0,0,.66); }",
    "  .scrim.open { display:block; }",
    "  .drawer {",
    "    position:fixed; top:0; right:0; bottom:0; width:min(580px,100%);",
    "    background:var(--surface); border-left:1px solid var(--ring); padding:22px;",
    "    overflow-y:auto; transform:translateX(100%);",
    "    transition:transform .22s cubic-bezier(.4,0,.2,1); box-shadow:var(--shadow-lg);",
    "  }",
    "  .drawer.open { transform:none; }",
    "  .drawer header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:4px; }",
    "  .dl { display:grid; grid-template-columns:auto 1fr; gap:6px 16px; font-size:.875rem; margin:10px 0 18px; }",
    "  .dl dt { color:var(--ink-2); }",
    "  .dl dd { margin:0; }",
    "  .sect { border-top:1px solid var(--rule); padding-top:16px; margin-top:16px; }",
    "  .sect h2 {",
    "    font-size:.6875rem; text-transform:uppercase; letter-spacing:var(--tracking);",
    "    color:var(--ink-2); font-weight:600;",
    "  }",
    "  /* OTP link. Sales need to hand this to a buyer who has lost it, so the whole",
    "     row is one obvious copy affordance rather than a link buried in prose. */",
    "  .otprow { display:flex; gap:8px; align-items:center; margin:10px 0 8px; }",
    "  .otprow input {",
    "    flex:1 1 auto; min-width:0; font-size:.75rem; padding:7px 9px;",
    "    border:1px solid var(--ring); border-radius:var(--radius-sm);",
    "    background:var(--surface-2); color:var(--ink-2);",
    "  }",
    "  .otprow button { flex:0 0 auto; }",
    "  .otprow a { flex:0 0 auto; font-size:.8125rem; color:var(--ink-2); }",
    "  .stagebar { display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 4px; }",
    "  .step {",
    "    font-size:.75rem; padding:3px 9px; border-radius:20px;",
    "    border:1px solid var(--rule); color:var(--ink-muted);",
    "  }",
    "  .step.done { color:var(--ink-2); border-color:var(--ink-2); }",
    "  .step.now { background:var(--brand); border-color:transparent; color:var(--brand-ink); font-weight:600; }",
    "  .step.skip { opacity:.55; text-decoration:line-through; }",
    "  .hide { display:none !important; }",
    "  .spin { color:var(--ink-muted); font-size:.8125rem; }",
    "",
    "  @media (max-width: 640px) {",
    "    .wrap { padding:14px 14px 60px; }",
    "    .drawer { padding:16px; }",
    "    .tablewrap { max-height:none; }",
    "    th { position:static; }",
    "  }",
    "  @media (prefers-reduced-motion: reduce) {",
    "    .drawer { transition:none; }",
    "    button { transition:none; }",
    "  }",
    "",
    "  /* ── DATA VISUALISATION ────────────────────────────────────────────────────────",
    "     Every chart here is plain HTML and CSS. No SVG, no library. Bars are divs whose",
    "     width or height is a percentage, which means labels are real text at real size,",
    "     the layout is responsive for free, and hit targets are ordinary elements. An SVG",
    "     with a fixed viewBox would scale its type down with the card and end up with 8px",
    "     axis labels in a narrow column.",
    "",
    "     THE RAMP IS ORDINAL, NOT CATEGORICAL. The funnel's stages have an order -",
    "     swapping two of them would change the meaning - so they take a single hue in",
    "     monotone lightness steps rather than six identities. Both ramps were generated in",
    "     OKLCH at the brand's own hue (76 deg) and validated: monotone lightness, adjacent",
    "     delta-L >= 0.06, single hue, and the low-contrast end clearing 2:1 on its surface",
    "     (2.05:1 light, 2.33:1 dark). More-is-darker in light; the anchor flips in dark.",
    "",
    "     Nominal charts - value by property, reservations by month - are ONE series and",
    "     therefore one colour. Colouring those bars by their own value would spend the",
    "     identity channel re-encoding what the bar length already says. */",
    "  :host {",
    "    --viz-1:#d1b082; --viz-2:#be9965; --viz-3:#ab8347;",
    "    --viz-4:#976d28; --viz-5:#845800; --viz-6:#6c4500;",
    "    --viz-solo:#ab8347;                 /* 3.46:1 on the card surface */",
    "    --viz-grid:#ece9e3;",
    "    --viz-track:#f2efe9;",
    "  }",
    "  :host([data-scheme=\"dark\"]) {",
    "    --viz-1:#724f10; --viz-2:#8b6321; --viz-3:#a47935;",
    "    --viz-4:#ba9051; --viz-5:#cfa870; --viz-6:#e1c296;",
    "    --viz-solo:#a47935;                 /* 4.41:1 on the dark card surface */",
    "    --viz-grid:#2a2926;",
    "    --viz-track:#242320;",
    "  }",
    "",
    "  /* ── dashboard shell ──────────────────────────────────────────────────────── */",
    "  /* One filter row above everything it scopes - never a filter inside a chart card,",
    "     which would leave two charts on screen showing different slices of the data. */",
    "  .dashfilters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:14px; }",
    "  .dashfilters .f { min-width:180px; }",
    "  .dashnote {",
    "    display:flex; gap:10px; align-items:center; flex-wrap:wrap;",
    "    font-size:.8125rem; color:var(--ink-2); background:var(--brand-soft);",
    "    border:1px solid var(--ring); border-radius:var(--radius-sm);",
    "    padding:9px 12px; margin-bottom:14px;",
    "  }",
    "  .dashnote button { padding:4px 10px; font-size:.8125rem; }",
    "",
    "  .kpis {",
    "    display:grid; grid-template-columns:repeat(auto-fit,minmax(158px,1fr));",
    "    gap:12px; margin-bottom:16px;",
    "  }",
    "  /* Stat tile: label, value, note. The value is proportional-figure, not tabular -",
    "     equal-width digits make a standalone number look loose at display sizes. */",
    "  .kpi { padding:14px 16px; }",
    "  .kpi .k-label { font-size:.75rem; color:var(--ink-2); margin-bottom:4px; }",
    "  .kpi .k-value { font:600 1.65rem/1.1 var(--font); letter-spacing:-0.02em; }",
    "  .kpi .k-note { font-size:.75rem; color:var(--ink-muted); margin-top:3px; }",
    "  .kpi.is-link { cursor:pointer; }",
    "  .kpi.is-link:hover { border-color:var(--accent); }",
    "  .kpi.alarm .k-value { color:var(--critical); }",
    "  .kpi.warnish .k-value { color:var(--warning); }",
    "",
    "  .charts { display:grid; grid-template-columns:1fr; gap:16px; }",
    "  @media (min-width: 900px) { .charts { grid-template-columns:repeat(2,minmax(0,1fr)); } }",
    "  .charts .wide { grid-column:1 / -1; }",
    "  .chart { padding:16px; }",
    "  .chart h2 { margin:0 0 2px; }",
    "  .chart .sub { font-size:.8125rem; color:var(--ink-2); margin:0 0 14px; }",
    "  .chart .chead { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    "  /* Not a filter - an accessibility twin. Every chart's values are reachable as text",
    "     without hovering anything. */",
    "  .tbtn { flex:0 0 auto; padding:3px 9px; font-size:.75rem; color:var(--ink-2); }",
    "  .vtable { width:100%; margin-top:12px; font-size:.8125rem; }",
    "  .vtable th { position:static; background:none; padding:6px 8px 6px 0; }",
    "  .vtable td { padding:6px 8px 6px 0; border-bottom:1px solid var(--rule); }",
    "  .vtable td.num { text-align:right; }",
    "",
    "  /* ── horizontal bars ──────────────────────────────────────────────────────── */",
    "  .hbars { display:flex; flex-direction:column; gap:10px; }",
    "  .hbar { display:grid; grid-template-columns:minmax(90px,34%) 1fr auto; gap:10px; align-items:center; }",
    "  .hbar .h-label { font-size:.8125rem; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
    "  .hbar .h-track { background:var(--viz-track); border-radius:0 4px 4px 0; height:14px; }",
    "  /* 4px rounded at the data end, square at the baseline - the bar grows from a line,",
    "     it does not float. */",
    "  .hbar .h-fill { height:14px; border-radius:0 4px 4px 0; background:var(--viz-solo); }",
    "  .hbar .h-val { font-size:.8125rem; font-variant-numeric:tabular-nums; color:var(--ink); white-space:nowrap; }",
    "  .hbar .h-val small { color:var(--ink-muted); font-size:.75rem; }",
    "  .hbar:hover .h-fill { filter:brightness(1.08); }",
    "",
    "  /* ── columns ──────────────────────────────────────────────────────────────── */",
    "  .cols { position:relative; }",
    "  .cols-plot { display:flex; align-items:flex-end; gap:6px; height:132px; position:relative; }",
    "  /* Hairline, solid, one step off the surface. Never dashed - dashing reads as",
    "     \"threshold\" when it is only a grid. */",
    "  .cols-grid { position:absolute; left:0; right:0; top:0; bottom:0; pointer-events:none; }",
    "  .cols-grid i { position:absolute; left:0; right:0; height:1px; background:var(--viz-grid); }",
    "  .cols-grid b {",
    "    position:absolute; right:0; font:400 .6875rem/1 var(--font);",
    "    font-variant-numeric:tabular-nums; color:var(--ink-muted);",
    "    transform:translateY(-100%); padding-bottom:2px; background:var(--surface); padding-left:4px;",
    "  }",
    "  .col { flex:1 1 0; display:flex; flex-direction:column; justify-content:flex-end;",
    "         align-items:center; height:100%; position:relative; min-width:0; }",
    "  .col .c-bar { width:100%; max-width:24px; border-radius:4px 4px 0 0; background:var(--viz-solo); }",
    "  .col:hover .c-bar { filter:brightness(1.08); }",
    "  .cols-x { display:flex; gap:6px; margin-top:7px; }",
    "  .cols-x span {",
    "    flex:1 1 0; text-align:center; font-size:.6875rem; color:var(--ink-muted);",
    "    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;",
    "  }",
    "",
    "  /* ── stacked bar ──────────────────────────────────────────────────────────── */",
    "  /* 2px of surface between segments - the gap is what separates them, never a stroke",
    "     drawn round each one. */",
    "  .stack { display:flex; gap:2px; height:18px; border-radius:4px; overflow:hidden; margin-bottom:12px; }",
    "  .stack i { display:block; min-width:3px; }",
    "  .stack i:first-child { border-radius:4px 0 0 4px; }",
    "  .stack i:last-child { border-radius:0 4px 4px 0; }",
    "  .legend { display:flex; flex-wrap:wrap; gap:6px 16px; }",
    "  .legend .lg { display:flex; align-items:center; gap:7px; font-size:.8125rem; color:var(--ink-2); }",
    "  /* Identity comes from the swatch beside the text, never from colouring the text -",
    "     a light step is illegible as type on the surface. */",
    "  .legend .sw { width:10px; height:10px; border-radius:3px; flex:0 0 auto; }",
    "  .legend .lv { color:var(--ink); font-variant-numeric:tabular-nums; font-weight:600; }",
    "",
    "  /* ── tooltip ──────────────────────────────────────────────────────────────── */",
    "  /* Enhances, never gates: every value here is also a direct label or a table row. */",
    "  .viztip {",
    "    position:fixed; z-index:40; pointer-events:none; opacity:0;",
    "    transform:translate(-50%,-120%); transition:opacity .1s ease;",
    "    background:var(--ink); color:var(--surface); font-size:.75rem; line-height:1.35;",
    "    padding:6px 9px; border-radius:var(--radius-sm); white-space:nowrap;",
    "    box-shadow:var(--shadow-lg); max-width:260px;",
    "  }",
    "  .viztip.on { opacity:1; }",
    "  [data-tip] { cursor:default; }",
    "  [data-tip]:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:3px; }",
    "",
    "  .emptyviz { color:var(--ink-muted); font-size:.875rem; padding:18px 0; }",
    "",
    "  /* ── icon button + settings modal ─────────────────────────────────────────── */",
    "  .iconbtn {",
    "    width:38px; height:38px; padding:0; display:inline-flex;",
    "    align-items:center; justify-content:center; flex:0 0 auto;",
    "  }",
    "  .iconbtn svg { width:17px; height:17px; display:block; }",

    "",
    "  .modal { position:fixed; inset:0; z-index:50; display:none; }",
    "  .modal.open { display:block; }",
    "  .modal-scrim { position:absolute; inset:0; background:rgba(0,0,0,.42); }",
    "  :host([data-scheme=\"dark\"]) .modal-scrim { background:rgba(0,0,0,.66); }",
    "  .modal-panel {",
    "    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);",
    "    width:min(420px,calc(100% - 32px)); background:var(--surface);",
    "    border:1px solid var(--ring); border-radius:var(--radius);",
    "    box-shadow:var(--shadow-lg); padding:20px;",
    "  }",
    "  .modal-panel header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; }",
    "  .modal-panel h2 { margin:0; font-size:1rem; }",
    "  .setrow + .setrow { border-top:1px solid var(--rule); margin-top:16px; padding-top:16px; }",
    "  .setrow .schemeswitch { margin-top:10px; }",
    "  .setrow .s-label { font-size:.875rem; font-weight:600; }",
    "  .setrow .s-help { font-size:.75rem; color:var(--ink-muted); margin-top:2px; }",
    "",
    "  @media (max-width: 640px) {",
    "    .kpi .k-value { font-size:1.4rem; }",
    "    .hbar { grid-template-columns:minmax(72px,40%) 1fr auto; }",
    "  }",
    "",
    "  /* ── the mark ─────────────────────────────────────────────────────────────── */",
    "  /* The logomark is four vertical bars inside an arch. The bars are what the boot",
    "     animation borrows, so the loading state and the logo are visibly the same",
    "     object rather than a spinner that happens to sit near a logo. */",
    "  .mark { display:block; color:var(--brand); }",
    "  .mark svg { display:block; width:100%; height:100%; }",
    "",
    "  .brandmark {",
    "    display:flex; align-items:center; gap:9px;",
    "    font:600 .6875rem/1 var(--font-display);",
    "    text-transform:uppercase; letter-spacing:var(--tracking);",
    "    color:var(--ink-2);",
    "  }",
    "  .brandmark .bm-icon { width:22px; height:17px; flex:0 0 auto; }",
    "  .brandmark.is-big {",
    "    flex-direction:column; gap:14px; font-size:.75rem; margin-bottom:6px;",
    "  }",
    "  .brandmark.is-big .bm-icon { width:56px; height:43px; }",
    "",
    "  /* ── boot ─────────────────────────────────────────────────────────────────── */",
    "  /* Paints before anything else and covers the whole viewport, so the gap between",
    "     \"script ran\" and \"data arrived\" is a considered moment rather than an empty",
    "     shell. It is in the markup, not built in script, so it is on screen at first",
    "     paint. */",
    "  .boot {",
    "    position:fixed; inset:0; z-index:60;",
    "    display:flex; flex-direction:column; align-items:center; justify-content:center;",
    "    gap:20px; background:var(--plane);",
    "  }",
    "  .boot.gone { display:none; }",
    "  /* Widths and gaps are the mark's own ratio (24.4 : 11.1), and each bar keeps its",
    "     own height from the mark - so the silhouette stays recognisable through the",
    "     whole animation instead of collapsing into a generic equaliser. */",
    "  .boot-bars { display:flex; align-items:flex-end; gap:12px; height:68px; }",
    "  .boot-bars i {",
    "    display:block; width:26px; background:var(--brand); border-radius:3px;",
    "    transform-origin:bottom; animation:hl-boot 1.25s ease-in-out infinite;",
    "  }",
    "  .boot-bars i:nth-child(1) { height:39%; animation-delay:0s; }",
    "  .boot-bars i:nth-child(2) { height:70%; animation-delay:.11s; }",
    "  .boot-bars i:nth-child(3) { height:100%; animation-delay:.22s; }",
    "  .boot-bars i:nth-child(4) { height:69%; animation-delay:.33s; }",
    "  /* scaleY rather than height: it is composited, and it cannot reflow the row. */",
    "  @keyframes hl-boot {",
    "    0%, 100% { transform:scaleY(.72); opacity:.6; }",
    "    50%      { transform:scaleY(1);   opacity:1; }",
    "  }",
    "  .boot-word {",
    "    font:600 .6875rem/1 var(--font-display);",
    "    text-transform:uppercase; letter-spacing:var(--tracking); color:var(--ink-2);",
    "  }",
    "  @media (prefers-reduced-motion: reduce) {",
    "    /* Still says \"working\", without four things moving. */",
    "    .boot-bars i { animation:hl-boot-fade 1.6s ease-in-out infinite; }",
    "    @keyframes hl-boot-fade { 0%,100% { opacity:.4; } 50% { opacity:1; } }",
    "  }",
    "",
    "  /* ── sign in ──────────────────────────────────────────────────────────────── */",
    "  #loginWrap {",
    "    min-height:100vh; display:flex; align-items:center; justify-content:center;",
    "    padding:24px;",
    "  }",
    "  #login {",
    "    position:relative; width:100%; max-width:380px; margin:0; padding:32px 28px 28px;",
    "    text-align:center;",
    "  }",
    "  #login h1 { margin:0 0 6px; }",
    "  #login p { color:var(--ink-2); font-size:.875rem; margin:0 0 22px; }",
    "  /* Every control is the same width, so the card reads as one column rather than a",
    "     form with a button hanging off the bottom-left of it. */",
    "  #login .field { text-align:left; margin-bottom:14px; }",
    "  #login label { margin-bottom:6px; }",
    "  #login input { width:100%; }",
    "  #login button.primary { width:100%; margin-top:4px; padding:11px 14px; }",
    "  #login .err, #login .ok { margin-top:12px; }",
    "  #login .iconbtn { position:absolute; top:14px; right:14px; }",
    "",
    "  /* Password reveal. A staff member typing a long password into a shared laptop",
    "     needs to be able to check it; the button is inside the field so it cannot be",
    "     mistaken for a second control. */",
    "  .pwbox { position:relative; }",
    "  .pwbox input { padding-right:70px; }",
    "  .pwbox .pwtoggle {",
    "    position:absolute; right:5px; top:50%; transform:translateY(-50%);",
    "    padding:5px 9px; font-size:.75rem; font-weight:600; border:0; background:none;",
    "    color:var(--ink-2); border-radius:var(--radius-sm);",
    "  }",
    "  .pwbox .pwtoggle:hover { background:var(--plane-hover); color:var(--ink); }",
    "",
    "  /* ── new reservation ──────────────────────────────────────────────────────── */",
    "  .modal-panel.is-wide { width:min(620px,calc(100% - 32px)); max-height:calc(100vh - 48px); overflow-y:auto; }",
    "  .nr-step { font-size:.75rem; color:var(--ink-muted); }",
    "  .nr-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }",
    "  .nr-grid .full { grid-column:1 / -1; }",
    "  @media (max-width: 520px) { .nr-grid { grid-template-columns:1fr; } }",
    "  .nr-sect {",
    "    border-top:1px solid var(--rule); margin-top:16px; padding-top:14px;",
    "  }",
    "  .nr-sect h3 {",
    "    font-size:.6875rem; text-transform:uppercase; letter-spacing:var(--tracking);",
    "    color:var(--ink-2); font-weight:600; margin:0 0 10px;",
    "  }",
    "  .nr-field label { margin-bottom:5px; }",
    "  .nr-hint { font-size:.75rem; color:var(--ink-muted); margin-top:4px; }",
    "  /* Radio pairs read better as a segmented control than as two loose circles when the",
    "     choice changes what the buyer is sent. */",
    "  .nr-choice { display:flex; gap:8px; flex-wrap:wrap; }",
    "  .nr-choice label {",
    "    flex:1 1 140px; margin:0; display:flex; gap:8px; align-items:flex-start;",
    "    border:1px solid var(--rule); border-radius:var(--radius-sm); padding:9px 11px;",
    "    cursor:pointer; color:var(--ink); font-size:.8125rem;",
    "  }",
    "  .nr-choice label:hover { border-color:var(--accent); }",
    "  .nr-choice input { width:auto; margin:2px 0 0; flex:0 0 auto; }",
    "  .nr-choice .c-note { display:block; color:var(--ink-muted); font-size:.75rem; margin-top:2px; }",
    "  .nr-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:18px; flex-wrap:wrap; }",
    "  .nr-actions .spacer { flex:1 1 auto; }",
    "",
    "  /* The confirm step. Everything that is about to happen, in the order it happens, so",
    "     nobody finds out about the live member afterwards. */",
    "  .nr-review { display:grid; grid-template-columns:auto 1fr; gap:7px 16px; font-size:.875rem; margin:4px 0 0; }",
    "  .nr-review dt { color:var(--ink-2); }",
    "  .nr-review dd { margin:0; }",
    "  .nr-will { margin:16px 0 0; padding:0; list-style:none; font-size:.8125rem; }",
    "  .nr-will li { padding:5px 0 5px 20px; position:relative; color:var(--ink-2); }",
    "  .nr-will li::before {",
    "    content:\"\"; position:absolute; left:6px; top:12px;",
    "    width:5px; height:5px; border-radius:50%; background:var(--brand);",
    "  }",
    "  .nr-warn {",
    "    margin-top:14px; padding:11px 13px; font-size:.8125rem; line-height:1.45;",
    "    border:1px solid var(--serious); border-radius:var(--radius-sm);",
    "    background:color-mix(in srgb, var(--serious) 8%, transparent); color:var(--ink);",
    "  }",
    "  .nr-warn strong { color:var(--serious); }",
    "  .nr-unit-note { font-size:.75rem; color:var(--ink-muted); margin-top:4px; min-height:1em; }",
    "</style>",
    "</head>",
    "<body>",
    "",
    "<!-- ─────────── boot ─────────── -->",
    "<div class=\"boot\" id=\"boot\" role=\"status\" aria-live=\"polite\" aria-label=\"Loading\">",
    "  <div class=\"boot-bars\" aria-hidden=\"true\"><i></i><i></i><i></i><i></i></div>",
    "  <div class=\"boot-word\" id=\"bootWord\">Heartland</div>",
    "</div>",
    "",
    "<!-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 login \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->",
    "<div id=\"loginWrap\">",
    "  <div id=\"login\" class=\"card\">",
    "  <button type=\"button\" class=\"iconbtn\" data-settings-open aria-label=\"Settings\" title=\"Settings\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"></path></svg></button>",
    "    <div class=\"brandmark is-big\"><span class=\"bm-icon mark\"><svg viewBox=\"0 0 220 167\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M150.8 54.1191V140.439L175.24 138.299V62.1391L150.8 54.1191Z\"/><path d=\"M202.76 29.74L117.33 1.25C114.83 0.43 112.25 0 109.66 0C107.07 0 104.49 0.42 101.99 1.25L16.56 29.74C6.66 33.05 0 42.3 0 52.73V135.59C0 148.15 9.59 158.63 22.12 159.72L68.52 163.77V92.04L44.07 100.42V149.49L23.17 147.66C16.86 147.11 12.11 141.92 12.11 135.59V52.73C12.11 47.51 15.43 42.88 20.38 41.23L105.83 12.74C107.07 12.33 108.35 12.11 109.66 12.11C110.97 12.11 112.25 12.33 113.49 12.74L198.93 41.23C203.88 42.88 207.22 47.51 207.22 52.73V135.59C207.22 141.91 202.46 147.11 196.15 147.66L187.58 148.41L139.67 152.6V50.4L115.24 42.27V166.89L197.21 159.73C209.74 158.64 219.34 148.16 219.34 135.6V52.73C219.34 42.3 212.66 33.04 202.77 29.74H202.76Z\"/><path d=\"M94.7803 45.4495L91.4503 46.5895L79.6503 50.6395L44.0703 62.8295V88.6595L79.6503 76.4695V164.75L104.09 166.89V42.2695L94.7803 45.4495Z\"/></svg></span><span class=\"bm-word\">Heartland</span></div>",
    "    <h1>Sales console</h1>",
    "    <p>Sign in with your own account. Everything you change is recorded against your name.</p>",
    "    <div class=\"field\">",
    "      <label for=\"email\">Email</label>",
    "      <input id=\"email\" type=\"email\" autocomplete=\"username\" spellcheck=\"false\">",
    "    </div>",
    "    <div class=\"field\">",
    "      <label for=\"pw\">Password</label>",
    "      <div class=\"pwbox\">",
    "        <input id=\"pw\" type=\"password\" autocomplete=\"current-password\">",
    "        <button type=\"button\" class=\"pwtoggle\" id=\"pwToggle\" aria-pressed=\"false\" aria-controls=\"pw\" aria-label=\"Show password\">Show</button>",
    "      </div>",
    "    </div>",
    "    <button class=\"primary\" id=\"signin\">Sign in</button>",
    "    <div class=\"err\" id=\"loginErr\"></div>",
    "  </div>",
    "</div>",
    "",
    "<!-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 app \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->",
    "<div class=\"wrap hide\" id=\"app\">",
    "  <header class=\"top\">",
    "    <div>",
    "      <div class=\"brandmark\"><span class=\"bm-icon mark\"><svg viewBox=\"0 0 220 167\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M150.8 54.1191V140.439L175.24 138.299V62.1391L150.8 54.1191Z\"/><path d=\"M202.76 29.74L117.33 1.25C114.83 0.43 112.25 0 109.66 0C107.07 0 104.49 0.42 101.99 1.25L16.56 29.74C6.66 33.05 0 42.3 0 52.73V135.59C0 148.15 9.59 158.63 22.12 159.72L68.52 163.77V92.04L44.07 100.42V149.49L23.17 147.66C16.86 147.11 12.11 141.92 12.11 135.59V52.73C12.11 47.51 15.43 42.88 20.38 41.23L105.83 12.74C107.07 12.33 108.35 12.11 109.66 12.11C110.97 12.11 112.25 12.33 113.49 12.74L198.93 41.23C203.88 42.88 207.22 47.51 207.22 52.73V135.59C207.22 141.91 202.46 147.11 196.15 147.66L187.58 148.41L139.67 152.6V50.4L115.24 42.27V166.89L197.21 159.73C209.74 158.64 219.34 148.16 219.34 135.6V52.73C219.34 42.3 212.66 33.04 202.77 29.74H202.76Z\"/><path d=\"M94.7803 45.4495L91.4503 46.5895L79.6503 50.6395L44.0703 62.8295V88.6595L79.6503 76.4695V164.75L104.09 166.89V42.2695L94.7803 45.4495Z\"/></svg></span><span class=\"bm-word\">Heartland</span></div>",
    "      <h1>Sales console</h1>",
    "      <div class=\"who\" id=\"who\">\u2014</div>",
    "    </div>",
    "    <div class=\"row\">",
    "      <button type=\"button\" class=\"iconbtn\" data-settings-open aria-label=\"Settings\" title=\"Settings\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"></path></svg></button>",
    "      <button class=\"primary\" id=\"newRes\" data-nr-open>New reservation</button>",
    "      <button id=\"refresh\">Refresh</button>",
    "      <button id=\"csv\">Download CSV</button>",
    "      <button id=\"signout\">Sign out</button>",
    "    </div>",
    "  </header>",
    "",
    "  <nav class=\"tabs\">",
    "    <button id=\"tabDash\" aria-selected=\"true\">Dashboard</button>",
    "    <button id=\"tabToday\" aria-selected=\"false\">Today<span class=\"count\" id=\"todayCount\">0</span></button>",
    "    <button id=\"tabPipe\" aria-selected=\"false\">Pipeline<span class=\"count\" id=\"pipeCount\">0</span></button>",
    "  </nav>",
    "",
    "  <!-- Dashboard -->",
    "  <section id=\"viewDash\"></section>",
    "",
    "  <!-- Today -->",
    "  <section id=\"viewToday\" class=\"hide\"></section>",
    "",
    "  <!-- Pipeline -->",
    "  <section id=\"viewPipe\" class=\"hide\">",
    "    <div class=\"filters\">",
    "      <div class=\"f grow\">",
    "        <label for=\"q\">Search</label>",
    "        <input id=\"q\" type=\"text\" placeholder=\"Reservation number, name, email, phone, unit\">",
    "      </div>",
    "      <div class=\"f\"><label for=\"fstatus\">Payment status</label><select id=\"fstatus\"></select></div>",
    "      <div class=\"f\"><label for=\"fstage\">Deal stage</label><select id=\"fstage\"></select></div>",
    "      <div class=\"f\"><label for=\"fprop\">Property</label><select id=\"fprop\"></select></div>",
    "    </div>",
    "    <div class=\"card tablewrap\">",
    "      <table>",
    "        <thead><tr>",
    "          <th>Ref</th><th>Buyer</th><th>Property / unit</th><th>Payment</th><th>Deal stage</th>",
    "          <th>Deadline</th><th class=\"num\">Hold fee</th><th class=\"num\">Purchase price</th>",
    "        </tr></thead>",
    "        <tbody id=\"rows\"></tbody>",
    "      </table>",
    "      <div class=\"none\" id=\"empty\" style=\"padding:36px 20px; text-align:center\"></div>",
    "    </div>",
    "  </section>",
    "</div>",
    "",
    "<!-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 drawer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->",
    "<div class=\"scrim\" id=\"scrim\"></div>",
    "<aside class=\"drawer\" id=\"drawer\" aria-hidden=\"true\"></aside>",
    "",
    "<!-- ─────────── settings ─────────── -->",
    "<div class=\"modal\" id=\"settings\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"setTitle\" aria-hidden=\"true\">",
    "  <div class=\"modal-scrim\" data-settings-close></div>",
    "  <div class=\"modal-panel\">",
    "    <header><h2 id=\"setTitle\">Settings</h2>",
    "      <button type=\"button\" id=\"setClose\" data-settings-close>Close</button></header>",
    "    <div class=\"setrow\">",
    "      <div class=\"s-label\">Colour scheme</div>",
    "      <div class=\"s-help\">Auto follows this computer’s setting.</div>",
    "      <div class=\"schemeswitch\" role=\"group\" aria-label=\"Colour scheme\">",
    "        <button type=\"button\" data-scheme-pref=\"system\" aria-pressed=\"false\" title=\"Match the system setting\">Auto</button>",
    "        <button type=\"button\" data-scheme-pref=\"light\" aria-pressed=\"false\" title=\"Always light\">Light</button>",
    "        <button type=\"button\" data-scheme-pref=\"dark\" aria-pressed=\"false\" title=\"Always dark\">Dark</button>",
    "      </div>",
    "    </div>",
    "  </div>",
    "</div>",
    "<!-- ─────────── new reservation ─────────── -->",
    "<div class=\"modal\" id=\"newres\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"nrTitle\" aria-hidden=\"true\">",
    "  <div class=\"modal-scrim\" data-nr-close></div>",
    "  <div class=\"modal-panel is-wide\">",
    "    <header><div><h2 id=\"nrTitle\">New reservation</h2>",
    "      <div class=\"nr-step\" id=\"nrStepLabel\">Taken off the system — in person or over the phone</div></div>",
    "      <button type=\"button\" id=\"nrClose\" data-nr-close>Close</button></header>",
    "    <div id=\"nrBody\"></div>",
    "  </div>",
    "</div>",
    "<div class=\"viztip\" id=\"viztip\" role=\"status\" aria-live=\"polite\"></div>",
    ""
  ].join("\n");

  var BASE = "https://x7aj-untn-pq4t.n7e.xano.io/api:i0YhKPAV";
  var TOKEN_KEY = "hl_staff_token";
  var STAFF_KEY = "hl_staff_who";

  /* The console renders inside a shadow root. The host site's stylesheet defines its
     own .card, .row, .item and .tag, and CSS does not cross a shadow boundary - so
     this is what keeps a marketing-site class from reformatting a staff tool.
     ShadowRoot implements getElementById, so redefining this one helper is the whole
     change: every lookup below is unchanged. */
  /* Served from a file, not from a page, so the markup arrives as a string and is
     parsed into a template here. Everything downstream is unchanged: root is still
     a ShadowRoot and $ still calls getElementById on it. */
  var host = document.getElementById("hl-console-host");
  if (!host) {
    /* Loaded on a page that is not the console. Say so once and stop - throwing
       here would put a red error in the console of an ordinary marketing page. */
    console.warn("[hl-console] no #hl-console-host on this page - nothing to render.");
    return;
  }
  if (host.shadowRoot) {
    console.warn("[hl-console] already initialised - the script is on this page twice.");
    return;
  }
  var root = host.attachShadow({ mode: "open" });
  var tplEl = document.createElement("template");
  tplEl.innerHTML = TPL;
  root.appendChild(tplEl.content.cloneNode(true));

  /* ── THEME ──────────────────────────────────────────────────────────────────
     Two moving parts, and deliberately no third.

     THE SCHEME is light or dark. The stored preference is one of "system",
     "light" or "dark" and defaults to "system". "system" is resolved against
     prefers-color-scheme HERE, in script, and the answer is stamped on the host
     as data-scheme - so the stylesheet carries no media query of its own and
     there is exactly one source of truth. A machine that flips to dark while the
     console is open re-resolves through the matchMedia listener below.

     THE BRAND is the white-label seam. Heartland is the base theme and it lives
     in the stylesheet, so its registry entry overrides nothing at all. Another
     brand supplies the same semantic token names per scheme; they are written as
     inline custom properties on the host, which beat the :host rules. Adding a
     brand is therefore a registry entry plus data-hl-brand on the host element -
     no second stylesheet, no per-brand CSS block, and nothing below the token
     blocks in the stylesheet ever changes. That is the same contract the buyer
     side already uses for per-property themes.

     CONTRAST IS NOT A MATTER OF TASTE HERE, and it is why --brand and --accent
     are two tokens rather than one. Heartland's gold is 2.4:1 on white: it works
     as a FILL carrying --brand-ink (7.3:1) and fails completely as small text or
     a thin border. --accent is the deepened gold that interactive TEXT uses, and
     it passes AA on every surface in both schemes. A new brand must keep that
     split or it will ship an unreadable console. */

  var SCHEME_KEY = "hl_console_scheme";
  var SCHEMES = { system: 1, light: 1, dark: 1 };

  /* Every token a brand may override. Anything omitted keeps the Heartland
     value, so a brand that only differs in colour need not restate the shape and
     type tokens. The list is also what applyBrand clears between schemes - a
     token left set from the light map would otherwise leak into dark. */
  var BRAND_TOKENS = [
    "--plane", "--surface", "--surface-2", "--plane-hover",
    "--ink", "--ink-2", "--ink-muted",
    "--rule", "--ring", "--shadow", "--shadow-lg",
    "--brand", "--brand-ink", "--brand-soft", "--accent", "--accent-ink",
    "--good", "--good-fill", "--warning", "--warning-fill",
    "--serious", "--serious-fill", "--critical", "--critical-fill", "--dot-ring",
    "--radius", "--radius-sm", "--font", "--font-display", "--tracking"
  ];

  var BRANDS = {
    heartland: {
      label: "Heartland",
      /* THE CONSOLE BRINGS ITS OWN TYPEFACE. Source Sans Pro is a Google font on the
         marketing site, so the brochure pages load it and this one does not -
         /sales-console carries almost none of the site's chrome. "Source Sans 3" is
         the family Google serves under that design today; the token stack names both,
         so a page that already has the old one still gets the right face. */
      fontHref: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
      /* A brand may point at its own logo instead of the built-in mark. An image URL,
         not markup - config that arrives from a page should never be injected as HTML,
         even when that page is trusted. */
      markUrl: null,
      /* The base theme IS Heartland. Nothing to override - this is the point. */
      light: {},
      dark: {}
    }
  };

  /* A brand may also be declared by the page, in the embed above this script, as
     window.HL_CONSOLE_BRANDS = { acme: { label: "Acme", light: {...}, dark: {...} } }.
     That is what makes white-labelling a deployment decision rather than a push:
     a reseller's page names its own brand and this file never changes. A brand
     declared here wins over one of the same name below, so Heartland itself can
     be re-skinned from the page without touching the base theme. */
  (function () {
    var extra = window.HL_CONSOLE_BRANDS;
    if (!extra || typeof extra !== "object") { return; }
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k]) {
        BRANDS[String(k).toLowerCase()] = extra[k];
      }
    }
  }());

  var BRAND = BRANDS[String(host.getAttribute("data-hl-brand") || "heartland")
    .toLowerCase()] || BRANDS.heartland;
  if (!BRAND.label) { BRAND.label = "Heartland"; }

  function applyBrand(scheme) {
    var map = BRAND[scheme] || {};
    var i, k;
    for (i = 0; i < BRAND_TOKENS.length; i++) { host.style.removeProperty(BRAND_TOKENS[i]); }
    for (k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        host.style.setProperty(k, String(map[k]));
      }
    }
  }

  function storedScheme() {
    var v = null;
    try { v = window.localStorage.getItem(SCHEME_KEY); } catch (e) { v = null; }
    return (v && SCHEMES[v]) ? v : "system";
  }

  function storeScheme(v) {
    /* Private windows throw on write. The choice then lasts the session rather
       than the machine, which is a smaller failure than a console that errors. */
    try { window.localStorage.setItem(SCHEME_KEY, v); } catch (e) { /* fine */ }
  }

  var darkQuery = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function resolveScheme(pref) {
    if (pref === "light" || pref === "dark") { return pref; }
    return (darkQuery && darkQuery.matches) ? "dark" : "light";
  }

  function applyScheme(pref) {
    var scheme = resolveScheme(pref);
    host.setAttribute("data-scheme", scheme);
    applyBrand(scheme);

    /* The console owns its own box; the page behind it knows none of this. An
       explicit light choice on a dark machine would otherwise leave a dark strip
       around a light tool wherever the console does not reach. Read the resolved
       plane off the host rather than hard-coding it, so a white-label brand's
       background follows too. */
    try {
      var plane = window.getComputedStyle(host).backgroundColor ||
        (scheme === "dark" ? "#131311" : "#f0eeea");
      var de = document.documentElement;
      de.style.colorScheme = scheme;
      de.style.background = plane;
      if (document.body) { document.body.style.background = plane; }
    } catch (e) { /* cosmetic only - never worth failing the boot for */ }

    var btns = root.querySelectorAll("[data-scheme-pref]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed",
        btns[i].getAttribute("data-scheme-pref") === pref ? "true" : "false");
    }
  }

  applyScheme(storedScheme());

  /* Only while the preference is "system". Someone who has explicitly chosen
     light does not want their console flipping at sunset. */
  if (darkQuery) {
    var onSystemChange = function () {
      if (storedScheme() === "system") { applyScheme("system"); }
    };
    if (darkQuery.addEventListener) { darkQuery.addEventListener("change", onSystemChange); }
    else if (darkQuery.addListener) { darkQuery.addListener(onSystemChange); }
  }

  /* One delegated handler covers both switches - the one on the login card and
     the one in the header - so they can never disagree. */
  root.addEventListener("click", function (ev) {
    var b = (ev.target && ev.target.closest)
      ? ev.target.closest("[data-scheme-pref]") : null;
    if (!b) { return; }
    var pref = b.getAttribute("data-scheme-pref");
    if (!SCHEMES[pref]) { return; }
    storeScheme(pref);
    applyScheme(pref);
  });

  /* A @font-face declared inside a shadow root is IGNORED - font faces are
     document-scoped, always - so the stylesheet has to go into document.head. Once,
     guarded by id, with display=swap so a slow font never delays a staff member
     reading the pipeline. */
  (function loadFont() {
    var href = BRAND.fontHref;
    if (!href || document.getElementById("hl-console-font")) { return; }
    try {
      var pre = document.createElement("link");
      pre.rel = "preconnect"; pre.href = "https://fonts.gstatic.com"; pre.crossOrigin = "";
      document.head.appendChild(pre);
      var l = document.createElement("link");
      l.id = "hl-console-font"; l.rel = "stylesheet"; l.href = href;
      document.head.appendChild(l);
    } catch (e) { /* the fallback stack is system-ui - never worth failing over */ }
  }());

  /* The wordmark reads its text - and optionally its logo - from the brand, so a
     rebrand touches no markup. */
  (function () {
    var words = root.querySelectorAll(".bm-word, #bootWord");
    var i;
    for (i = 0; i < words.length; i++) { words[i].textContent = BRAND.label; }
    if (!BRAND.markUrl) { return; }
    var icons = root.querySelectorAll(".bm-icon");
    for (i = 0; i < icons.length; i++) {
      var img = document.createElement("img");
      img.src = String(BRAND.markUrl); img.alt = "";
      img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "contain";
      icons[i].innerHTML = ""; icons[i].appendChild(img);
    }
  }());

  var $ = function (id) { return root.getElementById(id); };
  var S = { data: null, staff: null, open: null, tab: "today", catalogue: {} };

  /* ---------- the deal machine, mirrored for the UI ----------
     The server is the authority; this exists so the console never
     offers a move the server will refuse. Keep the two in step. */
  var STAGES = ["reserve", "finance", "build", "move-in"];
  var SUBS = ["pre-qualify", "sign-otp", "pay-deposit", "transfer-attorneys", "bond-approval", "bond-approved"];
  var ROUTE = {
    bond: ["pre-qualify", "sign-otp", "pay-deposit", "transfer-attorneys", "bond-approval", "bond-approved"],
    cash: ["sign-otp", "pay-deposit", "transfer-attorneys"],
    undecided: ["sign-otp", "pay-deposit", "transfer-attorneys"]
  };
  var WINDOW_DAYS = {
    "pre-qualify": 7, "sign-otp": 7, "pay-deposit": 7,
    "transfer-attorneys": null, "bond-approval": 30, "bond-approved": null
  };

  /* ---------- storage ---------- */
  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return S.tok || ""; } }
  function setSession(t, staff) {
    S.tok = t; S.staff = staff;
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
      sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    } catch (e) {}
  }
  function clearSession() {
    S.tok = ""; S.staff = null;
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(STAFF_KEY); } catch (e) {}
  }
  function savedStaff() {
    try { return JSON.parse(sessionStorage.getItem(STAFF_KEY) || "null"); } catch (e) { return null; }
  }

  /* ---------- formatting ---------- */
  function rands(c) {
    return "R " + ((c || 0) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function randsShort(c) { return "R " + Math.round((c || 0) / 100).toLocaleString("en-ZA"); }
  function day(ms) {
    if (!ms) { return "—"; }
    return new Date(ms).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  }
  function when(ms) {
    if (!ms) { return "—"; }
    var d = new Date(ms);
    return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }) + " " +
           d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function label(s) { return String(s || "").replace(/-/g, " ").replace(/_/g, " "); }
  function name(r) { return [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "—"; }

  /* A DEADLINE INSIDE THREE DAYS IS AN HOURS-AND-MINUTES PROBLEM, NOT A DAYS ONE.
     "0d left" told a salesperson nothing they could act on - it means anything from
     twenty-three hours to two minutes. Under three days the tag shows the whole clock
     and ticks; past that a date is what a person actually wants to read. */
  function msLeftOf(v) {
    if (!v) { return null; }
    var t = (typeof v === "number") ? v : Number(v);
    if (isNaN(t) || t <= 0) { t = Date.parse(String(v)); }
    if (isNaN(t)) { return null; }
    return t - Date.now();
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function clockText(ms) {
    if (ms === null) { return ""; }
    if (ms < 0) { ms = 0; }
    var s = Math.floor(ms / 1000);
    var dd = Math.floor(s / 86400); s -= dd * 86400;
    var hh = Math.floor(s / 3600);  s -= hh * 3600;
    var mm = Math.floor(s / 60);    s -= mm * 60;
    return (dd ? dd + "d " : "") + pad2(hh) + ":" + pad2(mm) + ":" + pad2(s) + " left";
  }

  function deadline(r) {
    if (!r.deal_stage_due_at) { return '<span class="muted">—</span>'; }
    if (r.overdue) { return '<span class="tag crit">Overdue · ' + esc(day(r.deal_stage_due_at)) + "</span>"; }
    if (r.days_left !== null && r.days_left <= 3) {
      var ms = msLeftOf(r.deal_stage_due_at);
      /* The due timestamp rides on the element, so the ticker never needs the row it
         came from - it redraws from the DOM alone and survives any re-render. */
      return '<span class="tag warn" data-due="' + esc(String(r.deal_stage_due_at)) + '">' +
             esc(clockText(ms)) + "</span>";
    }
    return '<span class="mono">' + esc(day(r.deal_stage_due_at)) + "</span>";
  }

  /* ONE INTERVAL FOR THE WHOLE TABLE, started once and never cleared: the console is a
     staff tool that sits open on a desk all day, and a timer per row would be dozens of
     them thrown away and rebuilt on every re-render. */
  var tagTimer = null;
  function startDeadlineClock() {
    if (tagTimer) { return; }
    tagTimer = setInterval(function () {
      var tags = document.querySelectorAll("[data-due]");
      for (var i = 0; i < tags.length; i++) {
        var ms = msLeftOf(tags[i].getAttribute("data-due"));
        if (ms === null) { continue; }
        tags[i].textContent = clockText(ms);
        /* Crossing zero while somebody is looking at the table should look like what it
           is, without waiting for a refresh. */
        if (ms <= 0) { tags[i].className = "tag crit"; }
      }
    }, 1000);
  }

  /* ---------- api ---------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (opts.auth !== false) { headers.Authorization = "Bearer " + token(); }
    return fetch(BASE + path, { method: opts.method || "GET", headers: headers, body: opts.body })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok) {
            if (r.status === 401 && opts.auth !== false) { signOut("Your session expired. Sign in again."); }
            throw new Error((j && j.message) || ("Request failed (" + r.status + ")"));
          }
          return j;
        });
      });
  }

  /* ---------- load ---------- */
  function load() {
    var b = $("refresh");
    b.disabled = true; b.textContent = "Loading…";
    var qs = "?q=" + encodeURIComponent($("q").value) +
             "&status=" + encodeURIComponent($("fstatus").value) +
             "&deal_stage=" + encodeURIComponent($("fstage").value) +
             "&property=" + encodeURIComponent($("fprop").value);
    return api("/staff/reservations" + qs)
      .then(function (d) {
        S.data = d;
        render();
      })
      .catch(function (e) { $("who").textContent = "Could not load — " + e.message; })
      .then(function () {
        b.disabled = false; b.textContent = "Refresh";
        /* Whether it loaded or failed. A boot screen that outlives the request it is
           waiting for is worse than no boot screen. */
        hideBoot();
      });
  }

  /* ---------- render ---------- */
  function render() {
    var d = S.data;
    if (!d) { return; }
    $("who").textContent = d.staff.name + " · " + d.staff.role + " · " +
      d.matched + " of " + d.summary.total + " shown";
    fillFilters(d);
    renderDash();
    renderToday(d);
    renderRows(d.items);
    $("pipeCount").textContent = d.matched;
    var urgent = d.summary.overdue + d.summary.needs_attention;
    var tc = $("todayCount");
    tc.textContent = urgent;
    tc.className = "count" + (urgent > 0 ? " hot" : "");
  }

  function fillFilters(d) {
    function fill(sel, opts, allLabel) {
      var keep = sel.value;
      sel.innerHTML = '<option value="">' + allLabel + "</option>" +
        opts.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.t) + "</option>"; }).join("");
      sel.value = keep;
    }
    fill($("fstatus"), Object.keys(d.summary.by_status).sort().map(function (k) {
      return { v: k, t: label(k) + " (" + d.summary.by_status[k] + ")" };
    }), "All");
    fill($("fstage"), STAGES.map(function (s) {
      return { v: s, t: label(s) + (d.summary.by_deal_stage[s] ? " (" + d.summary.by_deal_stage[s] + ")" : "") };
    }), "All");
    fill($("fprop"), (d.properties || []).map(function (p) {
      return { v: p.slug, t: p.name + (p.is_payfast_live ? "" : " — sandbox") };
    }), "All");
  }



  /* ---------- new reservation ----------
     A deal done in a show house or over the phone, typed in so it is managed here like
     every other one and the buyer gets their portal.

     TWO STEPS, AND THE SECOND ONE IS NOT CEREMONY. Creating this reservation takes a
     home off the market, records money as received, and CREATES A REAL MEMBERSTACK
     MEMBER against a live key. None of those are things to discover afterwards, so
     the review step names each of them before the button that does them. */

  var NR = {
    open: false, step: 1, busy: false, err: "", units: [], loadingUnits: false,
    v: {}
  };

  function nrDefaults() {
    return {
      property_slug: "", wf_unit_id: "",
      first_name: "", last_name: "", email: "", phone: "",
      payer_route: "undecided",
      fee_rands: "", fee_method: "eft", fee_reference: "", fee_received_at: "",
      generate_otp: "yes", note: ""
    };
  }

  function nrProperty() {
    var props = (S.data && S.data.properties) || [];
    for (var i = 0; i < props.length; i++) {
      if (props[i].slug === NR.v.property_slug) { return props[i]; }
    }
    return null;
  }

  function nrUnit() {
    for (var i = 0; i < NR.units.length; i++) {
      if (NR.units[i].wf_unit_id === NR.v.wf_unit_id) { return NR.units[i]; }
    }
    return null;
  }

  function nrOpen() {
    NR.open = true; NR.step = 1; NR.err = ""; NR.busy = false;
    NR.units = []; NR.v = nrDefaults();
    var m = $("newres");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    nrRender();
  }

  function nrClose() {
    if (!NR.open) { return false; }
    NR.open = false;
    var m = $("newres");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    var back = $("newRes");
    if (back && back.focus) { back.focus(); }
    return true;
  }

  /* The picker is drawn from /staff/units, which reconciles the CMS's published flags
     with the holds Xano is actually carrying - so a home taken a minute ago cannot be
     offered here and then refused on submit. */
  function nrLoadUnits() {
    var slug = NR.v.property_slug;
    NR.units = []; NR.v.wf_unit_id = "";
    if (!slug) { nrRender(); return; }
    NR.loadingUnits = true; NR.err = ""; nrRender();
    api("/staff/units?property=" + encodeURIComponent(slug))
      .then(function (d) {
        NR.units = (d && d.units) || [];
        NR.truncated = !!(d && d.truncated);
        /* The property's own fee, in rands, so the common case is one less thing typed. */
        if (d && d.fee_cents && !NR.v.fee_rands) {
          NR.v.fee_rands = String(Math.round(d.fee_cents / 100));
        }
      })
      .catch(function (e) { NR.err = "Could not load homes — " + e.message; })
      .then(function () { NR.loadingUnits = false; nrRender(); });
  }

  function nrField(id, labelText, type, hint, attrs) {
    return '<div class="nr-field">' +
      '<label for="nr_' + id + '">' + esc(labelText) + "</label>" +
      '<input id="nr_' + id + '" data-nr="' + id + '" type="' + type + '"' +
        (attrs || "") + ' value="' + esc(String(NR.v[id] || "")) + '">' +
      (hint ? '<div class="nr-hint">' + esc(hint) + "</div>" : "") +
      "</div>";
  }

  function nrSelect(id, labelText, opts, hint) {
    return '<div class="nr-field">' +
      '<label for="nr_' + id + '">' + esc(labelText) + "</label>" +
      '<select id="nr_' + id + '" data-nr="' + id + '">' +
      opts.map(function (o) {
        return '<option value="' + esc(o.v) + '"' +
          (String(o.v) === String(NR.v[id]) ? " selected" : "") +
          (o.disabled ? " disabled" : "") + ">" + esc(o.t) + "</option>";
      }).join("") +
      "</select>" + (hint ? '<div class="nr-hint">' + esc(hint) + "</div>" : "") +
      "</div>";
  }

  function nrUnitOptions() {
    var opts = [{ v: "", t: NR.loadingUnits ? "Loading homes…" : "Choose a home" }];
    for (var i = 0; i < NR.units.length; i++) {
      var u = NR.units[i];
      opts.push({
        v: u.wf_unit_id,
        t: (u.name || u.unit_number || u.wf_unit_id) +
           (u.price_display ? " · " + u.price_display : "")
      });
    }
    return opts;
  }

  function nrStep1() {
    var props = (S.data && S.data.properties) || [];
    var prop = nrProperty();
    var unit = nrUnit();

    return '<div class="nr-grid">' +
      nrSelect("property_slug", "Property",
        [{ v: "", t: "Choose a property" }].concat(props.map(function (p) {
          return { v: p.slug, t: p.name + (p.is_payfast_live ? "" : " — sandbox") };
        }))) +
      nrSelect("wf_unit_id", "Home", nrUnitOptions()) +
      '<div class="full"><div class="nr-unit-note">' +
        (NR.loadingUnits ? "Reading availability…"
          : (!NR.v.property_slug ? "Homes load once a property is chosen."
          : (NR.units.length === 0 ? "No homes are available on this development."
          : (unit ? (unit.unit_size ? unit.unit_size.split("\n")[0] : "") +
              (NR.units.length + " available")
            : NR.units.length + " available")))) +
      "</div></div>" +

      '<div class="nr-sect full"><h3>Buyer</h3></div>' +
      nrField("first_name", "First name", "text") +
      nrField("last_name", "Last name", "text") +
      nrField("email", "Email", "email",
        "Required — the portal login is keyed on it.", ' autocomplete="off" spellcheck="false"') +
      nrField("phone", "Phone", "tel") +
      nrSelect("payer_route", "Paying by", [
        { v: "undecided", t: "Not decided yet" },
        { v: "bond", t: "Bond" },
        { v: "cash", t: "Cash" }
      ], "Decides the deal's first step and which offer template applies.") +

      '<div class="nr-sect full"><h3>Reservation fee received</h3></div>' +
      nrField("fee_rands", "Amount (R)", "text",
        prop ? "" : "Defaults to the property's own fee.", ' inputmode="numeric"') +
      nrSelect("fee_method", "How it arrived", [
        { v: "eft", t: "EFT" }, { v: "card", t: "Card" },
        { v: "cash", t: "Cash" }, { v: "other", t: "Other" }
      ]) +
      nrField("fee_reference", "Reference", "text", "So the figure traces back to a statement.") +
      nrField("fee_received_at", "Date received", "date",
        "Leave blank for today. The first deadline counts from this date.") +

      '<div class="nr-sect full"><h3>Offer to purchase</h3>' +
      '<div class="nr-choice">' +
      '<label><input type="radio" name="nr_otp" data-nr="generate_otp" value="yes"' +
        (NR.v.generate_otp === "yes" ? " checked" : "") + ">" +
        "<span>Generate the signing link" +
        '<span class="c-note">Appears in the buyer’s portal at the signing step.</span></span></label>' +
      '<label><input type="radio" name="nr_otp" data-nr="generate_otp" value="no"' +
        (NR.v.generate_otp === "no" ? " checked" : "") + ">" +
        "<span>Signed on paper" +
        '<span class="c-note">No link is generated or shown to them.</span></span></label>' +
      "</div></div>" +

      '<div class="nr-sect full"><h3>Note</h3>' +
      '<div class="nr-field">' +
      '<label for="nr_note">Why this was entered by hand</label>' +
      '<textarea id="nr_note" data-nr="note" rows="2">' + esc(NR.v.note || "") + "</textarea>" +
      '<div class="nr-hint">Required. This deal has no online trail, so the note is the trail.</div>' +
      "</div></div>" +

      '<div class="err full" id="nrErr">' + esc(NR.err) + "</div>" +
      '<div class="nr-actions full">' +
      '<button type="button" data-nr-close>Cancel</button>' +
      '<button type="button" class="primary" id="nrNext">Review</button>' +
      "</div></div>";
  }

  function nrProblems() {
    var v = NR.v, out = [];
    if (!v.property_slug) { out.push("Choose a property."); }
    if (!v.wf_unit_id) { out.push("Choose a home."); }
    if (!String(v.email || "").trim()) { out.push("An email address is required."); }
    else if (String(v.email).indexOf("@") < 1) { out.push("That email address does not look right."); }
    if (!String(v.note || "").trim()) { out.push("A note is required."); }
    return out;
  }

  function nrFeeCents() {
    var n = Number(String(NR.v.fee_rands || "").replace(/[^0-9.]/g, ""));
    return (isNaN(n) || n <= 0) ? 0 : Math.round(n * 100);
  }

  function nrStep2() {
    var prop = nrProperty(), unit = nrUnit();
    var name = [NR.v.first_name, NR.v.last_name].filter(Boolean).join(" ") || NR.v.email;
    var fee = nrFeeCents();
    var otp = NR.v.generate_otp === "yes";
    var when = NR.v.fee_received_at ? NR.v.fee_received_at : "today";

    var rows = [
      ["Buyer", name + " · " + NR.v.email + (NR.v.phone ? " · " + NR.v.phone : "")],
      ["Home", (prop ? prop.name + " · " : "") + (unit ? (unit.name || unit.unit_number) : "") +
        (unit && unit.price_display ? " · " + unit.price_display : "")],
      ["Paying by", label(NR.v.payer_route)],
      ["Fee received", (fee ? randsShort(fee) : "the property’s own fee") +
        " · " + label(NR.v.fee_method) + (NR.v.fee_reference ? " · " + NR.v.fee_reference : "") +
        " · " + when],
      ["Offer", otp ? "signing link generated" : "signed on paper, no link"],
      ["Note", NR.v.note]
    ];

    return '<dl class="nr-review">' + rows.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
    }).join("") + "</dl>" +

      '<ul class="nr-will">' +
      "<li>Takes this home off the market, here and on the website.</li>" +
      "<li>Records the fee as already received — no payment is taken.</li>" +
      "<li>Opens the deal and gives it a reservation number.</li>" +
      "<li>Creates the buyer’s account so they can sign in to their portal.</li>" +
      "</ul>" +

      '<div class="nr-warn"><strong>The buyer’s account is real.</strong> ' +
      "It is created in the live system the moment you confirm, and they can sign in " +
      "straight away with a code sent to " + esc(NR.v.email) + ". There is no undo here — " +
      "a mistake is cancelled from the deal, not deleted.</div>" +

      '<div class="err" id="nrErr">' + esc(NR.err) + "</div>" +
      '<div class="nr-actions">' +
      '<button type="button" id="nrBack">Back</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" data-nr-close>Cancel</button>' +
      '<button type="button" class="primary" id="nrGo"' + (NR.busy ? " disabled" : "") + ">" +
      (NR.busy ? "Creating…" : "Create reservation") + "</button>" +
      "</div>";
  }

  function nrRender() {
    if (!NR.open) { return; }
    $("nrStepLabel").textContent = NR.step === 1
      ? "Taken off the system — in person or over the phone"
      : "Check this, then confirm";
    $("nrBody").innerHTML = NR.step === 1 ? nrStep1() : nrStep2();

    /* One delegated pair of listeners rather than one per control - the body is
       re-rendered on every keystroke-free change, and rebinding twenty handlers each
       time is how a form starts dropping input. */
    [].forEach.call($("nrBody").querySelectorAll("[data-nr]"), function (el) {
      var key = el.getAttribute("data-nr");
      var ev = (el.tagName === "SELECT" || el.type === "radio" || el.type === "date")
        ? "change" : "input";
      el.addEventListener(ev, function () {
        if (el.type === "radio") { if (!el.checked) { return; } NR.v[key] = el.value; return; }
        NR.v[key] = el.value;
        if (key === "property_slug") { nrLoadUnits(); }
      });
    });

    if ($("nrNext")) {
      $("nrNext").addEventListener("click", function () {
        var problems = nrProblems();
        if (problems.length) { NR.err = problems[0]; $("nrErr").textContent = NR.err; return; }
        NR.err = ""; NR.step = 2; nrRender();
      });
    }
    if ($("nrBack")) {
      $("nrBack").addEventListener("click", function () { NR.err = ""; NR.step = 1; nrRender(); });
    }
    if ($("nrGo")) { $("nrGo").addEventListener("click", nrSubmit); }
  }

  function nrSubmit() {
    if (NR.busy) { return; }
    NR.busy = true; NR.err = ""; nrRender();
    var fee = nrFeeCents();
    var body = {
      property_slug  : NR.v.property_slug,
      wf_unit_id     : NR.v.wf_unit_id,
      email          : String(NR.v.email || "").trim(),
      first_name     : NR.v.first_name,
      last_name      : NR.v.last_name,
      phone          : NR.v.phone,
      payer_route    : NR.v.payer_route,
      fee_method     : NR.v.fee_method,
      fee_reference  : NR.v.fee_reference,
      fee_received_at: NR.v.fee_received_at,
      generate_otp   : NR.v.generate_otp === "yes",
      note           : NR.v.note
    };
    /* Only when it was actually typed. Sending 0 would override the property's fee with
       nothing; omitting it lets the server fall back to the property. */
    if (fee > 0) { body.fee_amount_cents = fee; }

    api("/staff/reservations", { method: "POST", body: JSON.stringify(body) })
      .then(function (d) {
        NR.busy = false;
        nrClose();
        /* Reload so the new deal is in the table, then open it - a salesperson who has
           just typed all that wants to see the thing they made, not go looking for it. */
        return load().then(function () {
          if (d && d.uuid) { openDrawer(d.uuid); }
          if (d && d.cms_written === false && d.cms_owner === "xano") {
            /* The hold is real either way; the website is the bit that did not update. */
            $("who").textContent = "Reservation " + (d.reference || "") +
              " created — but the website still shows that home as available. Flip it by hand.";
          }
        });
      })
      .catch(function (e) {
        NR.busy = false;
        NR.err = e.message || "Could not create the reservation.";
        nrRender();
      });
  }

  /* ---------- Dashboard ----------
     Everything on this tab is computed in the browser from the reservations the
     pipeline already loaded. No second endpoint, no second round trip, no new
     running cost - and it cannot disagree with the table, because it is the same
     array.

     The price of that is honest and stated on screen: `items` arrives already
     narrowed by the pipeline's own filters, so when any of them is set the
     dashboard shows that slice and says so, with one button to clear them. The
     alternative - a second unfiltered fetch - would have the dashboard and the
     table quietly describing different populations. */

  var DASH = { property: "", range: "all", tables: {} };

  var RANGES = [
    { v: "30",  t: "Last 30 days",   days: 30 },
    { v: "90",  t: "Last 90 days",   days: 90 },
    { v: "365", t: "Last 12 months", days: 365 },
    { v: "all", t: "All time",       days: null }
  ];

  function tsOf(v) {
    if (!v) { return null; }
    var t = (typeof v === "number") ? v : Number(v);
    if (isNaN(t) || t <= 0) { t = Date.parse(String(v)); }
    return isNaN(t) ? null : t;
  }

  /* A stat tile is a glance, and "R 70,095,000" wraps onto two lines in one. Millions
     get an abbreviation; the exact figure rides along in the tile's title so nothing
     is lost, and the tables underneath carry it in full. */
  function compactRands(c) {
    var r = (c || 0) / 100;
    if (Math.abs(r) >= 1000000) {
      var m = r / 1000000;
      return "R " + (m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 1 : 2)) + "m";
    }
    return randsShort(c);
  }

  function rangeDef() {
    for (var i = 0; i < RANGES.length; i++) {
      if (RANGES[i].v === DASH.range) { return RANGES[i]; }
    }
    return RANGES[RANGES.length - 1];
  }

  /* A DATED RANGE IS A RANGE OF CONFIRMATION DATES, and a reservation that has not
     been paid for has no confirmation date. Such a row is therefore in "All time"
     and out of every dated range - which is the truthful answer, not a bug, but it
     is the kind of thing that silently halves a number, so the subtitle says it. */
  function dashRows() {
    var items = (S.data && S.data.items) || [];
    var r = rangeDef();
    var cutoff = r.days ? (Date.now() - r.days * 86400000) : null;
    return items.filter(function (x) {
      if (DASH.property && x.property_slug !== DASH.property) { return false; }
      if (cutoff) {
        var t = tsOf(x.confirmed_at);
        if (t === null || t < cutoff) { return false; }
      }
      return true;
    });
  }

  function sum(rows, f) {
    var t = 0;
    for (var i = 0; i < rows.length; i++) { t += Number(f(rows[i])) || 0; }
    return t;
  }

  /* ---------- chart primitives ----------
     Plain HTML. Bars are divs with a percentage width or height, so every label is
     real text at real size and the whole thing reflows with the card. */

  function niceMax(n) {
    if (!(n > 0)) { return 1; }
    var mag = Math.pow(10, Math.floor(Math.log(n) / Math.LN10));
    var f = n / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  }

  /* Horizontal bars. Used for the funnel (ordinal ramp, colour per row) and for
     value by property (one series, so every row is the same colour - colouring a
     nominal bar by its own value would re-encode what the length already shows). */
  function hbars(rows) {
    if (!rows.length) { return '<div class="emptyviz">Nothing in this slice.</div>'; }
    var max = 0, i;
    for (i = 0; i < rows.length; i++) { if (rows[i].value > max) { max = rows[i].value; } }
    if (!max) { max = 1; }
    return '<div class="hbars">' + rows.map(function (r) {
      var pct = Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100);
      var tip = r.tip || (r.label + " — " + r.valueText);
      return '<div class="hbar">' +
        '<div class="h-label" title="' + esc(r.label) + '">' + esc(r.label) + "</div>" +
        '<div class="h-track"><div class="h-fill" style="width:' + pct.toFixed(1) +
          "%;background:" + (r.color || "var(--viz-solo)") + '"' +
          ' data-tip="' + esc(tip) + '" tabindex="0" role="img" aria-label="' + esc(tip) + '"></div></div>' +
        '<div class="h-val">' + esc(r.valueText) +
          (r.note ? " <small>" + esc(r.note) + "</small>" : "") + "</div>" +
        "</div>";
    }).join("") + "</div>";
  }

  /* Columns over time. One series, so one colour and no legend box - the card's
     title already names what is plotted. Two hairline gridlines carry the scale. */
  function colchart(buckets) {
    if (!buckets.length) { return '<div class="emptyviz">Nothing in this slice.</div>'; }
    var max = 0, i;
    for (i = 0; i < buckets.length; i++) { if (buckets[i].value > max) { max = buckets[i].value; } }
    var top = niceMax(max);
    /* These are counts, so a mid-line labelled 2.5 is nonsense - the line still helps
       the eye, it just goes unlabelled when the halfway point is not a whole one. */
    var half = top / 2;
    var grid = '<div class="cols-grid">' +
      '<i style="top:0"></i><b style="top:0">' + top + "</b>" +
      '<i style="top:50%"></i>' + (half === Math.round(half) ? '<b style="top:50%">' + half + "</b>" : "") +
      '<i style="bottom:0"></i></div>';
    var bars = buckets.map(function (b) {
      var h = top ? (b.value / top) * 100 : 0;
      var tip = b.full + " — " + b.value + (b.value === 1 ? " reservation" : " reservations");
      return '<div class="col"><div class="c-bar" style="height:' + h.toFixed(1) + '%"' +
        ' data-tip="' + esc(tip) + '" tabindex="0" role="img" aria-label="' + esc(tip) + '"></div></div>';
    }).join("");
    return '<div class="cols"><div class="cols-plot">' + grid + bars + "</div>" +
      '<div class="cols-x">' + buckets.map(function (b) {
        return "<span>" + esc(b.x) + "</span>";
      }).join("") + "</div></div>";
  }

  /* A stacked bar plus a legend that carries every value as text. The 2px surface
     gap between segments is what separates them; nothing is stroked. Segments of
     zero are dropped from the bar but KEPT in the legend, because "none of these"
     is information. */
  function stackchart(segs) {
    var total = 0, i;
    for (i = 0; i < segs.length; i++) { total += segs[i].value; }
    if (!total) { return '<div class="emptyviz">Nothing in this slice.</div>'; }
    var bar = segs.filter(function (s) { return s.value > 0; }).map(function (s) {
      var pc = Math.round((s.value / total) * 100);
      var tip = s.label + " — " + s.value + " (" + pc + "%)";
      return '<i style="flex:' + s.value + " 1 0;background:" + s.color + '"' +
        ' data-tip="' + esc(tip) + '" tabindex="0" role="img" aria-label="' + esc(tip) + '"></i>';
    }).join("");
    var leg = segs.map(function (s) {
      return '<span class="lg"><span class="sw" style="background:' + s.color + '"></span>' +
        esc(s.label) + ' <span class="lv">' + s.value + "</span></span>";
    }).join("");
    return '<div class="stack">' + bar + '</div><div class="legend">' + leg + "</div>";
  }

  /* Every chart ships a table twin, so no value is reachable only by hovering. */
  function chartCard(key, title, sub, body, table, wide) {
    var open = !!DASH.tables[key];
    return '<div class="card chart' + (wide ? " wide" : "") + '">' +
      '<div class="chead"><div><h2>' + esc(title) + "</h2>" +
      '<p class="sub">' + esc(sub) + "</p></div>" +
      (table ? '<button type="button" class="tbtn" data-vtable="' + esc(key) + '" aria-expanded="' +
        (open ? "true" : "false") + '">' + (open ? "Hide table" : "Table") + "</button>" : "") +
      "</div>" + body +
      (table && open ? table : "") + "</div>";
  }

  function vtable(cols, rows) {
    return '<table class="vtable"><thead><tr>' +
      cols.map(function (c, i) { return "<th" + (i ? ' class="num"' : "") + ">" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (v, i) {
          return "<td" + (i ? ' class="num"' : "") + ">" + esc(String(v)) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  /* ---------- the four states a payment can be in ----------
     The same grouping the status dot in the table already uses, so a colour means
     the same thing on both tabs. Status colours are reserved for status and each
     one ships with its name in the legend - never colour alone. */
  var PAY_GROUPS = [
    { key: "ok",      label: "Confirmed",              color: "var(--good)",
      match: ["confirmed"] },
    { key: "waiting", label: "Awaiting payment",       color: "var(--warning-fill)",
      match: ["awaiting_payment", "awaiting_clearance", "held"] },
    { key: "failed",  label: "Payment failed",         color: "var(--serious)",
      match: ["payment_failed"] },
    { key: "dead",    label: "Cancelled or refunded",  color: "var(--critical)",
      match: ["cancelled", "refunded"] }
  ];

  var RISK_BUCKETS = [
    { label: "Overdue",        color: "var(--critical)" },
    { label: "Due in 3 days",  color: "var(--serious)" },
    { label: "Due in a week",  color: "var(--warning-fill)" },
    { label: "Further out",    color: "var(--good)" },
    { label: "No deadline",    color: "var(--ink-muted)" }
  ];

  function riskOf(r) {
    if (r.overdue) { return 0; }
    var ms = msLeftOf(r.deal_stage_due_at);
    if (ms === null) { return 4; }
    if (ms <= 0) { return 0; }
    if (ms <= 3 * 86400000) { return 1; }
    if (ms <= 7 * 86400000) { return 2; }
    return 3;
  }

  /* ---------- time buckets ----------
     Weeks under about six weeks of span, months past it. Twelve monthly columns is
     readable; ninety daily ones is a barcode. */
  function timeBuckets(rows) {
    var stamps = [], i, t;
    for (i = 0; i < rows.length; i++) {
      t = tsOf(rows[i].confirmed_at);
      if (t !== null) { stamps.push(t); }
    }
    if (!stamps.length) { return { buckets: [], unit: "month", counted: 0 }; }
    stamps.sort(function (a, b) { return a - b; });
    var first = stamps[0], last = Date.now();
    var spanDays = (last - first) / 86400000;
    var weekly = spanDays <= 45;
    var map = {}, order = [];

    function key(ts) {
      var d = new Date(ts);
      if (weekly) {
        var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));  /* back to Monday */
        return mon.getTime();
      }
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }

    /* Build the empty spine first, so a month with no reservations shows as a gap
       rather than vanishing and making the trend look smoother than it was. */
    var cur = key(first), end = key(last), guard = 0;
    while (cur <= end && guard++ < 400) {
      map[cur] = 0; order.push(cur);
      var d = new Date(cur);
      if (weekly) { d.setDate(d.getDate() + 7); } else { d.setMonth(d.getMonth() + 1); }
      cur = d.getTime();
    }
    for (i = 0; i < stamps.length; i++) {
      var k = key(stamps[i]);
      if (map[k] === undefined) { map[k] = 0; order.push(k); }
      map[k] += 1;
    }
    order.sort(function (a, b) { return a - b; });
    if (order.length > 12) { order = order.slice(order.length - 12); }

    return {
      unit: weekly ? "week" : "month",
      counted: stamps.length,
      buckets: order.map(function (k) {
        var d = new Date(k);
        return {
          value: map[k],
          x: weekly
            ? d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
            : d.toLocaleDateString("en-ZA", { month: "short" }),
          full: weekly
            ? "Week of " + d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
            : d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
        };
      })
    };
  }

  function filtersActive() {
    return !!($("q").value || $("fstatus").value || $("fstage").value || $("fprop").value);
  }

  function renderDash() {
    var d = S.data;
    if (!d) { return; }
    var rows = dashRows();
    var props = d.properties || [];
    var one = DASH.property
      ? (props.filter(function (p) { return p.slug === DASH.property; })[0] || null)
      : null;
    var scope = one ? one.name : "all properties";
    var rdef = rangeDef();

    /* --- the filter row: one row, above everything it scopes --- */
    var head =
      '<div class="dashfilters">' +
        '<div class="f"><label for="dprop">Property</label><select id="dprop">' +
          '<option value="">All properties</option>' +
          props.map(function (p) {
            return '<option value="' + esc(p.slug) + '"' +
              (p.slug === DASH.property ? " selected" : "") + ">" + esc(p.name) +
              (p.is_payfast_live ? "" : " — sandbox") + "</option>";
          }).join("") +
        "</select></div>" +
        '<div class="f"><label for="drange">Period</label><select id="drange">' +
          RANGES.map(function (r) {
            return '<option value="' + r.v + '"' + (r.v === DASH.range ? " selected" : "") +
              ">" + esc(r.t) + "</option>";
          }).join("") +
        "</select></div>" +
      "</div>";

    if (filtersActive()) {
      head += '<div class="dashnote"><span>The pipeline filters are narrowing this to ' +
        d.matched + " of " + d.summary.total +
        " reservations. The dashboard is showing that slice.</span>" +
        '<button type="button" id="dclear">Clear filters</button></div>';
    }

    /* --- KPIs --- */
    var value = sum(rows, function (r) { return r.total_cents; });
    var overdue = rows.filter(function (r) { return r.overdue; }).length;
    var flagged = rows.filter(function (r) { return r.needs_attention; }).length;
    var bond = rows.filter(function (r) { return r.payer_route === "bond"; }).length;
    var cash = rows.filter(function (r) { return r.payer_route === "cash"; }).length;
    var undec = rows.length - bond - cash;
    var held = sum(rows, function (r) { return r.reservation_fee_cents; });

    function kpi(labelText, valueText, note, cls, jump, exact) {
      return '<div class="card kpi' + (cls ? " " + cls : "") + (jump ? " is-link" : "") + '"' +
        (exact ? ' title="' + esc(exact) + '"' : "") +
        (jump ? ' data-jump="' + jump + '" tabindex="0" role="button"' : "") + ">" +
        '<div class="k-label">' + esc(labelText) + "</div>" +
        '<div class="k-value">' + esc(valueText) + "</div>" +
        '<div class="k-note">' + esc(note) + "</div></div>";
    }

    var kpis = '<div class="kpis">' +
      kpi("Reserved value", compactRands(value), rows.length + " reservations", "", "", rands(value)) +
      kpi("Average price", compactRands(rows.length ? value / rows.length : 0), "per reservation",
          "", "", rands(rows.length ? value / rows.length : 0)) +
      kpi("Hold fees taken", compactRands(held), "across this slice", "", "", rands(held)) +
      kpi("Overdue", String(overdue), overdue ? "open it in Today" : "nothing past its deadline",
          overdue ? "alarm" : "", overdue ? "today" : "") +
      kpi("Needs a decision", String(flagged), flagged ? "open it in Today" : "nothing flagged",
          flagged ? "alarm" : "", flagged ? "today" : "") +
      kpi("Bond buyers", String(bond), cash + " cash · " + undec + " undecided", "") +
      "</div>";

    /* --- 1. the funnel: ordinal, so one hue in lightness steps --- */
    var stageRows = SUBS.map(function (sub, i) {
      var n = rows.filter(function (r) { return r.deal_sub_stage === sub; }).length;
      return {
        label: label(sub), value: n, valueText: String(n),
        color: "var(--viz-" + (i + 1) + ")",
        tip: label(sub) + " — " + n + (n === 1 ? " deal" : " deals")
      };
    });
    var nostage = rows.filter(function (r) { return !r.deal_sub_stage; }).length;
    var funnel = chartCard("funnel", "Where the deals are",
      "Current sub-stage" + (nostage ? " · " + nostage + " not yet in the pipeline" : "") + " · " + scope,
      hbars(stageRows),
      vtable(["Stage", "Deals"], stageRows.map(function (r) { return [r.label, r.value]; })));

    /* --- 2. over time --- */
    var tb = timeBuckets(rows);
    var overTime = chartCard("time", "Reservations over time",
      "By confirmation date, per " + tb.unit + " · " + tb.counted + " of " + rows.length +
      " have one · " + scope,
      colchart(tb.buckets),
      vtable([tb.unit === "week" ? "Week" : "Month", "Reservations"],
        tb.buckets.map(function (b) { return [b.full, b.value]; })));

    /* --- 3. deadline risk --- */
    var riskCounts = [0, 0, 0, 0, 0];
    rows.forEach(function (r) { riskCounts[riskOf(r)] += 1; });
    var riskSegs = RISK_BUCKETS.map(function (b, i) {
      return { label: b.label, color: b.color, value: riskCounts[i] };
    });
    var risk = chartCard("risk", "Deadline risk",
      "How close the current step is to running out · " + scope,
      stackchart(riskSegs),
      vtable(["Bucket", "Reservations"], riskSegs.map(function (s) { return [s.label, s.value]; })));

    /* --- 4. payment status --- */
    var paySegs = PAY_GROUPS.map(function (g) {
      return {
        label: g.label, color: g.color,
        value: rows.filter(function (r) { return g.match.indexOf(r.status) !== -1; }).length
      };
    });
    var pay = chartCard("pay", "Payment status",
      "The same four states as the dot in the pipeline · " + scope,
      stackchart(paySegs),
      vtable(["State", "Reservations"], paySegs.map(function (s) { return [s.label, s.value]; })));

    /* --- 5. by property: only when there is more than one to compare.
           A single filtered property would be a one-bar bar chart, and a one-bar
           bar chart is a stat tile - which the KPI row above already is. --- */
    var byProp = "";
    if (!DASH.property) {
      var agg = {};
      rows.forEach(function (r) {
        var k = r.property_slug || "—";
        if (!agg[k]) {
          agg[k] = { name: r.property_name || k, n: 0, value: 0, overdue: 0 };
        }
        agg[k].n += 1;
        agg[k].value += Number(r.total_cents) || 0;
        if (r.overdue) { agg[k].overdue += 1; }
      });
      var list = Object.keys(agg).map(function (k) { return agg[k]; })
        .sort(function (a, b) { return b.value - a.value; });
      byProp = chartCard("prop", "By property",
        "Reserved value, highest first · " + rangeDef().t.toLowerCase(),
        hbars(list.map(function (p) {
          return {
            label: p.name, value: p.value, valueText: randsShort(p.value),
            note: p.n + (p.n === 1 ? " unit" : " units"),
            tip: p.name + " — " + randsShort(p.value) + " across " + p.n +
              (p.n === 1 ? " reservation" : " reservations") +
              (p.overdue ? ", " + p.overdue + " overdue" : "")
          };
        })),
        vtable(["Property", "Reservations", "Reserved value", "Average", "Overdue"],
          list.map(function (p) {
            return [p.name, p.n, randsShort(p.value), randsShort(p.n ? p.value / p.n : 0), p.overdue];
          })),
        true);
    }

    $("viewDash").innerHTML = head + kpis +
      '<div class="charts">' + funnel + overTime + risk + pay + byProp + "</div>";

    $("dprop").addEventListener("change", function () { DASH.property = this.value; renderDash(); });
    $("drange").addEventListener("change", function () { DASH.range = this.value; renderDash(); });
    if ($("dclear")) {
      $("dclear").addEventListener("click", function () {
        $("q").value = ""; $("fstatus").value = ""; $("fstage").value = ""; $("fprop").value = "";
        load();
      });
    }
    [].forEach.call($("viewDash").querySelectorAll("[data-vtable]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-vtable");
        DASH.tables[k] = !DASH.tables[k];
        renderDash();
      });
    });
    [].forEach.call($("viewDash").querySelectorAll("[data-jump]"), function (el) {
      function go() { tab(el.getAttribute("data-jump")); }
      el.addEventListener("click", go);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
    });
  }

  /* One tooltip element, one delegated pair of handlers. Keyboard focus shows
     exactly what hover shows. */
  function wireTips() {
    var tip = $("viztip");
    function show(el) {
      var t = el.getAttribute("data-tip");
      if (!t) { return; }
      var b = el.getBoundingClientRect();
      tip.textContent = t;
      tip.style.left = Math.round(b.left + b.width / 2) + "px";
      tip.style.top = Math.round(b.top) + "px";
      tip.classList.add("on");
    }
    function hide() { tip.classList.remove("on"); }
    root.addEventListener("mouseover", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
      if (el) { show(el); }
    });
    root.addEventListener("mouseout", function (e) {
      if (e.target && e.target.closest && e.target.closest("[data-tip]")) { hide(); }
    });
    root.addEventListener("focusin", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
      if (el) { show(el); }
    });
    root.addEventListener("focusout", hide);
    /* A tooltip anchored to a rect that has just scrolled away is worse than none. */
    window.addEventListener("scroll", hide, true);
  }

  /* --- Today: what needs a human --- */
  function renderToday(d) {
    var all = d.items;
    var groups = [
      { key: "flagged", title: "Needs a decision", why: "Money arrived but the unit was lost, or someone left a note.",
        rows: all.filter(function (r) { return r.needs_attention; }) },
      { key: "overdue", title: "Deadline passed", why: "The countdown on the buyer's dashboard has run out.",
        rows: all.filter(function (r) { return r.overdue; }) },
      { key: "soon", title: "Due within three days", why: "Worth a call before it becomes the group above.",
        rows: all.filter(function (r) { return !r.overdue && r.days_left !== null && r.days_left <= 3; }) },
      { key: "clearing", title: "EFT still clearing", why: "Payfast has the payment as pending; the unit is held meanwhile.",
        rows: all.filter(function (r) { return r.status === "awaiting_clearance"; }) },
      { key: "nostage", title: "Paid, not yet in the pipeline", why: "Confirmed reservations nobody has moved into a deal stage.",
        rows: all.filter(function (r) { return r.status === "confirmed" && !r.deal_stage; }) }
    ];

    var html = groups.map(function (g) {
      var body = g.rows.length
        ? g.rows.map(function (r) {
            return '<div class="item" data-uuid="' + esc(r.uuid) + '">' +
              '<div><div class="lead">' + esc(name(r)) + "</div>" +
              '<div class="meta">' + esc(r.property_name) + " · " + esc(r.unit_name) +
              (r.deal_sub_stage ? " · " + esc(label(r.deal_sub_stage)) : "") + "</div></div>" +
              "<div>" + (g.key === "flagged"
                ? '<span class="tag crit">' + esc((r.admin_notes || "").slice(0, 60)) + "</span>"
                : deadline(r)) + "</div></div>";
          }).join("")
        : '<div class="none">Nothing here.</div>';
      return '<div class="card group"><h2>' + esc(g.title) +
        '<span class="count' + (g.rows.length && (g.key === "flagged" || g.key === "overdue") ? " hot" : "") + '">' +
        g.rows.length + "</span></h2>" +
        '<div class="why">' + esc(g.why) + "</div>" + body + "</div>";
    }).join("");

    $("viewToday").innerHTML = html;
    [].forEach.call($("viewToday").querySelectorAll(".item"), function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () { openDrawer(el.getAttribute("data-uuid")); });
    });
  }

  /* --- Pipeline table --- */
  function renderRows(items) {
    var tb = $("rows"), em = $("empty");
    if (!items.length) {
      tb.innerHTML = "";
      em.classList.remove("hide");
      em.innerHTML = S.data.summary.total === 0
        ? "<strong>No reservations yet.</strong> The front end still writes to the old flow, so nothing has come through this one."
        : "Nothing matches those filters.";
      return;
    }
    em.classList.add("hide");
    /* Started here rather than at boot, because before the first row is drawn there is
       nothing carrying data-due for it to tick. Idempotent. */
    startDeadlineClock();
    tb.innerHTML = items.map(function (r) {
      return '<tr data-uuid="' + esc(r.uuid) + '">' +
        /* THE RESERVATION NUMBER LEADS THE ROW. It is the handle a buyer quotes on the
           phone and the one the OTP carries, so scanning for it must not mean reading a
           name first. A deal created before generate_reference existed has none - shown
           as a dash rather than blank, so the column reads as empty rather than broken. */
        '<td><span class="mono">' + esc(r.reference || "\u2014") + "</span></td>" +
        "<td><div>" + esc(name(r)) + "</div><div class=\"muted\">" + esc(r.email || "") + "</div></td>" +
        "<td>" + esc(r.property_name) + '<div class="muted">' + esc(r.unit_name) + "</div></td>" +
        '<td><span class="pill s-' + esc(r.status) + '"><span class="dot"></span>' + esc(label(r.status)) + "</span></td>" +
        "<td>" + (r.deal_stage ? esc(label(r.deal_stage)) +
            '<div class="muted">' + esc(label(r.deal_sub_stage || "")) + "</div>"
          : '<span class="muted">not started</span>') + "</td>" +
        "<td>" + deadline(r) + "</td>" +
        '<td class="num">' + esc(rands(r.reservation_fee_cents)) + "</td>" +
        '<td class="num">' + esc(rands(r.total_cents)) + "</td>" +
        "</tr>";
    }).join("");
    [].forEach.call(tb.querySelectorAll("tr"), function (tr) {
      tr.addEventListener("click", function () { openDrawer(tr.getAttribute("data-uuid")); });
    });
  }

  /* ---------- drawer ---------- */
  function find(uuid) {
    return (S.data.items || []).filter(function (r) { return r.uuid === uuid; })[0];
  }

  /* Only the steps this buyer's route actually walks, because that is exactly what
     the buyer sees on their own dashboard. Showing a cash buyer the bond steps -
     even greyed out - invites sales to discuss a step that will never arrive. */
  function stageBar(r) {
    var allowed = ROUTE[r.payer_route] || ROUTE.undecided;
    var idx = allowed.indexOf(r.deal_sub_stage);
    var bar = allowed.map(function (s, i) {
      var cls = "step";
      if (s === r.deal_sub_stage) { cls += " now"; }
      else if (idx > -1 && i < idx) { cls += " done"; }
      return '<span class="' + cls + '">' + esc(label(s)) + "</span>";
    }).join("");
    var hidden = SUBS.filter(function (s) { return allowed.indexOf(s) === -1; });
    if (hidden.length) {
      bar += '<span class="muted" style="font-size:.75rem;align-self:center">' +
             esc(label(r.payer_route || "undecided")) + " route — " +
             esc(hidden.map(label).join(", ")) + " never apply</span>";
    }
    return bar;
  }

  function stageOptions(r) {
    var allowed = ROUTE[r.payer_route] || ROUTE.undecided;
    if (!r.deal_sub_stage) { return allowed.slice(0, 1).concat(allowed.slice(1)); }
    var i = allowed.indexOf(r.deal_sub_stage);
    if (i === -1) { return allowed; }
    return allowed.filter(function (s, j) { return j !== i && j <= i + 1; });
  }

  function openDrawer(uuid) {
    var r = find(uuid);
    if (!r) { return; }
    S.open = uuid;

    var canStage = (r.status === "confirmed" || r.status === "awaiting_clearance");
    var opts = canStage ? stageOptions(r) : [];
    var pct = r.payer_route === "cash" ? r.deposit_cash_pct : r.deposit_bond_pct;
    var estDeposit = (pct && r.total_cents) ? Math.round(r.total_cents * pct / 100) : null;

    $("drawer").innerHTML =
      "<header><div><h1>" + esc(name(r)) + "</h1>" +
        '<div class="muted">' + esc(r.property_name) + " · " + esc(r.unit_name) +
          (r.reference ? ' · <span class="mono">' + esc(r.reference) + "</span>" : "") + "</div></div>" +
        '<button id="close">Close</button></header>' +

      '<dl class="dl">' +
        "<dt>Email</dt><dd>" + esc(r.email || "—") + "</dd>" +
        "<dt>Phone</dt><dd>" + esc(r.phone || "—") + "</dd>" +
        "<dt>Route</dt><dd>" + esc(label(r.payer_route)) + "</dd>" +
        "<dt>Payment</dt><dd>" + esc(label(r.status)) +
          (r.pf_payment_id ? ' <span class="muted mono">' + esc(r.pf_payment_id) + "</span>" : "") + "</dd>" +
        "<dt>Confirmed</dt><dd>" + esc(when(r.confirmed_at)) + "</dd>" +
        "<dt>Portal member</dt><dd>" + (r.has_member ? "yes" : '<span class="muted">not provisioned</span>') + "</dd>" +
      "</dl>" +

      /* FIRST IN THE DRAWER, and that is a deliberate change from 1 Sep. Checking what
         the buyer actually sees is the thing sales reach for most often and it was
         buried under the money; a read-only preview is also the safest thing in here,
         so nothing is risked by putting it where the eye lands. OUTLINED, because the
         solid button in this drawer is the one that ends a deal. */
      '<div class="sect"><h2>What the buyer sees</h2>' +
        '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
          'Opens their dashboard in a new tab, exactly as they see it. Read-only \u2014 the ' +
          'signing and pre-qualification links are disabled \u2014 and recorded against your name.' +
        '</div>' +
        '<div id="pvBox">' +
          (r.has_member
            ? '<button id="pvGo" class="ghost">Preview Buyer\u2019s Dashboard</button>'
            : '<div class="none">No member yet. A portal appears once the reservation fee is ' +
              'paid and the member is provisioned.</div>') +
        '</div>' +
      '</div>' +

      /* The Offer to Purchase link. Built by Xano when the buyer confirms their
         details, then frozen - see the OTP LOCK block in update_reservation. Sales
         asked for it here so they can resend it to a buyer without going near the
         database. Read-only on purpose: this is a record of what was issued, and
         editing the query string by hand would change figures on a signed document. */
      '<div class="sect"><h2>Offer to Purchase</h2>' +
        (r.otp_url
          ? '<div class="otprow">' +
              '<input id="otpUrl" class="mono" readonly value="' + esc(r.otp_url) + '">' +
              '<button id="otpCopy">Copy link</button>' +
              '<a href="' + esc(r.otp_url) + '" target="_blank" rel="noopener">Open</a>' +
            "</div>" +
            '<div class="muted" style="font-size:.8125rem">Built when the buyer confirmed their details, and frozen from that point. Send this if they need it again.</div>'
          : '<div class="muted" style="font-size:.8125rem">No OTP link yet. It is built when the buyer confirms their details, and only for a route that has a template &mdash; Sanford has no cash template today.</div>') +
      "</div>" +

      '<div class="sect"><h2>Money</h2><dl class="dl">' +
        "<dt>Hold fee paid</dt><dd>" + esc(rands(r.reservation_fee_cents)) + "</dd>" +
        "<dt>Purchase price</dt><dd>" + esc(rands(r.total_cents)) +
          (r.addon_count ? ' <span class="muted">incl. ' + r.addon_count + " add-on" + (r.addon_count > 1 ? "s" : "") + "</span>" : "") + "</dd>" +
        "<dt>Purchase deposit</dt><dd>" +
          (r.purchase_deposit_cents !== null && r.purchase_deposit_cents !== undefined
            ? esc(rands(r.purchase_deposit_cents))
            : (estDeposit !== null
                ? '<span class="muted">not set — ' + esc(pct) + "% would be " + esc(randsShort(estDeposit)) + "</span>"
                : '<span class="muted">not set</span>')) + "</dd>" +
      "</dl>" +
      (r.addon_count
        ? '<div class="muted" style="font-size:.8125rem">' +
            r.addons.map(function (a) { return esc(a.name) + " · " + esc(rands(a.price_cents)); }).join("<br>") +
          "</div>"
        : "") +
      "</div>" +

      '<div class="sect"><h2>Deal stage</h2>' +
        (canStage
          ? '<div class="stagebar">' + stageBar(r) + "</div>" +
            '<div class="muted" style="font-size:.8125rem;margin-bottom:12px">' +
              (r.deal_stage_due_at
                ? (r.overdue ? "Deadline passed " : "Due ") + esc(day(r.deal_stage_due_at))
                : "No countdown on this step.") +
              (r.deal_stage_changed_at ? " · last moved " + esc(when(r.deal_stage_changed_at)) : "") +
            "</div>" +
            (opts.length
              ? '<div style="margin-bottom:10px"><label for="mvSub">Move to</label>' +
                '<select id="mvSub">' + opts.map(function (s) {
                  var w = WINDOW_DAYS[s];
                  return '<option value="' + esc(s) + '">' + esc(label(s)) +
                    (w ? " — " + w + " day window" : " — no countdown") + "</option>";
                }).join("") + "</select></div>" +
                '<div style="margin-bottom:10px"><label for="mvDue">Deadline override <span class="muted">(optional)</span></label>' +
                '<input id="mvDue" type="date"></div>' +
                '<div style="margin-bottom:12px"><label for="mvWhy">Reason</label>' +
                '<input id="mvWhy" type="text" placeholder="What happened"></div>' +
                '<button class="primary" id="mvGo">Move deal</button>' +
                '<div class="err" id="mvErr" style="margin-top:10px"></div>' +
                '<div class="ok" id="mvOk"></div>'
              : '<div class="none">Nothing further to move to on this route.</div>')
          : '<div class="none">A deal stage starts once the hold fee is paid. This reservation is ' +
            esc(label(r.status)) + ".</div>") +
      "</div>" +

      (r.admin_notes
        ? '<div class="sect"><h2>Note</h2><div style="color:var(--critical)">' + esc(r.admin_notes) + "</div></div>"
        : "") +

      (canStage
        ? '<div class="sect"><h2>Deadline</h2>' +
            '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">Changes the countdown on this buyer\'s dashboard without moving their deal.</div>' +
            '<div style="margin-bottom:10px"><label for="dlDue">New deadline</label>' +
            '<input id="dlDue" type="date"></div>' +
            '<div style="margin-bottom:10px"><label style="display:flex;gap:8px;align-items:center;font-size:.8125rem">' +
              '<input id="dlClear" type="checkbox" style="width:auto"> Remove the deadline instead (for a step with no countdown)</label></div>' +
            '<div style="margin-bottom:12px"><label for="dlWhy">Reason</label>' +
            '<input id="dlWhy" type="text" placeholder="Why this buyer gets a different date"></div>' +
            '<button id="dlGo">Save deadline</button>' +
            '<div class="err" id="dlErr" style="margin-top:10px"></div><div class="ok" id="dlOk"></div>' +
          '</div>'
        : '') +

      '<div class="sect"><h2>Add-ons</h2>' +
        '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
          (canStage
            ? 'This changes the purchase price on a deal that may already be signed. The before and after are recorded against your name so an addendum can be written from it.'
            : 'Priced through the same rules engine the buyer uses.') +
        '</div>' +
        '<div id="addonBox"><div class="spin">Loading the catalogue\u2026</div></div>' +
        '<div id="addonFoot" class="hide">' +
          '<div class="muted" style="font-size:.8125rem;margin:10px 0">Add-ons subtotal, estimated: <span class="mono" id="addonEst">\u2014</span>' +
            '<br>The server reprices on save \u2014 bundles, dependencies and either/or groups can change this.</div>' +
          '<div style="margin-bottom:12px"><label for="adWhy">Reason</label>' +
          '<input id="adWhy" type="text" placeholder="What the buyer asked for"></div>' +
          '<button class="primary" id="adGo">Save add-ons</button>' +
          '<div class="err" id="adErr" style="margin-top:10px"></div><div class="ok" id="adOk"></div>' +
        '</div>' +
      '</div>' +

      '<div class="sect"><h2>Upgrades</h2>' +
        '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
          'Agreed with the buyer AFTER they reserved. These are kept out of the purchase price above &mdash; that is the figure the Offer to Purchase was signed at &mdash; and shown on their order summary as a separate total.' +
        '</div>' +
        '<div id="upBox"><div class="spin">Loading upgrades\u2026</div></div>' +
      '</div>' +

      '<div class="sect"><h2>Documents</h2>' +
        '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
          'Signed copies the buyer can download from their portal. Links must be https.' +
        '</div>' +
        '<div id="docBox"><div class="spin">Loading documents\u2026</div></div>' +
      '</div>' +

      /* WHAT THE BUYER SEES - THE ACTUAL PAGE, in a new tab. This was a panel of counts
         for about an hour, and a panel of counts is a second implementation of the
         portal: the first time it disagreed with the real page, the console would have
         been confidently wrong about what a buyer was looking at. The portal draws
         itself, with this buyer's data, through /staff/reservations/{uuid}/portal-view -
         one reader, no drift.

         A NEW TAB rather than an iframe, because the portal is a full page with its own
         navbar, tabs and theme, and because a salesperson wants to keep the deal open
         beside it.

         THE STAFF TOKEN GOES THROUGH localStorage, NEVER THE URL. A one-time note
         addressed to this reservation, good for sixty seconds, which the portal consumes
         and deletes. A token in a query string would live in history, in logs and in
         every referrer that page emits.

         Opening it is audited with your name - which is why it is a button and not
         something the drawer does on its own. */
      /* END THE DEAL. Last in the drawer because it is the only irreversible thing here. */
      (canStage && r.status !== "cancelled"
        ? '<div class="sect"><h2>End this deal</h2>' +
            '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
              'Releases the home in Xano and tells the buyer, in their portal, that the reservation is no longer active. ' +
              'Nothing is deleted \u2014 the record, the money and the documents stay. ' +
              'The Reserved toggle in the Webflow Units collection is <strong>not</strong> cleared; do that by hand.' +
            '</div>' +
            '<div style="margin-bottom:10px"><label for="cxWhy">Reason</label>' +
            '<input id="cxWhy" type="text" placeholder="The buyer reads this \u2014 write it for them"></div>' +
            (r.status === "confirmed"
              ? '<div style="margin-bottom:12px"><label style="display:flex;gap:8px;align-items:flex-start;font-size:.8125rem">' +
                  '<input id="cxPaid" type="checkbox" style="width:auto;margin-top:3px"> ' +
                  'This buyer has paid the hold fee. I am ending the deal anyway.</label></div>'
              : '') +
            '<button id="cxGo">Cancel this reservation</button>' +
            '<div class="err" id="cxErr" style="margin-top:10px"></div><div class="ok" id="cxOk"></div>' +
          '</div>'
        : (r.status === "cancelled"
            /* The reason is NOT read from the list row - list_reservations does not send
               cancel_reason, and printing a fallback here would put "no reason was
               recorded" on a deal that has one. The buyer's own view carries it. */
            ? '<div class="sect"><h2>Cancelled</h2><div class="muted" style="font-size:.8125rem">' +
              'This reservation has been ended and the home released. The reason the buyer reads is in ' +
              '\u201cWhat the buyer sees\u201d above.</div></div>'
            : '')) +

      '<div class="sect"><h2>Not editable here yet</h2>' +
        '<div class="muted" style="font-size:.8125rem">Recording a purchase-deposit payment. The columns exist; nothing writes them yet.</div></div>';

    $("scrim").classList.add("open");
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");

    $("close").addEventListener("click", closeDrawer);

    /* Copy. navigator.clipboard is the real path - the page is https and this runs
       from a click, so both of its preconditions hold. execCommand is the fallback
       for a browser that refuses. Neither is allowed to throw into the drawer, and
       the button says what happened rather than failing silently. */
    var otpCopy = $("otpCopy");
    if (otpCopy) {
      otpCopy.addEventListener("click", function () {
        var inp = $("otpUrl");
        if (!inp) { return; }
        var settle = function (ok) {
          otpCopy.textContent = ok ? "Copied" : "Select and press Ctrl+C";
          setTimeout(function () { otpCopy.textContent = "Copy link"; }, 2000);
        };
        try { inp.select(); inp.setSelectionRange(0, 99999); } catch (e) {}
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(inp.value).then(
            function () { settle(true); },
            function () { settle(false); }
          );
          return;
        }
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        settle(ok);
      });
    }
    var go = $("mvGo");
    if (go) { go.addEventListener("click", function () { moveStage(r); }); }

    var dlGo = $("dlGo");
    if (dlGo) { dlGo.addEventListener("click", function () { saveDeadline(r); }); }

    var adGo = $("adGo");
    if (adGo) { adGo.addEventListener("click", function () { saveAddons(r); }); }

    var dlClear = $("dlClear");
    if (dlClear) {
      dlClear.addEventListener("change", function () {
        $("dlDue").disabled = dlClear.checked;
      });
    }

    var pvGo = $("pvGo");
    if (pvGo) { pvGo.addEventListener("click", function () { openBuyerView(r); }); }

    var cxGo = $("cxGo");
    if (cxGo) { cxGo.addEventListener("click", function () { cancelDeal(r); }); }

    loadCatalogue(r);
    loadUpgrades(r);
    loadDocuments(r);
  }

  /* ---------- the buyer's view ---------- */

  var PREVIEW_HANDOFF = "hl_preview_handoff";

  /* The handoff, and the whole security argument for it, is written up beside the
     panel above. Written immediately before the tab is opened so its sixty-second
     window starts as late as possible. */
  function openBuyerView(r) {
    var box = $("pvBox");
    var tok = token();
    if (!tok) {
      if (box) { box.innerHTML = '<div class="err">Your session has expired. Sign in again.</div>'; }
      return;
    }

    try {
      localStorage.setItem(PREVIEW_HANDOFF, JSON.stringify({
        t: tok, uuid: r.uuid, at: Date.now()
      }));
    } catch (e) {
      /* Private browsing, or storage blocked. Say so rather than opening a tab that
         will ask them to sign in with no explanation. */
      if (box) {
        box.innerHTML = '<div class="err">This browser will not let the console hand your ' +
          'session to another tab, so the preview cannot open. Storage is blocked \u2014 ' +
          'usually a private window or a strict privacy setting.</div>';
      }
      return;
    }

    /* NOT rel=noopener. The clone of sessionStorage into the new tab is the fallback
       the preview uses on a refresh, and severing the opener relationship is what
       stops some browsers making it. Both pages are ours and same-origin, so there is
       nothing here for noopener to protect against. */
    var win = window.open("/portal?preview=" + encodeURIComponent(r.uuid), "_blank");
    if (!win) {
      if (box) {
        box.innerHTML = '<div class="err">Your browser blocked the new tab. Allow pop-ups ' +
          'for this site and try again.</div>';
      }
      return;
    }
    if (box) {
      box.innerHTML = '<div class="ok">Opened in a new tab.</div>' +
        '<button id="pvGo" class="ghost">Preview Buyer\u2019s Dashboard</button>';
      var again = $("pvGo");
      if (again) { again.addEventListener("click", function () { openBuyerView(r); }); }
    }
  }

  /* ---------- cancel ---------- */
  function cancelDeal(r) {
    var why = ($("cxWhy").value || "").trim();
    var paid = $("cxPaid");
    var go = $("cxGo");

    if (why.length < 3) {
      $("cxErr").textContent = "Give a reason \u2014 the buyer reads it in their portal.";
      return;
    }
    if (!window.confirm("End " + (r.reference || "this reservation") + " for " + name(r) +
                        "?\n\nThe home is released and their portal will say the reservation is no longer active.")) {
      return;
    }

    go.disabled = true;
    $("cxErr").textContent = "";
    $("cxOk").textContent = "Cancelling\u2026";

    var body = { reason: why };
    if (paid && paid.checked) { body.confirm_paid = true; }

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/cancel",
        { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        $("cxOk").textContent = "Cancelled. " + (res.next_step || "");
        return load();
      })
      .then(function () { if (S.open) { openDrawer(S.open); } })
      .catch(function (e) { $("cxOk").textContent = ""; $("cxErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  /* ---------- add-on editor ----------
     The catalogue comes from the same public endpoint the buyer's own page uses, so
     sales can never offer an add-on the buyer could not have chosen. Prices are shown
     for orientation only - they are never sent, and the server prices from its cache. */
  function loadCatalogue(r) {
    var box = $("addonBox");
    if (!box) { return; }

    var cached = S.catalogue[r.property_slug];
    if (cached) { renderAddonEditor(r, cached); return; }

    api("/public/addons?property=" + encodeURIComponent(r.property_slug), { auth: false })
      .then(function (d) {
        S.catalogue[r.property_slug] = d;
        if (S.open === r.uuid) { renderAddonEditor(r, d); }
      })
      .catch(function (e) {
        if (S.open === r.uuid) {
          box.innerHTML = '<div class="err">Could not load the catalogue \u2014 ' + esc(e.message) + "</div>";
        }
      });
  }

  function renderAddonEditor(r, cat) {
    var box = $("addonBox");
    if (!box) { return; }

    var chosen = {};
    (r.addons || []).forEach(function (a) { chosen[a.slug] = true; });

    var sections = (cat && cat.sections) || [];
    if (!sections.length) {
      box.innerHTML = '<div class="none">No add-ons are tagged to this property.</div>';
      return;
    }

    var html = sections.map(function (sec) {
      var rows = (sec.items || []).map(function (it) {
        var isOn = !!chosen[it.slug];
        // A sold-out add-on stays selectable only if this buyer already has it -
        // otherwise sales could re-add something there is no longer stock of.
        var blocked = it.sold_out && !isOn;
        var kind = it.radio_group ? "radio" : "checkbox";
        var nm = it.radio_group ? ' name="adgrp-' + esc(it.radio_group) + '"' : "";
        return '<label style="display:flex;gap:8px;align-items:baseline;padding:5px 0' +
          (blocked ? ";opacity:.45" : "") + '">' +
          '<input type="' + kind + '"' + nm + ' class="adopt" value="' + esc(it.slug) + '"' +
            ' data-cents="' + (it.price_cents || 0) + '"' +
            (it.radio_group ? ' data-group="' + esc(it.radio_group) + '"' : "") +
            (isOn ? " checked" : "") + (blocked ? " disabled" : "") +
            ' style="width:auto;margin-top:3px">' +
          "<span>" + esc(it.display_name) +
            ' <span class="muted mono">' + esc(it.price_display || rands(it.price_cents)) + "</span>" +
            (blocked ? ' <span class="tag">sold out</span>' : "") +
            (it.radio_group ? ' <span class="muted" style="font-size:.75rem">one of this group only</span>' : "") +
          "</span></label>";
      }).join("");

      var clearRow = "";
      var grp = (sec.items || []).filter(function (i) { return i.radio_group; })[0];
      if (grp) {
        clearRow = '<label style="display:flex;gap:8px;align-items:baseline;padding:5px 0">' +
          '<input type="radio" name="adgrp-' + esc(grp.radio_group) + '" class="adopt" value=""' +
          ' data-cents="0" data-group="' + esc(grp.radio_group) + '" style="width:auto;margin-top:3px">' +
          '<span class="muted">None from this group</span></label>';
      }

      return '<div style="margin-bottom:14px"><div style="font-size:.75rem;text-transform:uppercase;' +
        'letter-spacing:.04em;color:var(--ink-2);font-weight:600;margin-bottom:4px">' +
        esc(sec.section || sec.section_slug) + "</div>" + rows + clearRow + "</div>";
    }).join("");

    box.innerHTML = html;
    $("addonFoot").classList.remove("hide");

    [].forEach.call(box.querySelectorAll(".adopt"), function (el) {
      el.addEventListener("change", updateAddonEstimate);
    });
    updateAddonEstimate();
  }

  function chosenSlugs() {
    var box = $("addonBox");
    if (!box) { return []; }
    var out = [];
    [].forEach.call(box.querySelectorAll(".adopt"), function (el) {
      if (el.checked && el.value) { out.push(el.value); }
    });
    return out;
  }

  function updateAddonEstimate() {
    var box = $("addonBox"), est = $("addonEst");
    if (!box || !est) { return; }
    var total = 0;
    [].forEach.call(box.querySelectorAll(".adopt"), function (el) {
      if (el.checked && el.value) { total += Number(el.getAttribute("data-cents") || 0); }
    });
    est.textContent = rands(total);
  }

  function saveAddons(r) {
    var why = $("adWhy").value.trim(), go = $("adGo");
    if (!why) { $("adErr").textContent = "Give a reason \u2014 this changes a purchase price."; return; }

    go.disabled = true;
    $("adErr").textContent = "";
    $("adOk").textContent = "Saving\u2026";

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/addons",
        { method: "POST", body: JSON.stringify({ addon_slugs: chosenSlugs(), reason: why }) })
      .then(function (res) {
        var bits = [];
        if (res.added && res.added.length) { bits.push("added " + res.added.map(label).join(", ")); }
        if (res.removed && res.removed.length) { bits.push("removed " + res.removed.map(label).join(", ")); }
        if (!bits.length) { bits.push("no change"); }
        var delta = res.total_delta_cents || 0;
        $("adOk").textContent = bits.join("; ") + ". Purchase price " +
          (delta === 0 ? "unchanged" : (delta > 0 ? "up " : "down ") + rands(Math.abs(delta))) +
          " to " + rands(res.total_cents) + ".";
        // The engine explains every rule that fired - a silently dropped add-on is
        // exactly the kind of thing sales must see rather than discover later.
        if (res.notes && res.notes.length) { $("adErr").textContent = res.notes.join(" "); }
        return load();
      })
      .then(function () { if (S.open) { openDrawer(S.open); } })
      .catch(function (e) { $("adOk").textContent = ""; $("adErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  /* ---------- upgrades ----------
     THE SERVER PRICES ANYTHING THE CATALOGUE PRICES. A price box appears only for an
     option the catalogue deliberately leaves unpriced - the on-consultation ones -
     and for anything else the figure is not sent at all. Typing over a catalogue
     price is refused by Xano rather than ignored, so this panel never pretends a
     price was accepted when it was not. */
  function loadUpgrades(r) {
    var box = $("upBox");
    if (!box) { return; }
    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/options")
      .then(function (d) { if (S.open === r.uuid) { renderUpgrades(r, d); } })
      .catch(function (e) {
        if (S.open === r.uuid) {
          box.innerHTML = '<div class="err">Could not load upgrades \u2014 ' + esc(e.message) + "</div>";
        }
      });
  }

  function renderUpgrades(r, d) {
    var box = $("upBox");
    if (!box) { return; }

    var agreed = d.agreed || [];
    var groups = d.groups || [];

    var agreedHtml = agreed.length
      ? agreed.map(function (a) {
          return '<div class="otprow" style="align-items:baseline">' +
            "<span>" + esc(a.name) +
              ' <span class="muted mono">' + esc(rands(a.price_cents)) + "</span>" +
              (a.is_consultation_price ? ' <span class="tag">agreed price</span>' : "") +
            "</span>" +
            '<button class="upDrop" data-slug="' + esc(a.option_slug) + '">Remove</button>' +
          "</div>";
        }).join("")
      : '<div class="none">Nothing agreed since this buyer reserved.</div>';

    // Only what is not already on the deal. Re-adding something is a replace, and a
    // picker that offers it again invites one by accident.
    var opts = [];
    groups.forEach(function (g) {
      var avail = (g.options || []).filter(function (o) { return !o.is_agreed; });
      if (!avail.length) { return; }
      opts.push('<optgroup label="' + esc(g.name || g.slug) + '">' +
        avail.map(function (o) {
          var price = o.needs_price
            ? "price on consultation"
            : (o.price_basis === "missing" ? "no price in the catalogue" : rands(o.price_cents));
          return '<option value="' + esc(o.slug) + '"' +
            ' data-needs="' + (o.needs_price ? "1" : "") + '"' +
            ' data-missing="' + (o.price_basis === "missing" ? "1" : "") + '">' +
            esc(o.name) + " \u2014 " + esc(price) + "</option>";
        }).join("") + "</optgroup>");
    });

    /* The server withholds type-restricted upgrades when the reservation's snapshot
       records no unit type, because the writer refuses them - the two have to agree
       or sales pick something and get an error they cannot act on. Say so, rather
       than letting the list just look short. */
    var withheld = Number(d.withheld_no_unit_type || 0);
    var withheldHtml = (d.unit_type_known === false && withheld > 0)
      ? '<div class="err" style="margin-bottom:10px">' +
          "This reservation has no unit type recorded, so " + withheld +
          " upgrade" + (withheld === 1 ? "" : "s") + " that only apply to particular types " +
          "cannot be offered. Fix the unit type on the reservation first." +
        "</div>"
      : "";

    box.innerHTML =
      '<div style="margin-bottom:12px">' + agreedHtml + "</div>" +
      '<div class="muted" style="font-size:.8125rem;margin-bottom:10px">' +
        "Agreed so far: " + '<span class="mono">' + esc(rands(d.agreed_extras_total_cents || 0)) + "</span>" +
        " &middot; signed purchase price " + '<span class="mono">' + esc(rands(d.signed_total_cents)) + "</span>" +
      "</div>" +
      withheldHtml +
      (opts.length
        ? '<div style="margin-bottom:10px"><label for="upPick">Add an upgrade</label>' +
          '<select id="upPick"><option value="">Choose\u2026</option>' + opts.join("") + "</select></div>" +
          '<div id="upPriceRow" class="hide" style="margin-bottom:10px">' +
            '<label for="upPrice">Agreed price</label>' +
            '<input id="upPrice" type="text" inputmode="decimal" placeholder="e.g. 125000 for R125,000">' +
            '<div class="muted" style="font-size:.75rem;margin-top:4px">In rands. This option has no catalogue price, so what you type is what the buyer sees.</div>' +
          "</div>" +
          '<div style="margin-bottom:12px"><label for="upWhy">Reason</label>' +
          '<input id="upWhy" type="text" placeholder="What was agreed, and when"></div>' +
          '<button class="primary" id="upGo">Add upgrade</button>'
        : '<div class="none">' +
            (withheld > 0
              ? "Nothing can be offered until the unit type is recorded."
              : "Every upgrade on this development is already on the deal.") +
          "</div>") +
      '<div class="err" id="upErr" style="margin-top:10px"></div><div class="ok" id="upOk"></div>';

    var pick = $("upPick");
    if (pick) {
      pick.addEventListener("change", function () {
        var o = pick.options[pick.selectedIndex];
        var needs = o && o.getAttribute("data-needs") === "1";
        $("upPriceRow").classList[needs ? "remove" : "add"]("hide");
      });
    }
    var upGo = $("upGo");
    if (upGo) { upGo.addEventListener("click", function () { addUpgrade(r); }); }

    [].forEach.call(box.querySelectorAll(".upDrop"), function (btn) {
      btn.addEventListener("click", function () { dropUpgrade(r, btn.getAttribute("data-slug")); });
    });
  }

  function addUpgrade(r) {
    var pick = $("upPick"), why = $("upWhy").value.trim(), go = $("upGo");
    var slug = pick ? pick.value : "";
    if (!slug) { $("upErr").textContent = "Choose an upgrade first."; return; }
    if (!why) { $("upErr").textContent = "Give a reason \u2014 it goes on the record with your name."; return; }

    var o = pick.options[pick.selectedIndex];
    var needs = o.getAttribute("data-needs") === "1";
    var missing = o.getAttribute("data-missing") === "1";
    if (missing) {
      $("upErr").textContent = "That option is priced from a stored figure that is not there. Fix the catalogue rather than working around it.";
      return;
    }

    var body = { option_slug: slug, reason: why };
    if (needs) {
      var raw = ($("upPrice").value || "").replace(/[^0-9.]/g, "");
      if (!raw) { $("upErr").textContent = "This upgrade needs a price."; return; }
      var rand = Number(raw);
      if (!isFinite(rand) || rand < 0) { $("upErr").textContent = "That is not a price."; return; }
      // The field is in rands because that is how sales talk; the API is in cents
      // because that is the only way money is stored. Convert once, here.
      body.price_cents = Math.round(rand * 100);
    }

    go.disabled = true;
    $("upErr").textContent = "";
    $("upOk").textContent = "Saving\u2026";

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/options",
        { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        $("upOk").textContent = res.name + " added at " + rands(res.price_cents) +
          ". Extras now " + rands(res.agreed_extras_total_cents) + ".";
        loadUpgrades(r);
      })
      .catch(function (e) { $("upOk").textContent = ""; $("upErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  function dropUpgrade(r, slug) {
    var why = window.prompt("Why is " + label(slug) + " coming off this order?");
    if (why === null) { return; }
    why = why.trim();
    if (!why) { $("upErr").textContent = "A reason is required to remove an upgrade."; return; }

    $("upErr").textContent = "";
    $("upOk").textContent = "Removing\u2026";
    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/options/remove",
        { method: "POST", body: JSON.stringify({ option_slug: slug, reason: why }) })
      .then(function (res) {
        $("upOk").textContent = res.name + " removed. Extras now " + rands(res.agreed_extras_total_cents) + ".";
        loadUpgrades(r);
      })
      .catch(function (e) { $("upOk").textContent = ""; $("upErr").textContent = e.message; });
  }

  /* ---------- documents ----------
     The vocabulary comes from the server, per property, so a development with its own
     document set needs nothing here. Adding a type the deal already has REPLACES it,
     and the panel says so before the save rather than after. */
  function loadDocuments(r) {
    var box = $("docBox");
    if (!box) { return; }
    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/documents")
      .then(function (d) { if (S.open === r.uuid) { renderDocuments(r, d); } })
      .catch(function (e) {
        if (S.open === r.uuid) {
          box.innerHTML = '<div class="err">Could not load documents \u2014 ' + esc(e.message) + "</div>";
        }
      });
  }

  function renderDocuments(r, d) {
    var box = $("docBox");
    if (!box) { return; }

    var live = d.documents || [];
    var types = d.document_types || [];
    var have = {};
    live.forEach(function (x) { have[x.doc_type] = x.label; });

    var listHtml = live.length
      ? live.map(function (x) {
          return '<div class="otprow" style="align-items:baseline">' +
            "<span>" + esc(x.label) +
              ' <a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" class="muted">open</a>' +
              '<br><span class="muted" style="font-size:.75rem">added by ' + esc(x.added_by || "\u2014") + "</span>" +
            "</span>" +
            '<button class="docDrop" data-id="' + esc(String(x.id)) + '">Remove</button>' +
          "</div>";
        }).join("")
      : '<div class="none">No documents on this deal yet.</div>';

    box.innerHTML =
      '<div style="margin-bottom:12px">' + listHtml + "</div>" +
      '<div style="margin-bottom:10px"><label for="docType">Document</label>' +
      '<select id="docType"><option value="">Choose\u2026</option>' +
        types.map(function (t) {
          return '<option value="' + esc(t.slug) + '">' + esc(t.label) +
            (have[t.slug] ? " \u2014 replaces the one already there" : "") + "</option>";
        }).join("") +
        '<option value="other">Something else\u2026</option>' +
      "</select></div>" +
      '<div id="docLabelRow" class="hide" style="margin-bottom:10px">' +
        '<label for="docLabel">Name it</label><input id="docLabel" type="text" placeholder="What the buyer will see"></div>' +
      '<div style="margin-bottom:10px"><label for="docUrl">Link</label>' +
      '<input id="docUrl" type="url" placeholder="https://\u2026"></div>' +
      '<div style="margin-bottom:12px"><label for="docWhy">Reason</label>' +
      '<input id="docWhy" type="text" placeholder="Why this is going on the portal"></div>' +
      '<button class="primary" id="docGo">Add document</button>' +
      '<div class="err" id="docErr" style="margin-top:10px"></div><div class="ok" id="docOk"></div>';

    var sel = $("docType");
    if (sel) {
      sel.addEventListener("change", function () {
        $("docLabelRow").classList[sel.value === "other" ? "remove" : "add"]("hide");
      });
    }
    var go = $("docGo");
    if (go) { go.addEventListener("click", function () { addDocument(r); }); }

    [].forEach.call(box.querySelectorAll(".docDrop"), function (btn) {
      btn.addEventListener("click", function () { dropDocument(r, btn.getAttribute("data-id")); });
    });
  }

  function addDocument(r) {
    var type = $("docType").value;
    var url = $("docUrl").value.trim();
    var why = $("docWhy").value.trim();
    var go = $("docGo");

    if (!type) { $("docErr").textContent = "Choose a document type."; return; }
    if (!url) { $("docErr").textContent = "Give a link."; return; }
    // Checked here so a typo is caught before a round trip; Xano refuses it too, and
    // the portal refuses to render it - the guard nearest the sink is the real one.
    if (url.toLowerCase().indexOf("https://") !== 0) {
      $("docErr").textContent = "The link must start with https://";
      return;
    }
    if (!why) { $("docErr").textContent = "Give a reason \u2014 it goes on the record with your name."; return; }

    var body = { doc_type: type, url: url, reason: why };
    if (type === "other") {
      var lbl = $("docLabel").value.trim();
      if (!lbl) { $("docErr").textContent = "Name the document."; return; }
      body.label = lbl;
    }

    go.disabled = true;
    $("docErr").textContent = "";
    $("docOk").textContent = "Saving\u2026";

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/documents",
        { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        $("docOk").textContent = res.label + (res.replaced ? " replaced the previous one." : " added.");
        loadDocuments(r);
      })
      .catch(function (e) { $("docOk").textContent = ""; $("docErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  function dropDocument(r, id) {
    var why = window.prompt("Why is this document coming off the buyer's portal?");
    if (why === null) { return; }
    why = why.trim();
    if (!why) { $("docErr").textContent = "A reason is required to remove a document."; return; }

    $("docErr").textContent = "";
    $("docOk").textContent = "Removing\u2026";
    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/documents/remove",
        { method: "POST", body: JSON.stringify({ document_id: Number(id), reason: why }) })
      .then(function (res) {
        $("docOk").textContent = res.label + " removed.";
        loadDocuments(r);
      })
      .catch(function (e) { $("docOk").textContent = ""; $("docErr").textContent = e.message; });
  }

  /* ---------- deadline ---------- */
  function saveDeadline(r) {
    var clearIt = $("dlClear").checked;
    var due = $("dlDue").value;
    var why = $("dlWhy").value.trim();
    var go = $("dlGo");

    if (!why) { $("dlErr").textContent = "Give a reason \u2014 it goes on the record with your name."; return; }
    if (!clearIt && !due) { $("dlErr").textContent = "Pick a date, or tick remove."; return; }

    go.disabled = true;
    $("dlErr").textContent = "";
    $("dlOk").textContent = "Saving\u2026";

    var body = { reason: why };
    if (clearIt) { body.clear = true; }
    else { body.new_due_at = new Date(due + "T12:00:00").getTime() + ""; }

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/deadline",
        { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        $("dlOk").textContent = res.cleared
          ? "Deadline removed."
          : "Deadline now " + day(res.deal_stage_due_at) +
            (res.days_moved ? " (" + (res.days_moved > 0 ? "+" : "") + res.days_moved + " days)" : "") +
            (res.is_in_past ? " \u2014 note that is already in the past." : "");
        return load();
      })
      .then(function () { if (S.open) { openDrawer(S.open); } })
      .catch(function (e) { $("dlOk").textContent = ""; $("dlErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  function closeDrawer() {
    S.open = null;
    $("scrim").classList.remove("open");
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
  }

  function moveStage(r) {
    var sub = $("mvSub").value;
    var due = $("mvDue").value;
    var why = $("mvWhy").value.trim();
    var go = $("mvGo");

    if (!why) { $("mvErr").textContent = "Give a reason — it goes on the record with your name."; return; }

    go.disabled = true;
    $("mvErr").textContent = "";
    $("mvOk").textContent = "Saving…";

    var body = { deal_stage: "finance", deal_sub_stage: sub, reason: why };
    if (due) { body.due_at_override = new Date(due + "T12:00:00").getTime() + ""; }

    api("/staff/reservations/" + encodeURIComponent(r.uuid) + "/stage",
        { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        $("mvOk").textContent = "Moved to " + label(res.deal_sub_stage) +
          (res.deal_stage_due_at ? ", due " + day(res.deal_stage_due_at) : "") + ".";
        return load();
      })
      .then(function () { if (S.open) { openDrawer(S.open); } })
      .catch(function (e) { $("mvOk").textContent = ""; $("mvErr").textContent = e.message; })
      .then(function () { go.disabled = false; });
  }

  /* ---------- csv ---------- */
  function csv() {
    if (!S.data || !S.data.items.length) { return; }
    var cols = ["uuid", "reference", "status", "deal_stage", "deal_sub_stage", "deal_stage_due_at",
      "property_slug", "unit_name", "first_name", "last_name", "email", "phone", "payer_route",
      "reservation_fee_cents", "total_cents", "purchase_deposit_cents", "purchase_deposit_paid_cents",
      "addon_count", "payment_status", "pf_payment_id", "confirmed_at", "admin_notes"];
    var lines = [cols.join(",")];
    S.data.items.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c];
        if (v === null || v === undefined) { return ""; }
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "heartland-pipeline-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /* ---------- session ---------- */
  /* The boot screen covers the FIRST load only. A Refresh or a filter change must
     not black out a pipeline the salesperson is reading - those already have their
     own affordance on the button. */
  function hideBoot() { $("boot").classList.add("gone"); }

  function showApp() {
    $("loginWrap").classList.add("hide");
    $("app").classList.remove("hide");
    load();
  }
  function signOut(msg) {
    clearSession();
    S.data = null;
    closeDrawer();
    hideBoot();
    $("app").classList.add("hide");
    $("loginWrap").classList.remove("hide");
    $("loginErr").textContent = msg || "";
  }

  $("signin").addEventListener("click", function () {
    var e = $("email").value.trim(), p = $("pw").value;
    if (!e || !p) { $("loginErr").textContent = "Email and password, please."; return; }
    $("loginErr").textContent = "Checking…";
    api("/staff/login", { auth: false, method: "POST", body: JSON.stringify({ email: e, password: p }) })
      .then(function (d) {
        setSession(d.authToken, d.staff);
        $("pw").value = "";
        $("loginErr").textContent = "";
        showApp();
      })
      .catch(function (err) { $("loginErr").textContent = err.message; });
  });
  $("pw").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { $("signin").click(); } });

  /* Reveal, for the long password typed on a laptop in a show house. Focus and the
     caret are put back where they were, or the toggle costs more than it saves. */
  $("pwToggle").addEventListener("click", function () {
    var f = $("pw"), on = f.type === "password";
    var at = f.selectionStart, to = f.selectionEnd;
    f.type = on ? "text" : "password";
    this.textContent = on ? "Hide" : "Show";
    this.setAttribute("aria-pressed", on ? "true" : "false");
    this.setAttribute("aria-label", on ? "Hide password" : "Show password");
    f.focus();
    try { f.setSelectionRange(at, to); } catch (e) { /* type just changed - fine */ }
  });

  $("signout").addEventListener("click", function () { signOut(""); });
  $("refresh").addEventListener("click", load);
  $("csv").addEventListener("click", csv);
  $("scrim").addEventListener("click", closeDrawer);

  /* ---------- settings ----------
     The scheme switch lives here rather than in the header: it is a preference set
     once, not an action taken daily, and the header row is for the three things
     that are. The modal is deliberately roomy - density, a default tab and the
     white-label brand all belong in it later. */
  var setReturn = null;
  function openSettings(trigger) {
    setReturn = trigger || null;
    var m = $("settings");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    var first = m.querySelector('[data-scheme-pref][aria-pressed="true"]') ||
      m.querySelector("[data-scheme-pref]");
    if (first) { first.focus(); }
  }
  function closeSettings() {
    var m = $("settings");
    if (!m.classList.contains("open")) { return false; }
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    /* Focus goes back where it came from, or it lands on <body> and the next Tab
       starts from the top of the page. */
    if (setReturn && setReturn.focus) { setReturn.focus(); }
    setReturn = null;
    return true;
  }
  root.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-settings-open]") : null;
    if (t) { openSettings(t); return; }
    if (e.target && e.target.closest && e.target.closest("[data-settings-close]")) { closeSettings(); return; }
    if (e.target && e.target.closest && e.target.closest("[data-nr-open]")) { nrOpen(); return; }
    if (e.target && e.target.closest && e.target.closest("[data-nr-close]")) { nrClose(); }
  });

  /* Escape closes the settings modal first - it is the thing on top - and only
     falls through to the drawer when the modal is already shut. */
  /* Escape closes whatever is on top, one layer per press: the new-reservation form
     over the settings modal over the drawer. Closing the form on the first press
     matters most - it is the one holding twenty minutes of typing, and a press meant
     for a native date picker must not throw that away along with it. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") { return; }
    if (nrClose()) { return; }
    if (closeSettings()) { return; }
    closeDrawer();
  });

  /* Dashboard leads, because the first question on opening the console is "how are
     we doing"; the two urgent KPIs on it are buttons into Today, so the worklist is
     still one click from the landing screen. */
  var TABS = [
    { k: "dash",  btn: "tabDash",  view: "viewDash" },
    { k: "today", btn: "tabToday", view: "viewToday" },
    { k: "pipe",  btn: "tabPipe",  view: "viewPipe" }
  ];
  function tab(which) {
    S.tab = which;
    TABS.forEach(function (t) {
      $(t.btn).setAttribute("aria-selected", which === t.k);
      $(t.view).classList.toggle("hide", which !== t.k);
    });
  }
  TABS.forEach(function (t) {
    $(t.btn).addEventListener("click", function () { tab(t.k); });
  });
  wireTips();

  var t = null;
  $("q").addEventListener("input", function () { clearTimeout(t); t = setTimeout(load, 300); });
  ["fstatus", "fstage", "fprop"].forEach(function (id) { $(id).addEventListener("change", load); });

  if (token()) { S.staff = savedStaff(); showApp(); } else { hideBoot(); }
})();
