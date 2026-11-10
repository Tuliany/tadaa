import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReelRenderProps, Slide } from "../lib/types";
import { CTA_FRAMES, HOOK_FRAMES, SLIDE_FRAMES } from "../lib/templates";

const FONT = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

type Media = ReelRenderProps["media"][number];

function MediaLayer({ media, zoomFrom = 1.05, zoomTo = 1.15 }: { media?: Media; zoomFrom?: number; zoomTo?: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!media) return null;
  const scale = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo], { extrapolateRight: "clamp" });
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` };
  return (
    <AbsoluteFill>
      {media.kind === "video" ? <OffthreadVideo src={media.url} muted style={style} /> : <Img src={media.url} style={style} />}
    </AbsoluteFill>
  );
}

function Shade({ strength = 0.45 }: { strength?: number }) {
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(180deg, rgba(0,0,0,${strength * 0.5}) 0%, rgba(0,0,0,${strength * 0.2}) 40%, rgba(0,0,0,${strength}) 100%)` }}
    />
  );
}

function PopText({
  children,
  size = 84,
  color,
  bg,
  delay = 0,
  align = "center",
}: {
  children: React.ReactNode;
  size?: number;
  color: string;
  bg?: string;
  delay?: number;
  align?: "center" | "left";
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.12,
        color,
        textAlign: align,
        letterSpacing: -1,
        transform: `translateY(${(1 - s) * 40}px) scale(${0.92 + s * 0.08})`,
        opacity: s,
        background: bg,
        padding: bg ? "18px 30px" : 0,
        borderRadius: bg ? 22 : 0,
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        textShadow: bg ? "none" : "0 4px 24px rgba(0,0,0,0.55)",
        maxWidth: 920,
      }}
    >
      {children}
    </div>
  );
}

function Hook({ props }: { props: ReelRenderProps }) {
  const { brand, script, media } = props;
  const first = media.find((m) => m.id === script.slides[0]?.mediaId) ?? media[0];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(200deg, ${brand.colors.secondary} 0%, ${brand.colors.background} 75%)` }}>
      <MediaLayer media={first} zoomFrom={1.2} zoomTo={1.08} />
      {first && <Shade strength={0.6} />}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <PopText size={104} color="#ffffff">
          {script.hook}
        </PopText>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SlideCard({ slide, index, props }: { slide: Slide; index: number; props: ReelRenderProps }) {
  const { brand, media, script } = props;
  const m = media.find((x) => x.id === slide.mediaId);
  const isTips = script.template === "tips";
  return (
    <AbsoluteFill style={{ backgroundColor: index % 2 ? brand.colors.secondary : brand.colors.primary }}>
      <MediaLayer media={m} zoomFrom={index % 2 ? 1.15 : 1.05} zoomTo={index % 2 ? 1.05 : 1.15} />
      {m && <Shade strength={isTips ? 0.7 : 0.5} />}
      <AbsoluteFill
        style={{
          justifyContent: isTips ? "center" : "flex-end",
          alignItems: "center",
          padding: isTips ? 90 : "0 70px 260px",
        }}
      >
        <PopText size={isTips ? 90 : 72} color={isTips || !m ? "#ffffff" : brand.colors.text} bg={isTips || !m ? undefined : brand.colors.primary}>
          {slide.text}
        </PopText>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Before → after wipe across slides 0 and 1. */
function BeforeAfter({ props }: { props: ReelRenderProps }) {
  const frame = useCurrentFrame();
  const { brand, script, media } = props;
  const before = media.find((m) => m.id === script.slides[0]?.mediaId) ?? media[0];
  const after = media.find((m) => m.id === script.slides[1]?.mediaId) ?? media[1];
  const wipeStart = SLIDE_FRAMES - 10;
  const reveal = interpolate(frame, [wipeStart, wipeStart + 24], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label = (text: string, show: boolean) => (
    <div
      style={{
        position: "absolute",
        top: 170,
        left: 70,
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: 64,
        letterSpacing: 6,
        color: "#fff",
        background: brand.colors.primary,
        padding: "12px 28px",
        borderRadius: 16,
        opacity: show ? 1 : 0,
      }}
    >
      {text}
    </div>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: brand.colors.primary }}>
      <MediaLayer media={before} zoomFrom={1.05} zoomTo={1.1} />
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
        <MediaLayer media={after} zoomFrom={1.1} zoomTo={1.05} />
      </AbsoluteFill>
      {reveal > 0 && reveal < 100 && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${reveal}%`, width: 10, marginLeft: -5, background: "#fff", boxShadow: "0 0 30px rgba(0,0,0,0.4)" }} />
      )}
      {label("BEFORE", reveal < 50)}
      {label("AFTER", reveal >= 50)}
      <Shade strength={0.45} />
      <Sequence durationInFrames={SLIDE_FRAMES - 10} layout="none">
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 70px 260px" }}>
          <PopText size={72} color="#fff">{script.slides[0]?.text}</PopText>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={wipeStart + 24} layout="none">
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 70px 260px" }}>
          <PopText size={72} color="#fff">{script.slides[1]?.text}</PopText>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}

function EndCard({ props }: { props: ReelRenderProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand, script } = props;
  const s = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${brand.colors.primary} 0%, ${brand.colors.secondary} 100%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: 50,
        padding: 80,
      }}
    >
      {brand.logoUrl ? (
        <div style={{ background: "#fff", borderRadius: 40, padding: 36, transform: `scale(${s})`, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
          <Img src={brand.logoUrl} style={{ width: 300, height: 300, objectFit: "contain" }} />
        </div>
      ) : (
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 110, color: "#fff", transform: `scale(${s})`, textAlign: "center" }}>{brand.name}</div>
      )}
      <PopText size={76} color="#fff" delay={8}>
        {script.cta}
      </PopText>
      {brand.logoUrl && (
        <PopText size={48} color="rgba(255,255,255,0.85)" delay={14}>
          {brand.name}
        </PopText>
      )}
    </AbsoluteFill>
  );
}

export const Reel: React.FC<ReelRenderProps> = (props) => {
  const { script } = props;
  const isBA = script.template === "beforeAfter" && props.media.length >= 2 && script.slides.length >= 2;
  const restStart = isBA ? 2 : 0;
  const slidesStart = HOOK_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence durationInFrames={HOOK_FRAMES}>
        <Hook props={props} />
      </Sequence>
      {isBA && (
        <Sequence from={slidesStart} durationInFrames={SLIDE_FRAMES * 2}>
          <BeforeAfter props={props} />
        </Sequence>
      )}
      {script.slides.slice(restStart).map((slide, i) => (
        <Sequence key={i} from={slidesStart + (restStart + i) * SLIDE_FRAMES} durationInFrames={SLIDE_FRAMES}>
          <SlideCard slide={slide} index={restStart + i} props={props} />
        </Sequence>
      ))}
      <Sequence from={slidesStart + script.slides.length * SLIDE_FRAMES} durationInFrames={CTA_FRAMES}>
        <EndCard props={props} />
      </Sequence>
    </AbsoluteFill>
  );
};
