import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface RenderOptions {
  /** Footer text stamped bottom-left on every page after the cover (e.g. a classification). */
  footer?: string;
  /**
   * Optional running header + footer drawn (pdf-lib) on every content page. Chromium's page.pdf()
   * ignores CSS @page margin boxes, so the per-page logo/title/footer must be stamped here instead.
   */
  header?: PdfRunningHeader;
}

export interface PdfRunningHeader {
  /** Logo as a data: URL (PNG or JPEG); drawn top-left. Skipped if absent or not a raster image. */
  logoDataUrl?: string | null;
  /** Header line 1 (right-aligned), e.g. "ACME: PENETRATION TEST REPORT". */
  title: string;
  /** Header line 2 (right-aligned), e.g. "Acme | CONFIDENTIAL TLP:RED". */
  subtitle: string;
  /** Footer-left text (client legal name). */
  footerLeft: string;
  /** Footer-right text (e.g. "CONFIDENTIAL"). */
  classification: string;
  /** Accent hex (#RRGGBB) for the centered "[ N ]" page number + the header rule. */
  accentHex: string;
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return rgb(0.886, 0.345, 0.047);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Render an HTML string to a PDF Buffer via headless Chromium (Playwright), then stamp page numbers
 * (and an optional footer) on every page after the full-bleed cover. Chromium's `page.pdf()` ignores
 * `@page` margin-box counters, so page numbers are drawn here with pdf-lib instead.
 */
export async function renderPdf(html: string, opts: RenderOptions = {}): Promise<Buffer> {
  // ubuntu26.04 isn't a Playwright-recognised host; treat as ubuntu24.04 for the bundled browser.
  if (!process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = 'ubuntu24.04';
  // chromiumSandbox false: the containers run as a non-root user without user-namespace privileges,
  // and the rendered HTML is self-generated (fully escaped + sanitized) - same trust level as the
  // previous root-with-implicit-no-sandbox setup.
  const browser = await chromium.launch({ chromiumSandbox: false });
  let pdf: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // preferCSSPageSize makes Chromium honour the stylesheet's `@page` size + margins (including
    // `@page :first { margin: 0 }`). Without it, Chromium imposes its own default margins, so the
    // full-height (297mm) cover overflows onto a blank second page - the "page 1 pagination" bug.
    pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
  return stampPageNumbers(pdf, opts);
}

/**
 * Stamp every page after the cover. Without `header` (VA/TI): "page N / total" bottom-right plus an
 * optional footer bottom-left. With `header`: a running header (logo + 2 right-aligned title
 * lines + accent rule) in the top margin, and a footer of footerLeft / "[ N ]" (accent, centered) /
 * classification - matching the professional reference report.
 */
async function stampPageNumbers(pdf: Buffer, opts: RenderOptions): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(pdf);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const total = pages.length;
    // The cover (page index 0) is unnumbered, so content pages number 1..(total-1) and the total
    // excludes the cover. Otherwise the first numbered page reads "2 / 9", which looks like a bug.
    const contentTotal = Math.max(1, total - 1);
    const grey = rgb(0.42, 0.5, 0.55);
    const lightGrey = rgb(0.6, 0.64, 0.69);
    const h = opts.header;
    const accent = h ? hexToRgb(h.accentHex) : rgb(0.886, 0.345, 0.047);

    // Embed the header logo once (PNG/JPEG only); skip silently on any failure.
    let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
    if (h?.logoDataUrl) {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(h.logoDataUrl);
      if (m) {
        const bytes = Buffer.from(m[2]!, 'base64');
        logo = await (m[1]!.toLowerCase() === 'png' ? doc.embedPng(bytes) : doc.embedJpg(bytes)).catch(() => null);
      }
    }

    for (let i = 1; i < total; i++) {
      const p = pages[i]!;
      const { width, height } = p.getSize();

      if (h) {
        // Running header in the top margin: logo top-left, two right-aligned title lines, accent rule.
        if (logo) {
          const lh = 22;
          const lw = (logo.width / logo.height) * lh;
          p.drawImage(logo, { x: 40, y: height - 30 - lh, width: Math.min(lw, 150), height: lh });
        }
        p.drawText(h.title, {
          x: width - 40 - bold.widthOfTextAtSize(h.title, 8),
          y: height - 34,
          size: 8,
          font: bold,
          color: rgb(0.1, 0.1, 0.1),
        });
        p.drawText(h.subtitle, {
          x: width - 40 - font.widthOfTextAtSize(h.subtitle, 7),
          y: height - 45,
          size: 7,
          font,
          color: lightGrey,
        });
        p.drawRectangle({ x: 40, y: height - 52, width: width - 80, height: 1.5, color: accent });

        // Footer: client (left) / "[ N ]" accent centered / classification (right).
        p.drawText(h.footerLeft, { x: 40, y: 22, size: 7.5, font, color: lightGrey });
        const num = `[ ${i} ]`;
        p.drawText(num, { x: (width - bold.widthOfTextAtSize(num, 8)) / 2, y: 22, size: 8, font: bold, color: accent });
        const cls = (h.classification || 'CONFIDENTIAL').toUpperCase();
        p.drawText(cls, { x: width - 40 - font.widthOfTextAtSize(cls, 7.5), y: 22, size: 7.5, font, color: lightGrey });
      } else {
        // VA/TI default: page counter bottom-right + optional footer bottom-left.
        const label = `${i} / ${contentTotal}`;
        const w = font.widthOfTextAtSize(label, 8);
        p.drawText(label, { x: width - 40 - w, y: 22, size: 8, font, color: grey });
        if (opts.footer) p.drawText(opts.footer.toUpperCase(), { x: 40, y: 22, size: 7, font, color: accent });
      }
    }
    return Buffer.from(await doc.save());
  } catch {
    // Stamping must never break report generation - fall back to the unstamped PDF.
    return pdf;
  }
}
