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
import { timing } from "../lib/templates";
import { styleOf, type StyleSpec } from "../lib/styles";
import { readableOn, textOn } from "../lib/color";
import { FONTS } from "./fonts";

// A missing or broken image must never cancel a whole render – just leave that layer empty.
const ignoreImageError = () => {};

type Media = ReelRenderProps["media"][number];

const fontOf = (s: StyleSpec) => `${FONTS[s.font]}, 'Helvetica Neue', Helvetica, Arial, sans-serif`;

/** Entry transition for a scene, per style. */
function Enter({ s, children }: { s: StyleSpec; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let style: React.CSSProperties = {};
  if (s.transition === "fade") {
    style = { opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }) };
  } else if (s.transition === "slide") {
    const p = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
    style = { transform: `translateX(${(1 - p) * 100}%)` };
  } else if (s.transition === "zoom") {
    const p = interpolate(frame, [0, 6], [1.18, 1], { extrapolateRight: "clamp" });
    style = { transform: `scale(${p})` };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

function MediaLayer({ media, s, reverse = false, boost = 0 }: { media?: Media; s: StyleSpec; reverse?: boolean; boost?: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!media) return null;
  const m = s.motion + boost;
  const [from, to] = reverse ? [1 + m * 1.5, 1 + m * 0.5] : [1 + m * 0.5, 1 + m * 1.5];
  const scale = interpolate(frame, [0, durationInFrames], [from, to], { extrapolateRight: "clamp" });
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, filter: s.grade };
  const el = media.kind === "video" ? <OffthreadVideo src={media.url} muted style={style} /> : <Img src={media.url} style={style} onError={ignoreImageError} />;
  if (!s.framed) return <AbsoluteFill>{el}</AbsoluteFill>;
  // Clean Minimal: photo inset with rounded corners on a calm background.
  return (
    <AbsoluteFill style={{ padding: "560px 70px 170px" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 44, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.18)" }}>{el}</div>
    </AbsoluteFill>
  );
}

function Shade({ s, extra = 0 }: { s: StyleSpec; extra?: number }) {
  const k = s.shade + extra;
  if (k <= 0 || s.framed) return null;
  const grad =
    s.placement === "top"
      ? `linear-gradient(180deg, rgba(0,0,0,${k}) 0%, rgba(0,0,0,${k * 0.25}) 45%, rgba(0,0,0,${k * 0.15}) 100%)`
      : `linear-gradient(180deg, rgba(0,0,0,${k * 0.5}) 0%, rgba(0,0,0,${k * 0.2}) 40%, rgba(0,0,0,${k}) 100%)`;
  return <AbsoluteFill style={{ background: grad }} />;
}

function Letterbox({ s }: { s: StyleSpec }) {
  if (!s.letterbox) return null;
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 150, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 150, background: "#000" }} />
    </>
  );
}

