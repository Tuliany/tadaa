"use client";

import { Player } from "@remotion/player";
import { Reel } from "@/remotion/Reel";
import { FPS, HEIGHT, WIDTH, reelDuration } from "@/lib/templates";
import type { ReelRenderProps } from "@/lib/types";

export default function ReelPlayer({ props, autoPlay = true }: { props: ReelRenderProps; autoPlay?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] bg-black shadow-xl ring-1 ring-black/10">
      <Player
        component={Reel}
        inputProps={props}
        durationInFrames={reelDuration(props.script)}
        fps={FPS}
        compositionWidth={WIDTH}
        compositionHeight={HEIGHT}
        style={{ width: "100%", aspectRatio: "9 / 16" }}
        controls
        loop
        autoPlay={autoPlay}
        acknowledgeRemotionLicense
      />
    </div>
  );
}
