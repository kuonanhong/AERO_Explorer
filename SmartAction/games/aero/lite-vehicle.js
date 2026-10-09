// Compact Canvas2D counterpart. It preserves the white chassis / orange identity band.
// The lite renderer is a depth projection, not genuine mesh-based 3D or a postprocess.
export function drawLiteVehicle(ctx, state, x, y, size = 1) {
  const mode = state.vehicle || 'air';
  // Rounded rectangles without Canvas roundRect(), for older Safari/iPod browsers.
  const rounded = (x, y, w, h, r) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size); ctx.rotate(-(state.roll || 0) * .3);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (mode === 'land') {
    ctx.fillStyle = '#182d34';
    for (const xx of [-22, 15]) for (const yy of [-11, 7]) ctx.fillRect(xx, yy, 8, 13);
    ctx.fillStyle = '#e6efec'; rounded(-22, -13, 44, 31, 9); ctx.fill();
    ctx.fillStyle = '#20536a'; rounded(-14, -9, 28, 17, 5); ctx.fill();
    ctx.fillStyle = '#ff8a43'; ctx.fillRect(-18, 11, 36, 3);
    ctx.fillStyle = '#d8f4ff'; ctx.fillRect(-18, -12, 6, 3); ctx.fillRect(12, -12, 6, 3);
  } else if (mode === 'water') {
    ctx.fillStyle = '#ff8a43';
    ctx.beginPath(); ctx.moveTo(12, -6); ctx.lineTo(23, -22); ctx.lineTo(25, 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#18323b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(1, -20); ctx.lineTo(8, -20); ctx.stroke();
    ctx.fillStyle = '#e6efec'; ctx.beginPath(); ctx.ellipse(-1, 0, 32, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20536a'; ctx.beginPath(); ctx.ellipse(-20, -1, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a43'; ctx.fillRect(4, -11, 4, 22);
    ctx.strokeStyle = '#18323b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(33, 0, 4, 11, 0, 0, Math.PI * 2); ctx.stroke();
    const phase = Math.sin((state.time || 0) * 18);
    ctx.beginPath(); ctx.moveTo(33 - phase * 4, -8); ctx.lineTo(33 + phase * 4, 8); ctx.stroke();
    ctx.fillStyle = '#b8dbeb'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-1 + i * 9, 1, 2, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.strokeStyle = '#18323b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-29, -13); ctx.lineTo(29, 13); ctx.moveTo(-29, 13); ctx.lineTo(29, -13); ctx.stroke();
    ctx.fillStyle = '#e6efec'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20536a'; ctx.beginPath(); ctx.ellipse(0, -5, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a43'; ctx.fillRect(-11, 6, 22, 3);
    for (const xx of [-29, 29]) for (const yy of [-13, 13]) {
      ctx.fillStyle = '#ff8a43'; ctx.beginPath(); ctx.arc(xx, yy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#18323b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(xx, yy - 3, 13, 3, .12 * Math.sin((state.time || 0) * 20), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}
