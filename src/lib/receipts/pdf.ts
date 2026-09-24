/**
 * A one-page PDF from lines of text, with no dependency.
 *
 * The Family Vault bucket takes PDFs and pictures, nothing else, and a receipt
 * is filed from inside a Stripe webhook — a serverless function with no Chrome
 * to print through (the FSA letters used puppeteer because they ran on Tony's
 * machine). A receipt is a dozen lines of text, which the PDF format can carry
 * in its two built-in fonts without embedding anything, so this writes the
 * file by hand: a page, a content stream, a cross-reference table.
 *
 * Text is limited to what the built-in fonts' WinAnsi encoding can show. The
 * characters a receipt actually uses beyond ASCII (em dash, curly quotes,
 * bullet, ×) are mapped to their WinAnsi bytes; anything else becomes "?"
 * rather than a broken file.
 */

export interface PdfLine {
  text: string;
  /** Points. Default 11. */
  size?: number;
  bold?: boolean;
  /** Right-align against the right margin instead of the left. */
  right?: boolean;
  /** Extra points of space above this line. */
  gapBefore?: number;
  /** Draw a thin rule under this line. */
  rule?: boolean;
  /** 0–1 grey. Default 0 (black). */
  grey?: number;
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54;

const WIN_ANSI: Record<string, number> = {
  "—": 0x97, // em dash
  "–": 0x96, // en dash
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95, // bullet
  "×": 0xd7, // ×
  "·": 0xb7, // middle dot
  "…": 0x85, // ellipsis
};

/** Text as a PDF literal string, escaped and encoded as WinAnsi bytes. */
function pdfString(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    let byte: number;
    if (WIN_ANSI[ch] !== undefined) byte = WIN_ANSI[ch];
    else if (code >= 0x20 && code <= 0x7e) byte = code;
    else if (code >= 0xa0 && code <= 0xff) byte = code;
    else byte = 0x3f; // "?"
    const c = String.fromCharCode(byte);
    out += c === "(" || c === ")" || c === "\\" ? `\\${c}` : c;
  }
  return `(${out})`;
}

/*
 * Helvetica's advance widths for ASCII, in 1/1000 em — enough to right-align
 * an amount column. Bold runs about 10% wider, close enough for that.
 */
const HELVETICA_WIDTHS: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (units / 1000) * size * (bold ? 1.1 : 1);
}

/**
 * Lines on one page. A line that would run off the bottom is dropped rather
 * than overflowing; a receipt long enough to hit that is a bug upstream, and
 * `renderReceiptPdf` keeps its line count well inside the page.
 */
export function renderTextPdf(lines: PdfLine[], title: string): Buffer {
  const ops: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const size = line.size ?? 11;
    y -= (line.gapBefore ?? 0) + size * 1.35;
    if (y < MARGIN) break;
    const font = line.bold ? "/F2" : "/F1";
    const x = line.right
      ? PAGE_WIDTH - MARGIN - textWidth(line.text, size, line.bold)
      : MARGIN;
    const grey = line.grey ?? 0;
    ops.push(
      `${grey.toFixed(2)} g BT ${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(line.text)} Tj ET`
    );
    if (line.rule) {
      const ry = y - size * 0.45;
      ops.push(`0.80 G 0.6 w ${MARGIN} ${ry.toFixed(2)} m ${PAGE_WIDTH - MARGIN} ${ry.toFixed(2)} l S`);
    }
  }

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer ${pdfString("NOVA PA Parent Portal")} >>`,
  ];

  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}
