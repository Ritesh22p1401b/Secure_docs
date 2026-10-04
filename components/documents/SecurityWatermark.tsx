/**
 * Visible, repeated, semi-transparent watermark. The identity comes from the
 * server-authorised session (passed in by the server page) — never from client input.
 */
export function SecurityWatermark({ lines }: { lines: string[] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none"
      data-testid="security-watermark"
    >
      <div className="absolute -inset-1/2 grid rotate-[-30deg] grid-cols-3 content-around gap-y-24 sm:grid-cols-4">
        {Array.from({ length: 48 }, (_, i) => (
          <div key={i} className="text-center font-semibold leading-tight text-slate-900/[0.09]">
            {lines.map((line, j) => (
              <div key={j} className={j === 0 ? "text-xl tracking-widest" : "text-xs"}>
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Burns the watermark into a rendered canvas so it survives removal of DOM overlays. */
export function drawCanvasWatermark(canvas: HTMLCanvasElement, lines: string[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const fontSize = Math.max(12, Math.round(width / 40));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = fontSize * 26;
  const stepY = fontSize * 11;
  const span = Math.hypot(width, height);
  for (let y = -span; y < span; y += stepY) {
    for (let x = -span; x < span; x += stepX) {
      lines.forEach((line, i) => {
        ctx.font = `${i === 0 ? "bold " : ""}${i === 0 ? fontSize * 1.4 : fontSize}px sans-serif`;
        ctx.fillText(line, x, y + i * fontSize * 1.5);
      });
    }
  }
  ctx.restore();
}
