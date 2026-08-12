import qrcode from 'qrcode-generator';

const EC_LEVEL = 'M'; // 15% error correction — good balance for phone scanning

/**
 * Render a string as an inline SVG QR code (single <path>, crisp edges).
 * The output has no quiet zone — wrap it in a white padded container.
 * QR codes need a light background to scan; the SharePanel provides that.
 */
export function qrSvg(text) {
  const qr = qrcode(0, EC_LEVEL); // type 0 = auto-size to content
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" ` +
    'shape-rendering="crispEdges" role="img" aria-label="QR code">' +
    `<path d="${cells.join('')}"/>` +
    '</svg>'
  );
}