/** Styled text: animation, font, case and treatment (pill, box, captions outline, lower-third bar, sticker). */
function StyledText({
  children,
  s,
  size,
  color,
  accent,
  delay = 0,
  forceShadow = false,
}: {
  children: string;
  s: StyleSpec;
  size: number;
  color: string;
  accent: string;
  delay?: number;
  forceShadow?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - delay;
  const pop = spring({ frame: t, fps, config: { damping: 14, stiffness: 160 } });
  const fade = interpolate(t, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const text = s.upper ? children.toUpperCase() : children;
  const treatment = forceShadow ? "shadow" : s.treatment;

  let anim: React.CSSProperties;
  if (s.transition === "fade" || s.transition === "slide") anim = { opacity: fade, transform: `translateY(${(1 - fade) * 24}px)` };
  else if (s.transition === "cut") anim = { opacity: t >= 0 ? 1 : 0 };
  else anim = { opacity: pop, transform: `translateY(${(1 - pop) * 40}px) scale(${0.92 + pop * 0.08})` };

  const base: React.CSSProperties = {
    fontFamily: fontOf(s),
    fontWeight: s.weight,
    fontSize: size,
    lineHeight: s.font === "bebas" ? 1 : 1.12,
    letterSpacing: s.letterSpacing,
    color,
    textAlign: s.placement === "lowerThird" ? "left" : "center",
    maxWidth: 920,
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };

  let look: React.CSSProperties = {};
  if (treatment === "shadow") look = { textShadow: color === "#ffffff" ? "0 4px 24px rgba(0,0,0,0.55)" : "none" };
  if (treatment === "pill") look = { background: accent, color: textOn(accent, color), padding: "18px 30px", borderRadius: 22 };
  if (treatment === "box") look = { background: "#000", color: "#fff", padding: "10px 26px 4px", display: "inline" };
  if (treatment === "outline")
    look = {
      color: "#fff",
      WebkitTextStroke: `${Math.round(size / 14)}px #000`,
      paintOrder: "stroke fill",
      textShadow: "0 6px 0 rgba(0,0,0,0.35)",
    };
  if (treatment === "tilt")
    look = { background: accent, color: textOn(accent, color), padding: "16px 34px", borderRadius: 40, transform: "rotate(-3deg)", display: "inline-block" };
  if (treatment === "bar")
    look = {
      background: "rgba(255,255,255,0.94)",
      color: "#111",
      padding: "26px 34px 26px 40px",
      borderRadius: 18,
      borderLeft: `14px solid ${accent}`,
      boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
      display: "inline-block",
    };

  if (s.wordByWord && treatment === "outline") {
    // Creator captions: words appear one after another.
    const words = text.split(/\s+/);
    const per = Math.max(3, Math.floor(30 / Math.max(words.length, 1)));
    return (
      <div style={{ ...base, ...look }}>
        {words.map((w, i) => (
          <span key={i} style={{ opacity: t >= i * per ? 1 : 0, color: i === Math.floor(t / per) % words.length ? accent : "#fff" }}>
            {w}{" "}
          </span>
        ))}
      </div>
    );
  }
  const wrap: React.CSSProperties = treatment === "tilt" ? {} : look;
  return (
    <div style={{ ...base, ...anim, ...wrap }}>
      {treatment === "tilt" ? <span style={look}>{text}</span> : text}
    </div>
  );
}

function placementStyle(s: StyleSpec, hook = false): React.CSSProperties {
  const p = hook && s.placement !== "top" && !s.framed ? "center" : s.placement;
  if (s.framed) return { justifyContent: "flex-start", alignItems: "center", padding: "200px 80px 0" };
  if (p === "center") return { justifyContent: "center", alignItems: "center", padding: 80 };
  if (p === "top") return { justifyContent: "flex-start", alignItems: "center", padding: `${s.letterbox ? 230 : 210}px 70px 0` };
  if (p === "lowerThird") return { justifyContent: "flex-end", alignItems: "flex-start", padding: `0 70px ${s.letterbox ? 260 : 300}px` };
  return { justifyContent: "flex-end", alignItems: "center", padding: "0 70px 260px" };
}

function hookSize(len: number) {
  return len > 60 ? 76 : len > 35 ? 90 : 104;
}

function Hook({ props, s }: { props: ReelRenderProps; s: StyleSpec }) {
  const { brand, script, media } = props;
  const first = media.find((m) => m.id === script.slides[0]?.mediaId) ?? media[0];
  const bg = s.framed ? "#f6f3ee" : `linear-gradient(200deg, ${brand.colors.secondary} 0%, ${brand.colors.background} 75%)`;
  const onPhoto = !!first && !s.framed;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <MediaLayer media={first} s={s} reverse boost={0.05} />
      {first && <Shade s={s} extra={0.1} />}
      <AbsoluteFill style={placementStyle(s, true)}>
        <StyledText
          s={s}
          size={Math.round(hookSize(script.hook.length) * Math.min(s.size, 1.25))}
          color={s.framed ? "#111111" : onPhoto ? "#ffffff" : readableOn(brand.colors.background)}
          accent={brand.colors.primary}
          forceShadow={s.treatment === "pill" || s.treatment === "bar" || s.treatment === "tilt"}
        >
          {script.hook}
        </StyledText>
      </AbsoluteFill>
      <Letterbox s={s} />
    </AbsoluteFill>
  );
}

function SlideCard({ slide, index, props, s }: { slide: Slide; index: number; props: ReelRenderProps; s: StyleSpec }) {
  const { brand, media, script } = props;
  const m = media.find((x) => x.id === slide.mediaId);
  const isTips = script.template === "tips";
  const bg = s.framed ? "#f6f3ee" : index % 2 ? brand.colors.secondary : brand.colors.primary;
  // Bold Pop keeps its classic rules: tips centred on the photo, otherwise a brand-colour pill.
  const classic = s.treatment === "pill";
  const onPill = classic ? !isTips && !!m : false;
  const color = s.framed ? "#111111" : classic && onPill ? textOn(brand.colors.primary, brand.colors.text) : m ? "#ffffff" : readableOn(bg);
  const size = Math.round((classic ? (isTips ? 90 : 72) : isTips ? 84 : 72) * s.size);
  const place = classic && isTips ? { justifyContent: "center", alignItems: "center", padding: 90 } : placementStyle(s);
  return (
    <Enter s={s}>
      <AbsoluteFill style={{ backgroundColor: bg }}>
        <MediaLayer media={m} s={s} reverse={index % 2 === 1} />
        {m && <Shade s={s} extra={classic && isTips ? 0.2 : 0} />}
        <AbsoluteFill style={place as React.CSSProperties}>
          <StyledText s={s} size={size} color={color} accent={brand.colors.primary} delay={s.transition === "slide" ? 6 : 0} forceShadow={classic && !onPill}>
            {slide.text}
          </StyledText>
        </AbsoluteFill>
        <Letterbox s={s} />
      </AbsoluteFill>
    </Enter>
  );
}

/** Before → after wipe across slides 0 and 1. */
function BeforeAfter({ props, s, slideFrames }: { props: ReelRenderProps; s: StyleSpec; slideFrames: number }) {
  const frame = useCurrentFrame();
  const { brand, script, media } = props;
  const before = media.find((m) => m.id === script.slides[0]?.mediaId) ?? media[0];
  const after = media.find((m) => m.id === script.slides[1]?.mediaId) ?? media[1];
  const wipeStart = slideFrames - 10;
  const reveal = interpolate(frame, [wipeStart, wipeStart + 24], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const full = { ...s, framed: false };
  const label = (text: string, show: boolean) => (
    <div
      style={{
        position: "absolute",
        top: s.letterbox ? 200 : 170,
        left: 70,
        fontFamily: fontOf(s),
        fontWeight: Math.max(s.weight, 700),
        fontSize: 64,
        letterSpacing: 6,
        color: readableOn(brand.colors.primary),
        background: brand.colors.primary,
        padding: "12px 28px",
        borderRadius: 16,
        opacity: show ? 1 : 0,
      }}
    >
      {text}
    </div>
  );
  const textPlace = placementStyle({ ...full, placement: s.placement === "top" ? "top" : s.placement === "lowerThird" ? "lowerThird" : "bottom" });
  return (
    <AbsoluteFill style={{ backgroundColor: brand.colors.primary }}>
      <MediaLayer media={before} s={full} />
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
        <MediaLayer media={after} s={full} reverse />
      </AbsoluteFill>
      {reveal > 0 && reveal < 100 && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${reveal}%`, width: 10, marginLeft: -5, background: "#fff", boxShadow: "0 0 30px rgba(0,0,0,0.4)" }} />
      )}
      {label("BEFORE", reveal < 50)}
      {label("AFTER", reveal >= 50)}
      <Shade s={{ ...full, shade: Math.max(s.shade, 0.45) }} />
      <Sequence durationInFrames={slideFrames - 10} layout="none">
        <AbsoluteFill style={textPlace}>
          <StyledText s={full} size={Math.round(72 * s.size)} color="#ffffff" accent={brand.colors.primary} forceShadow={s.treatment === "pill"}>
            {script.slides[0]?.text ?? ""}
          </StyledText>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={wipeStart + 24} layout="none">
        <AbsoluteFill style={textPlace}>
          <StyledText s={full} size={Math.round(72 * s.size)} color="#ffffff" accent={brand.colors.primary} forceShadow={s.treatment === "pill"}>
            {script.slides[1]?.text ?? ""}
          </StyledText>
        </AbsoluteFill>
      </Sequence>
      <Letterbox s={s} />
    </AbsoluteFill>
  );
}

function EndCard({ props, s }: { props: ReelRenderProps; s: StyleSpec }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand, script } = props;
  const sp = spring({ frame, fps, config: { damping: 12 } });
  const calm = s.transition === "fade" || s.framed;
  const bg = s.framed
    ? "#f6f3ee"
    : s.letterbox
      ? "#0d0d0d"
      : `linear-gradient(160deg, ${brand.colors.primary} 0%, ${brand.colors.secondary} 100%)`;
  const fg = s.framed ? "#111111" : s.letterbox ? "#ffffff" : readableOn(brand.colors.primary);
  const scale = calm ? interpolate(frame, [0, 18], [0.96, 1], { extrapolateRight: "clamp" }) : sp;
  const plain = { ...s, treatment: "shadow" as const, wordByWord: false };
  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", gap: 50, padding: 80 }}>
      {brand.logoUrl ? (
        <div style={{ background: "#fff", borderRadius: 40, padding: 36, transform: `scale(${scale})`, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
          <Img src={brand.logoUrl} style={{ width: 300, height: 300, objectFit: "contain" }} onError={ignoreImageError} />
        </div>
      ) : (
        <div style={{ fontFamily: fontOf(s), fontWeight: s.weight, fontSize: 110, color: fg, transform: `scale(${scale})`, textAlign: "center" }}>
          {s.upper ? brand.name.toUpperCase() : brand.name}
        </div>
      )}
      <StyledText s={plain} size={Math.round(76 * Math.min(s.size, 1.2))} color={fg} accent={brand.colors.primary} delay={8}>
        {script.cta}
      </StyledText>
      {brand.logoUrl && (
        <StyledText s={plain} size={48} color={fg} accent={brand.colors.primary} delay={14}>
          {brand.name}
        </StyledText>
      )}
    </AbsoluteFill>
  );
}

export const Reel: React.FC<ReelRenderProps> = (props) => {
  const { script } = props;
  const s = styleOf(script);
  const t = timing(script);
  const isBA = script.template === "beforeAfter" && props.media.length >= 2 && script.slides.length >= 2;
  const restStart = isBA ? 2 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence durationInFrames={t.hook}>
        <Hook props={props} s={s} />
      </Sequence>
      {isBA && (
        <Sequence from={t.hook} durationInFrames={t.slide * 2}>
          <BeforeAfter props={props} s={s} slideFrames={t.slide} />
        </Sequence>
      )}
      {script.slides.slice(restStart).map((slide, i) => (
        <Sequence key={i} from={t.hook + (restStart + i) * t.slide} durationInFrames={t.slide}>
          <SlideCard slide={slide} index={restStart + i} props={props} s={s} />
        </Sequence>
      ))}
      <Sequence from={t.hook + script.slides.length * t.slide} durationInFrames={t.cta}>
        <EndCard props={props} s={s} />
      </Sequence>
    </AbsoluteFill>
  );
};
