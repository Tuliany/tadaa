import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { FPS, HEIGHT, WIDTH, reelDuration } from "../lib/templates";
import type { ReelRenderProps } from "../lib/types";

const defaultProps: ReelRenderProps = {
  brand: { name: "Tadaa", colors: { primary: "#ff5a5f", secondary: "#ffb400", text: "#ffffff", background: "#111111" } },
  script: {
    template: "showcase",
    hook: "Your brand, on autopilot",
    slides: [{ text: "Upload a photo" }, { text: "Get a finished Reel" }, { text: "Approve and post" }],
    cta: "Try Tadaa free",
    caption: "",
    hashtags: [],
  },
  media: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={reelDuration(defaultProps.script)}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({ durationInFrames: reelDuration(props.script) })}
  />
);
