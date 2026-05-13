export type DrawingType = "arrow" | "line" | "circle" | "freehand" | "text";

export interface Drawing {
  id: string;
  type: DrawingType;
  color: string;
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
    ctx.lineWidth = d.type === "freehand" ? 2.5 : 3.5;
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
        const hlen = Math.max(12, Math.min(24, Math.hypot(ax2 - ax1, ay2 - ay1) * 0.3));
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

      case "text":
        if (d.tx == null) break;
        ctx.font = `bold ${Math.max(14, Math.round(h * 0.045))}px sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 5;
        ctx.fillText(d.label ?? "", d.tx * w, d.ty! * h);
        break;
    }
    ctx.restore();
  }
}
