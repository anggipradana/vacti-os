/**
 * Richer XLSX (Office Open XML) writer with NO dependency (Lightness first: no SheetJS/exceljs) - extends
 * the minimal single-sheet writer to support: MULTIPLE sheets, EMBEDDED images (anchored to a cell, used
 * for vulnerability PoC and screenshot columns), merged cells, column widths, and a few cell styles
 * (bold / fill / wrap). One store-mode ZIP of the OOXML parts.
 */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(size, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + size;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, eocd]);
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function colName(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** A styled cell. Plain string/number = default style. */
export type XlsxCell = string | number | { v: string | number; style?: number };
/** An image anchored from its top-left at (col,row), sized in pixels (EMU = px * 9525). */
export interface XlsxImage {
  data: Buffer;
  ext: 'png' | 'jpeg';
  col: number;
  row: number;
  widthPx: number;
  heightPx: number;
}
export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  images?: XlsxImage[];
  /** Column widths in Excel "characters" units, keyed by 0-based column index. */
  colWidths?: Record<number, number>;
  /** Row heights in points, keyed by 0-based row index. */
  rowHeights?: Record<number, number>;
  /** Merge ranges like "A1:D1". */
  merges?: string[];
}

// A tiny fixed style table: 0=default, 1=bold, 2=bold+grey fill (header), 3=wrap-top, 4=bold center.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="5">
<xf borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="1" borderId="1" applyBorder="1" applyFont="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="1" fillId="2" borderId="1" applyBorder="1" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="1" borderId="1" applyBorder="1" applyFont="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs></styleSheet>`;

function sheetXml(sheet: XlsxSheet, hasDrawing: boolean): string {
  const cols = sheet.colWidths
    ? `<cols>${Object.entries(sheet.colWidths)
        .map(([i, w]) => `<col min="${+i + 1}" max="${+i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const body = sheet.rows
    .map((row, r) => {
      const ht = sheet.rowHeights?.[r];
      const cells = row
        .map((cell, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const v = typeof cell === 'object' ? cell.v : cell;
          const st = typeof cell === 'object' && cell.style ? cell.style : 0;
          const sAttr = st ? ` s="${st}"` : ' s="0"';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join('');
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : '';
      return `<row r="${r + 1}"${htAttr}>${cells}</row>`;
    })
    .join('');
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  const drawing = hasDrawing ? `<drawing r:id="rId1"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${cols}<sheetData>${body}</sheetData>${merges}${drawing}</worksheet>`;
}

const EMU = 9525; // EMUs per pixel

function drawingXml(images: XlsxImage[]): string {
  const anchors = images
    .map((img, i) => {
      const w = img.widthPx * EMU;
      const h = img.heightPx * EMU;
      return `<xdr:oneCellAnchor>
<xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>${img.row}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>
<xdr:ext cx="${w}" cy="${h}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="poc${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
}

/** Build a multi-sheet .xlsx (with optional embedded images per sheet) into a Buffer. */
export function workbookToXlsx(sheets: XlsxSheet[]): Buffer {
  const files: { name: string; data: Buffer }[] = [];
  let mediaCount = 0;
  const sheetEntries: string[] = [];
  const wbRels: string[] = [];
  const ctOverrides: string[] = [];
  const ctImageDefaults = new Set<string>();

  sheets.forEach((sheet, si) => {
    const sIdx = si + 1;
    const imgs = sheet.images ?? [];
    const sheetPath = `xl/worksheets/sheet${sIdx}.xml`;
    files.push({ name: sheetPath, data: Buffer.from(sheetXml(sheet, imgs.length > 0), 'utf8') });
    ctOverrides.push(
      `<Override PartName="/${sheetPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
    sheetEntries.push(`<sheet name="${esc(sheet.name).slice(0, 31)}" sheetId="${sIdx}" r:id="rId${sIdx}"/>`);
    wbRels.push(
      `<Relationship Id="rId${sIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sIdx}.xml"/>`,
    );
    if (imgs.length) {
      const drawIdx = sIdx;
      // media files + drawing rels
      const drawRels: string[] = [];
      imgs.forEach((img, ii) => {
        mediaCount++;
        const mediaName = `image${mediaCount}.${img.ext}`;
        files.push({ name: `xl/media/${mediaName}`, data: img.data });
        ctImageDefaults.add(img.ext);
        drawRels.push(
          `<Relationship Id="rId${ii + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`,
        );
      });
      files.push({ name: `xl/drawings/drawing${drawIdx}.xml`, data: Buffer.from(drawingXml(imgs), 'utf8') });
      files.push({
        name: `xl/drawings/_rels/drawing${drawIdx}.xml.rels`,
        data: Buffer.from(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawRels.join('')}</Relationships>`,
          'utf8',
        ),
      });
      files.push({
        name: `xl/worksheets/_rels/sheet${sIdx}.xml.rels`,
        data: Buffer.from(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawIdx}.xml"/></Relationships>`,
          'utf8',
        ),
      });
      ctOverrides.push(
        `<Override PartName="/xl/drawings/drawing${drawIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      );
    }
  });

  files.push({ name: 'xl/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') });
  wbRels.push(
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  );

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries.join('')}</sheets></workbook>`;
  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const imageDefaults = [...ctImageDefaults]
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === 'jpeg' ? 'jpeg' : 'png'}"/>`)
    .join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ctOverrides.join('')}</Types>`;

  files.unshift(
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(wbRelsXml, 'utf8') },
  );
  return zip(files);
}
