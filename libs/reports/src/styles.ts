/** Report design based on a reference HTML template (teal + navy, Space Grotesk
 * display, IBM Plex Sans/Mono). The component CSS - cover, sections, stat cards, severity bar +
 * legend, tables, finding cards, approval cards, note - uses the reference's exact values. Only the
 * page scaffolding differs: the reference lays content onto fixed-size on-screen `.sheet` boxes
 * (it has known, hand-placed content); our reports are data-driven and must auto-paginate, so we use
 * CSS `@page` print rules + running header/footer instead. Sizes are in px to match the reference 1:1
 * (A4 = 794x1123px at 96dpi, the same size the reference sheets use). */
/** Only allow CSS color literals (#hex / rgb()/hsl() / simple names): these values are interpolated
 * raw into a <style> block, so anything else could break out of the CSS context (stored injection
 * into the Chromium render). Falls back to the default when the value does not look like a color. */
function safeColor(value: string, fallback: string): string {
  const v = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/-]+\)$/i.test(v)) return v;
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v; // named colors (teal, navy, ...)
  return fallback;
}

export function reportCss(rawPrimary: string, rawSecondary: string, footer: string, classification: string): string {
  const primary = safeColor(rawPrimary, '#069EC6');
  const secondary = safeColor(rawSecondary, '#08222B');
  return `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  :root{
    --teal:${primary}; --teal-deep:#067a99; --ink:#0c2530; --navy:${secondary}; --navy-2:#0d2f3b;
    --paper:#ffffff; --muted:#5b7480; --line:#e2e9ec; --line-2:#eef3f5; --soft:#f5f8f9;
    --sev-critical:#DC2626; --sev-high:#EA580C; --sev-medium:#D97706; --sev-low:#2563EB; --sev-info:#64748B;
    /* Font stacks with SYSTEM fallbacks: the PDF renders offline so the Google @import above may not
       load; without a fallback the bare web fonts drop to serif (Times) and the report looks broken.
       These stacks always resolve to a clean sans/mono on the headless Chromium (DejaVu/Liberation). */
    --display:'Space Grotesk','Segoe UI','Liberation Sans','DejaVu Sans',Arial,sans-serif;
    --sans:'IBM Plex Sans','Segoe UI','Liberation Sans','DejaVu Sans',Arial,sans-serif;
    --mono:'IBM Plex Mono','Consolas','Liberation Mono','DejaVu Sans Mono',monospace;
  }
  @page {
    size: A4; margin: 84px 60px 70px 60px;
    @top-left { content: string(doctitle); font-family:var(--mono); font-size: 9.5px; letter-spacing:.13em; text-transform:uppercase; color: var(--muted); }
    @top-right { content: string(section); font-family:var(--mono); font-size: 9.5px; letter-spacing:.1em; color: var(--muted); }
    @bottom-left { content: ${JSON.stringify((classification || footer || '').toUpperCase())}; font-family:var(--mono); font-size: 9px; letter-spacing:.18em; color: var(--sev-high); font-weight:600; }
    @bottom-right { content: counter(page) " / " counter(pages); font-family:var(--mono); font-size: 9px; letter-spacing:.1em; color: #9bafb7; }
  }
  @page :first { margin: 0; @top-left{content:none} @top-right{content:none} @bottom-left{content:none} @bottom-right{content:none} }
  @page backcover { margin: 0; @top-left{content:none} @top-right{content:none} @bottom-left{content:none} @bottom-right{content:none} }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: var(--sans); color: var(--ink); background: #fff; -webkit-font-smoothing: antialiased; font-size: 12px; line-height: 1.55; }
  .doctitle { string-set: doctitle content(); position: absolute; left: -9999px; }
  .page-break { break-before: page; }

  /* ---------- Type ---------- */
  h1,h2,h3,h4 { font-family: var(--display); margin: 0; font-weight: 600; color: var(--ink); }
  .eyebrow { font-family:var(--mono); font-size: 10.5px; letter-spacing: .26em; text-transform: uppercase; color: var(--teal-deep); font-weight: 500; }
  .sec-title { display: flex; align-items: baseline; gap: 14px; margin-bottom: 4px; margin-top: 5px; }
  .sec-title .num { font-family:var(--display); font-weight: 600; color: var(--teal); font-size: 15px; }
  .sec-title h2 { string-set: section content(); font-size: 25px; letter-spacing: -.01em; line-height: 1.05; }
  .sec-sub { font-size: 12px; color: var(--muted); margin: 7px 0 0; line-height: 1.55; max-width: 600px; }
  .sec-head { border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin: 30px 0 24px; }
  p { line-height: 1.6; margin: 7px 0; }
  p strong, td strong, li strong, .stat .sl b { color: var(--ink); font-weight: 600; }
  h3 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  ul { margin: 8px 0 0; padding-left: 18px; }
  li { font-size: 11.5px; line-height: 1.6; margin: 5px 0; color: #334a54; }
  .mono { font-family: var(--mono); }
  .en { color: var(--muted); font-weight: 400; }

  /* ---------- Cover ---------- */
  .cover { height: 297mm; background: var(--navy); color: #eaf4f7; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; padding: 60px 60px 70px; }
  .cover .grid-bg { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px); background-size: 38px 38px; -webkit-mask-image: radial-gradient(120% 90% at 80% 10%,#000 0%,transparent 70%); mask-image: radial-gradient(120% 90% at 80% 10%,#000 0%,transparent 70%); }
  .cover .glow { position: absolute; width: 520px; height: 520px; border-radius: 50%; right: -160px; top: -150px; background: radial-gradient(circle,rgba(6,158,198,.4),transparent 62%); filter: blur(8px); }
  .cover-top { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .cover-top .mark { display: flex; align-items: center; gap: 11px; }
  .cover-top .mark .m { width: 34px; height: 34px; border-radius: 9px; background: var(--teal); color: #04222c; font-family:var(--display); font-weight: 700; font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .cover-top .mark .logo { max-height: 40px; max-width: 150px; object-fit: contain; }
  .cover-top .mark .nm { font-family:var(--display); font-weight: 600; font-size: 17px; color: #fff; }
  .conf-pill { font-family:var(--mono); font-size: 10px; letter-spacing: .22em; border: 1px solid rgba(234,88,12,.7); color: #ff9d63; padding: 6px 13px; border-radius: 2px; text-transform: uppercase; font-weight: 600; }
  .cover-mid { position: relative; }
  .cover-bot { position: relative; }
  .cover .kicker { font-family:var(--mono); font-size: 12px; letter-spacing: .3em; text-transform: uppercase; color: var(--teal); margin-bottom: 22px; display: flex; align-items: center; gap: 12px; }
  .cover .kicker::before { content: ''; width: 42px; height: 2px; background: var(--teal); display: inline-block; }
  .cover h1 { font-family:var(--display); font-size: 62px; line-height: .98; letter-spacing: -.02em; color: #fff; font-weight: 700; }
  .cover h1 .l2 { color: var(--teal); }
  .cover .subtitle { font-size: 15px; color: #9fc4d0; margin-top: 20px; max-width: 430px; line-height: 1.6; font-weight: 400; }
  .cover .target { margin-top: 30px; display: inline-flex; align-items: center; gap: 11px; font-family:var(--mono); font-size: 18px; color: #fff; background: rgba(6,158,198,.13); border: 1px solid rgba(6,158,198,.4); padding: 11px 18px; border-radius: 4px; }
  .cover .target .tg { color: var(--teal); }
  .cover-meta { margin-top: 46px; display: grid; grid-template-columns: repeat(3,1fr); border-top: 1px solid rgba(255,255,255,.13); padding-top: 24px; gap: 10px; position: relative; }
  .cover-meta .mk { font-family:var(--mono); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: #6f93a0; }
  .cover-meta .mv { font-family:var(--mono); font-size: 14px; color: #eaf4f7; margin-top: 6px; font-weight: 500; }
  .cover-foot { margin-top: 36px; font-size: 11px; color: #6f93a0; line-height: 1.7; display: flex; justify-content: space-between; align-items: flex-end; position: relative; }
  .cover-foot .org { color: #bcd7df; font-family:var(--display); font-size: 13px; font-weight: 600; }
  .back-cover { break-before: page; page: backcover; }
  .back-cover .back-mid { display: flex; flex-direction: column; justify-content: center; flex: 1; }

  /* ---------- Stat cards ---------- */
  .stat-row { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; margin: 14px 0; }
  .stat { border: 1px solid var(--line); border-radius: 7px; padding: 18px 20px; background: var(--paper); position: relative; overflow: hidden; }
  .stat::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--teal); }
  .stat .sv { font-family:var(--display); font-size: 38px; font-weight: 700; line-height: 1; color: var(--ink); }
  .stat .sl { font-size: 11px; color: var(--muted); margin-top: 7px; line-height: 1.4; text-transform: uppercase; letter-spacing: .06em; }

  /* ---------- Severity bar + legend ---------- */
  .sevbar { display: flex; border-radius: 6px; overflow: hidden; height: 34px; border: 1px solid var(--line); margin: 12px 0; }
  .sevbar .seg { display: flex; align-items: center; justify-content: center; color: #fff; font-family:var(--mono); font-size: 11px; font-weight: 600; min-width: 30px; }
  .sev-legend { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px 18px; margin-top: 18px; }
  .sev-item { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .sev-item .sw { width: 11px; height: 11px; border-radius: 3px; flex: none; }
  .sev-item .nm { flex: 1; color: var(--ink); }
  .sev-item .ct { font-family:var(--mono); font-weight: 600; color: var(--ink); }

  /* ---------- Tables ---------- */
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }
  thead th { background: var(--navy); color: #cfe6ee; font-family:var(--mono); font-size: 9px; letter-spacing: .13em; text-transform: uppercase; font-weight: 500; text-align: left; padding: 9px 12px; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--line-2); vertical-align: middle; }
  tbody tr:nth-child(even) { background: var(--soft); }
  .idx { color: #9bafb7; font-family:var(--mono); font-size: 10px; }
  .vt td { padding: 11px 14px; }
  .vt .vname { font-weight: 600; color: var(--ink); font-size: 12px; }
  .vt .vcount { font-family:var(--display); font-weight: 700; font-size: 16px; }
  .status-pill { font-family:var(--mono); font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
  .st-2xx { background: #e7f6ec; color: #1a7f43; }
  .st-3xx { background: #e8f0fe; color: #1a56c4; }
  .st-4xx, .st-403 { background: #fef0e6; color: #b3490a; }
  .st-5xx { background: #fdeaea; color: #c0392b; }
  .st-none { background: #eef1f2; color: #7a8e96; }
  .subgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
  .subgrid table { font-size: 10.5px; } .subgrid tbody td { padding: 5.5px 10px; }

  /* ---------- Donut + bars ---------- */
  .donut-wrap { display: flex; align-items: center; gap: 30px; margin: 6px 0; }
  .donut { width: 170px; height: 170px; border-radius: 50%; position: relative; flex: none; }
  .donut::after { content: ''; position: absolute; inset: 30px; background: var(--paper); border-radius: 50%; box-shadow: inset 0 0 0 1px var(--line-2); }
  .donut .dc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2; }
  .donut .dc .dn { font-family:var(--display); font-size: 40px; font-weight: 700; line-height: 1; }
  .donut .dc .dl { font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin-top: 4px; font-family:var(--mono); }
  .bars { display: flex; flex-direction: column; gap: 13px; flex: 1; }
  .barrow { display: grid; grid-template-columns: 168px 1fr 44px; align-items: center; gap: 12px; font-size: 11.5px; }
  .barrow .bl { color: var(--ink); font-weight: 500; }
  .barrow .bt { display: block; height: 18px; background: var(--soft); border-radius: 3px; overflow: hidden; }
  .barrow .bf { display: block; height: 100%; border-radius: 3px; }
  .barrow .bv { font-family:var(--mono); font-weight: 600; text-align: right; color: var(--ink); }

  /* ---------- TOC ---------- */
  .toc-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
  .toc-item { display: flex; align-items: center; gap: 14px; padding: 15px 4px; border-bottom: 1px solid var(--line); }
  .toc-item .tnum { font-family:var(--mono); font-size: 12px; color: var(--teal); width: 30px; font-weight: 600; }
  .toc-item .ttext { flex: 1; }
  .toc-item .ttext .tt { font-family:var(--display); font-size: 16px; font-weight: 600; color: var(--ink); }
  .toc-item .ttext .te { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .toc-item .tpg { font-family:var(--mono); font-size: 13px; color: var(--muted); font-weight: 500; }

  /* ---------- URL chips ---------- */
  .url-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .url-chip { font-family:var(--mono); font-size: 10px; color: var(--ink); background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 6px; }
  .url-chip .dotg { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); flex: none; }
  .url-chip .more { color: var(--muted); }

  /* ---------- Finding card ---------- */
  .finding { border: 1px solid var(--line); border-radius: 9px; overflow: hidden; margin-bottom: 18px; break-inside: avoid; }
  .finding-head { padding: 16px 20px; display: flex; align-items: flex-start; gap: 14px; border-bottom: 1px solid var(--line); position: relative; }
  .finding-head .fid { font-family:var(--display); font-weight: 700; font-size: 13px; color: #fff; width: 34px; height: 34px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex: none; }
  .finding-head .fttl { flex: 1; }
  .finding-head .fttl .fn { font-family:var(--display); font-size: 16px; font-weight: 600; line-height: 1.15; }
  .finding-head .fttl .fmeta { display: flex; gap: 8px; align-items: center; margin-top: 7px; flex-wrap: wrap; }
  .tag { font-family:var(--mono); font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; background: var(--soft); color: var(--muted); padding: 3px 7px; border-radius: 3px; border: 1px solid var(--line); }
  .badge { display: inline-flex; align-items: center; gap: 5px; font-family:var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .08em; padding: 3px 8px; border-radius: 3px; color: #fff; text-transform: uppercase; white-space: nowrap; }
  .finding-body { padding: 18px 20px; }
  .fblock { margin-bottom: 15px; } .fblock:last-child { margin-bottom: 0; }
  .fblock .flabel { font-family:var(--mono); font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--teal-deep); font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .fblock .flabel::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .fblock p { font-size: 11.5px; color: #334a54; margin: 0; line-height: 1.62; }
  .fblock ul.refs { margin: 0; padding-left: 16px; }
  .fblock ul.refs li { font-size: 10px; color: #4a6470; line-height: 1.5; margin: 2px 0; word-break: break-all; }
  .fblock .evlabel { font-family:var(--mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 8px 0 3px; }
  .fblock pre.evidence { font-family:var(--mono); font-size: 8.5px; line-height: 1.45; color: #2b3f47; background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; margin: 0; white-space: pre-wrap; word-break: break-all; }
  .fblock .evmore { font-size: 8px; color: var(--muted); font-style: italic; margin: 3px 0 8px; }

  /* ---------- Approval ---------- */
  .approve-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 10px; }
  .approve-card { border: 1px solid var(--line); border-radius: 8px; padding: 26px 24px; break-inside: avoid; }
  .approve-card .acrole { font-family:var(--mono); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--teal-deep); }
  .approve-card .acsig { height: 74px; border-bottom: 1px dashed var(--line); margin: 20px 0 14px; display: flex; align-items: flex-end; justify-content: center; }
  .approve-card .acsig .acsigimg { max-height: 70px; max-width: 180px; object-fit: contain; }
  .approve-card .acname { font-family:var(--display); font-size: 17px; font-weight: 600; }
  .approve-card .acpos { font-size: 11.5px; color: var(--muted); margin-top: 3px; }

  /* ---------- Misc ---------- */
  .kv { display: grid; grid-template-columns: 180px 1fr; gap: 10px 18px; font-size: 12px; }
  .kv .k { color: var(--muted); } .kv .v { color: var(--ink); font-weight: 500; }
  .note { background: var(--soft); border-left: 3px solid var(--teal); padding: 14px 18px; border-radius: 0 6px 6px 0; font-size: 11.5px; color: #334a54; line-height: 1.6; }
  .minihead { display: flex; align-items: center; gap: 11px; margin: 22px 0 14px; }
  .minihead .mt { font-family:var(--display); font-size: 15px; font-weight: 600; }
  .minihead::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .minihead .ic { width: 7px; height: 7px; background: var(--teal); border-radius: 2px; transform: rotate(45deg); flex: none; }
  .risk-wrap { display: flex; align-items: center; gap: 18px; margin: 14px 0; }
  .risk-num { font-family:var(--display); font-size: 40px; font-weight: 700; line-height: 1; }
  .risk-meter { flex: 1; height: 16px; border-radius: 999px; background: var(--soft); overflow: hidden; border: 1px solid var(--line); }
  .risk-meter > div { height: 100%; }
  .risk-level { font-family:var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; padding: 5px 13px; border-radius: 3px; }
  .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 18px; text-align: center; color: #9bafb7; font-size: 11px; }
  .end { text-align: center; font-family:var(--mono); color: var(--teal); font-weight: 600; letter-spacing: .22em; text-transform: uppercase; font-size: 10px; margin-top: 42px; }
  `;
}

export const SEV_KEYS = ['info', 'low', 'med', 'high', 'crit'];
export const SEV_HEX = ['#64748B', '#2563EB', '#D97706', '#EA580C', '#DC2626'];
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
