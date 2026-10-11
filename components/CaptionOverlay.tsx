// The coach's captions, laid over the bottom of a video player: white text on a
// dark translucent box, at most two lines. Sits above the player's own control
// bar. The parent must be position: relative.

export default function CaptionOverlay({
  text,
  bottom = 56,
  fontSize = 15,
}: {
  text: string | null;
  bottom?: number;
  fontSize?: number;
}) {
  if (!text) return null;
  return (
    <div
      aria-live="off"
      data-testid="caption-overlay"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        display: "flex",
        justifyContent: "center",
        padding: "0 12px",
        pointerEvents: "none",
        lineHeight: 1.3,
      }}
    >
      <span
        style={{
          maxWidth: "100%",
          backgroundColor: "rgba(0,0,0,0.72)",
          color: "#fff",
          fontSize,
          fontWeight: 600,
          textAlign: "center",
          padding: "4px 10px",
          borderRadius: 6,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </span>
    </div>
  );
}
