"use client";

// The caption to show for a <video>, in step with its playback.
//
// timeupdate only fires about four times a second, which would show every
// caption up to a quarter-second late, so while the video plays this also
// checks on each animation frame. It only sets state when the caption changes.
// Pass `ready` = false until the <video> element is in the page.

import { useEffect, useState, type RefObject } from "react";
import { activeCaptionAt, type CaptionSegment } from "@/lib/captions";

export function useActiveCaption(
  videoRef: RefObject<HTMLVideoElement | null>,
  segments: CaptionSegment[],
  ready: boolean = true
): string | null {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!ready || !video || segments.length === 0) return;

    let raf = 0;
    const update = () => {
      const next = activeCaptionAt(segments, video.currentTime)?.text ?? null;
      setText(prev => (prev === next ? prev : next));
    };
    const tick = () => {
      update();
      if (!video.paused && !video.ended) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const events = ["timeupdate", "seeking", "seeked", "pause", "ended", "loadedmetadata"] as const;
    for (const e of events) video.addEventListener(e, update);
    video.addEventListener("play", onPlay);
    if (!video.paused) onPlay();
    else raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) video.removeEventListener(e, update);
      video.removeEventListener("play", onPlay);
    };
  }, [videoRef, segments, ready]);

  // No captions (or not ready): show nothing, whatever was last set.
  return ready && segments.length > 0 ? text : null;
}
