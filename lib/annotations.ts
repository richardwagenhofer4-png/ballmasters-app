export type DrawingType = "arrow" | "line" | "circle" | "freehand" | "text";

/**
 * Returns the actual rendered footage rectangle inside a video element that
 * uses object-fit: contain (the browser default). Coordinates are in CSS
 * pixels relative to the element's top-left corner.
 * Returns null if the video hasn't loaded its intrinsic dimensions yet.
 */
export function getContentRect(
  video: HTMLVideoElement
): { offsetX: number; offsetY: number; width: number; height: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;
  const videoAspect = vw / vh;
  const elementAspect = cw / ch;
  let width: number, height: number, offsetX: number, offsetY: number;
  if (videoAspect > elementAspect) {
    // Video wider than element box → letterbox bars top and bottom
    width = cw;
    height = cw / videoAspect;
    offsetX = 0;
    offsetY = (ch - height) / 2;
  } else {
    // Video taller than element box → pillarbox bars left and right
    height = ch;
    width = ch * videoAspect;
    offsetX = (cw - width) / 2;
    offsetY = 0;
  }
  return { offsetX, offsetY, width, height };
}

/**
 * Font size in CSS pixels for a text annotation drawn over a content rect of
 * height `h`. Exported so the live input in the editor and the canvas draw can
 * never drift apart — they must agree or the text jumps size on confirm.
 */
export function textFontSizePx(h: number): number {
  return Math.max(14, Math.round(h * 0.045));
}

export interface Drawing {
  id: string;
  type: DrawingType;
  color: string;
  // Normalized stroke width (fraction of canvas width). Absent on legacy drawings → use absolute fallback.
  strokeWidth?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  cx?: number; cy?: number; r?: number;
  points?: { x: number; y: number }[];
  tx?: number; ty?: number; label?: string;
}

export interface AnnotationFrame {
  id: string;
  timestamp: number;
  pauseOnPlay: boolean;
  drawings: Drawing[];
}

export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  w: number,
  h: number
) {
  for (const d of drawings) {
    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    // Normalized strokeWidth: multiply by canvas width to get pixels.
    // Legacy drawings without strokeWidth fall back to hardcoded absolute values.
    ctx.lineWidth = d.strokeWidth != null
      ? d.strokeWidth * w
      : (d.type === "freehand" ? 2.5 : 3.5);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (d.type) {
      case "line":
        if (d.x1 == null) break;
        ctx.beginPath();
        ctx.moveTo(d.x1 * w, d.y1! * h);
        ctx.lineTo(d.x2! * w, d.y2! * h);
        ctx.stroke();
        break;

      case "arrow": {
        if (d.x1 == null) break;
        const ax1 = d.x1 * w, ay1 = d.y1! * h;
        const ax2 = d.x2! * w, ay2 = d.y2! * h;
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        ctx.lineTo(ax2, ay2);
        ctx.stroke();
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
        // Arrowhead clamp is proportional to canvas width so it scales with player size.
        const hlen = Math.max(w * 0.025, Math.min(w * 0.065, Math.hypot(ax2 - ax1, ay2 - ay1) * 0.3));
        ctx.beginPath();
        ctx.moveTo(ax2, ay2);
        ctx.lineTo(ax2 - hlen * Math.cos(angle - Math.PI / 6), ay2 - hlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ax2, ay2);
        ctx.lineTo(ax2 - hlen * Math.cos(angle + Math.PI / 6), ay2 - hlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }

      case "circle":
        if (d.cx == null) break;
        ctx.beginPath();
        ctx.arc(d.cx * w, d.cy! * h, d.r! * Math.min(w, h), 0, 2 * Math.PI);
        ctx.stroke();
        break;

      case "freehand":
        if (!d.points?.length) break;
        ctx.beginPath();
        ctx.moveTo(d.points[0].x * w, d.points[0].y * h);
        for (let i = 1; i < d.points.length; i++) {
          ctx.lineTo(d.points[i].x * w, d.points[i].y * h);
        }
        ctx.stroke();
        break;

      case "text": {
        if (d.tx == null) break;
        const fontSize = textFontSizePx(h);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 5;
        const label = d.label ?? "";
        // Keep the whole string inside the frame. This is a DRAW-time clamp
        // only: the stored tx/ty are untouched, so saved annotations keep
        // meaning exactly what they meant before.
        const pad = 8 * (w / 1000);
        const textWidth = ctx.measureText(label).width; // needs ctx.font set above
        // The Math.max on each upper bound keeps the range non-empty when the
        // string is wider (or the frame shorter) than the padding allows;
        // without it the clamp would push the text off the opposite edge.
        const x = Math.min(Math.max(d.tx * w, pad), Math.max(pad, w - textWidth - pad));
        const y = Math.min(Math.max(d.ty! * h, fontSize + pad), Math.max(fontSize + pad, h - pad));
        ctx.fillText(label, x, y);
        break;
      }
    }
    ctx.restore();
  }
}
