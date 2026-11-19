"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Reel } from "@/remotion/Reel";
import { FPS, HEIGHT, WIDTH, reelDuration } from "@/lib/templates";
import type { EditField, ReelRenderProps } from "@/lib/types";

/**
 * The Reel preview. With onEditText, texts in the video can be clicked and edited in place;
 * with onMoveWatermark, the trial watermark can be dragged.
 */
export default function ReelPlayer({
  props,
  autoPlay = true,
  onEditText,
  onMoveWatermark,
}: {
  props: ReelRenderProps;
  autoPlay?: boolean;
  onEditText?: (field: EditField, value: string) => void;
  onMoveWatermark?: (pos: { x: number; y: number }) => void;
}) {
  const boxId = useId();
  const player = useRef<PlayerRef>(null);
  const [sel, setSel] = useState<{ field: EditField; value: string; original: string; top: number; left: number; width: number; height: number } | null>(null);

  const editable = !!onEditText || !!onMoveWatermark;
  const edit = useMemo(
    () =>
      editable
        ? {
            onSelect: (field: EditField, value: string, rect: DOMRect) => {
              if (!onEditText) return;
              const c = document.getElementById(boxId)?.getBoundingClientRect();
              if (!c) return;
              const width = Math.min(Math.max(rect.width + 16, c.width * 0.8), c.width - 8);
              const left = Math.min(Math.max(rect.left - c.left + rect.width / 2 - width / 2, 4), c.width - width - 4);
              const top = Math.min(Math.max(rect.top - c.top - 8, 4), c.height - 120);
              setSel({ field, value, original: value, top, left, width, height: Math.max(rect.height + 16, 56) });
            },
            onWatermark: (pos: { x: number; y: number }) => onMoveWatermark?.(pos),
          }
        : undefined,
    [editable, onEditText, onMoveWatermark, boxId],
  );

  // Pause while a text is being edited.
  useEffect(() => {
    if (sel) player.current?.pause();
  }, [sel]);

  const inputProps = useMemo(() => (edit ? { ...props, edit } : props), [props, edit]);

  // Esc cancels; everything else (Enter, clicking away) saves. Both go through blur, so it saves once.
  const cancelled = useRef(false);
  function close() {
    const save = !cancelled.current;
    cancelled.current = false;
    if (sel && save && sel.value.trim() && sel.value !== sel.original) onEditText?.(sel.field, sel.value.trim());
    setSel(null);
  }

  return (
    <div id={boxId} className="relative mx-auto w-full max-w-[340px]">
      <div className="overflow-hidden rounded-[28px] bg-black shadow-xl ring-1 ring-black/10">
        <Player
          ref={player}
          component={Reel}
          inputProps={inputProps}
          durationInFrames={reelDuration(props.script)}
          fps={FPS}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          style={{ width: "100%", aspectRatio: "9 / 16" }}
          controls
          loop
          autoPlay={autoPlay}
          clickToPlay={!editable}
          acknowledgeRemotionLicense
        />
      </div>
      {sel && (
        <div className="absolute z-20" style={{ top: sel.top, left: sel.left, width: sel.width }}>
          <textarea
            autoFocus
            className="block w-full resize-none rounded-xl bg-white p-2.5 text-[15px] font-semibold leading-snug text-ink shadow-2xl outline-none ring-2 ring-coral"
            style={{ minHeight: sel.height }}
            value={sel.value}
            maxLength={200}
            onChange={(e) => setSel({ ...sel, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                cancelled.current = true;
                e.currentTarget.blur();
              }
            }}
            onBlur={close}
          />
          <p className="mt-1 rounded-md bg-black/60 px-2 py-0.5 text-center text-[11px] text-white">Enter to save · Esc to cancel</p>
        </div>
      )}
      {editable && !sel && (
        <p className="mt-2 text-center text-xs text-ink/45">
          {onEditText ? "Click a text in the video to change it." : ""}
          {props.watermark && onMoveWatermark ? " Drag the Tadaa badge to move it." : ""}
        </p>
      )}
    </div>
  );
}
