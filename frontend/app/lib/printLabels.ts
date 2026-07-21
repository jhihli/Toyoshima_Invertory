'use client';
/**
 * Client-side QR label printing for driver-based label printers (e.g. Qmezizy/Omezizy D520,
 * which has no ZPL). Each label renders a QR code (via bwip-js) plus human-readable text, laid
 * out one-per-page at 100x150mm in a popup window, then window.print() lets the user pick the
 * label printer in the OS dialog. No backend involved — callers pass the label content directly.
 *
 * bwip-js (~230 kB) is dynamically imported so it only loads on first print, keeping pages light.
 * The popup is opened synchronously first (before the async import) so browser popup blockers
 * still treat it as user-initiated.
 */

export interface PrintLabel {
  /** The exact string encoded into the QR code. */
  qr: string;
  /** Small top context line, e.g. "SO123 · tgt1". */
  context: string;
  /** Large human-readable text under the QR (usually the same value as `qr`). */
  code: string;
  /** Optional small footer note. */
  note?: string;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => (s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** Open a print window with one 100x150mm QR label per item and trigger the OS print dialog. */
export function printLabels(labels: PrintLabel[]): void {
  if (!labels.length) return;

  // Open the popup NOW, in the click gesture, so it isn't blocked after the async import.
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('打印被浏览器拦截，请允许本站弹出窗口后重试。');
    return;
  }
  w.document.write('<!doctype html><meta charset="utf-8"><title>Preparing…</title><body style="font:14px sans-serif;padding:24px;color:#333">Preparing labels…</body>');

  import('bwip-js/browser').then(mod => {
    const bwipjs = mod.default;
    const qrSvg = (text: string) => {
      try { return bwipjs.toSVG({ bcid: 'qrcode', text, scale: 4 }); }
      catch { return '<div class="qr-err">QR error</div>'; }
    };

    const body = labels.map(l => `
      <section class="label">
        <div class="ctx">${esc(l.context)}</div>
        <div class="qr">${qrSvg(l.qr)}</div>
        <div class="code">${esc(l.code)}</div>
        ${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}
      </section>`).join('');

    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title>
<style>
  @page { size: 100mm 150mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 100mm; height: 150mm; page-break-after: always; display: flex; flex-direction: column;
           align-items: center; justify-content: center; padding: 8mm 6mm; gap: 5mm; text-align: center; }
  .label:last-child { page-break-after: auto; }
  .ctx  { font-size: 5mm; font-weight: 600; letter-spacing: 0.02em; }
  .qr   { display: flex; align-items: center; justify-content: center; background: #fff; padding: 4mm; }
  .qr svg { width: 60mm; height: 60mm; display: block; }
  .code { font-family: "Courier New", monospace; font-size: 6mm; font-weight: 700; word-break: break-all; line-height: 1.25; }
  .note { font-size: 4mm; color: #333; font-style: italic; word-break: break-word; }
  .qr-err { color: #b00; font-size: 5mm; }
</style></head><body>${body}</body></html>`;

    w.document.open();
    w.document.write(doc);
    w.document.close();

    const doPrint = () => { try { w.focus(); w.print(); } catch { /* window closed */ } };
    w.onafterprint = () => w.close();
    // Inline SVG lays out synchronously; a short tick avoids printing a blank first paint.
    if (w.document.readyState === 'complete') setTimeout(doPrint, 150);
    else w.onload = () => setTimeout(doPrint, 150);
  }).catch(() => {
    try { w.close(); } catch { /* ignore */ }
    alert('无法加载条码库，请重试。');
  });
}
