import React from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EditField, ReelRenderProps, Slide, TitleStyle, VoiceWord } from "../lib/types";
import { MEME_END_FRAMES, memeClipFrames, timing } from "../lib/templates";
import { styleOf, TITLE_SIZE, type StyleSpec } from "../lib/styles";
import { contrastRatio, readableOn, textOn } from "../lib/color";
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

function MediaLayer({
  media,
  s,
  reverse = false,
  boost = 0,
  clipStart = 0,
  sound = false,
}: {
  media?: Media;
  s: StyleSpec;
  reverse?: boolean;
  boost?: number;
  clipStart?: number;
  sound?: boolean;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  if (!media) return null;
  const m = s.motion + boost;
  const [from, to] = reverse ? [1 + m * 1.5, 1 + m * 0.5] : [1 + m * 0.5, 1 + m * 1.5];
  const scale = interpolate(frame, [0, durationInFrames], [from, to], { extrapolateRight: "clamp" });
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, filter: s.grade };
  const el =
    media.kind === "video" ? (
      <OffthreadVideo src={media.url} muted={!sound} trimBefore={Math.max(0, Math.round(clipStart * fps))} style={style} />
    ) : (
      <Img src={media.url} style={style} onError={ignoreImageError} />
    );
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

/** Preview only: marks a text as editable (hover outline). Clicks and drags are handled by <Placed>. */
function editProps(props: ReelRenderProps, field: EditField, value: string): React.HTMLAttributes<HTMLDivElement> | undefined {
  void value;
  if (!props.edit) return undefined;
  return { className: "tadaa-editable", title: "Click to edit · drag to move", style: { cursor: "move", pointerEvents: "auto", touchAction: "none" }, ...{ "data-text": field } };
}

type Pos = { x: number; y: number };
const clampPos = (p: Pos): Pos => ({ x: Math.min(Math.max(p.x, 0.1), 0.9), y: Math.min(Math.max(p.y, 0.05), 0.95) });

/** Where a text was moved to by hand, if anywhere. */
function posOf(props: ReelRenderProps, field: EditField): Pos | undefined {
  if (field === "hook") return props.script.textPos?.hook;
  if (field === "cta") return props.script.textPos?.cta;
  return props.script.slides[Number(field.slice(6))]?.pos;
}

/**
 * Places a text: at its default spot (`fallback`, or in the normal flow when `inline`), or where it was
 * dragged to. In the preview a click edits it and a drag moves it; renders just place it.
 */
function Placed({
  props,
  field,
  value,
  fallback,
  inline = false,
  children,
}: {
  props: ReelRenderProps;
  field: EditField;
  value: string;
  fallback?: React.CSSProperties;
  inline?: boolean;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = React.useState<Pos | null>(null);
  const start = React.useRef<{ x: number; y: number; from: Pos; root: DOMRect; moved: boolean } | null>(null);
  const pos = drag ?? posOf(props, field);
  const edit = props.edit;
  // Hidden (e.g. captions replace the slide text) wherever the text sits.
  const hidden = fallback?.display === "none";

  const handlers: React.HTMLAttributes<HTMLDivElement> = edit
    ? {
        onPointerDown: (e) => {
          const text = (e.target as HTMLElement).closest("[data-text]") as HTMLElement | null;
          const root = text?.closest("[data-reel-root]")?.getBoundingClientRect();
          if (!text || !root) return;
          e.stopPropagation();
          text.setPointerCapture(e.pointerId);
          const r = text.getBoundingClientRect();
          start.current = { x: e.clientX, y: e.clientY, root, moved: false, from: { x: (r.left + r.width / 2 - root.left) / root.width, y: (r.top + r.height / 2 - root.top) / root.height } };
        },
        onPointerMove: (e) => {
          const st = start.current;
          if (!st) return;
          if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
          st.moved = true;
          setDrag(clampPos({ x: st.from.x + (e.clientX - st.x) / st.root.width, y: st.from.y + (e.clientY - st.y) / st.root.height }));
        },
        onPointerUp: (e) => {
          const st = start.current;
          start.current = null;
          if (!st) return;
          e.stopPropagation();
          if (st.moved && drag) {
            edit.onMove(field, drag);
            setTimeout(() => setDrag(null), 400);
          } else {
            const text = (e.target as HTMLElement).closest("[data-text]") as HTMLElement | null;
            if (text) edit.onSelect(field, value, text.getBoundingClientRect());
          }
        },
        onClick: (e) => e.stopPropagation(),
      }
    : {};

  if (hidden) return null;
  if (pos) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: fallback?.opacity }}>
        <div
          {...handlers}
          style={{
            position: "absolute",
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            width: 940,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    );
  }
  if (inline) return <div {...handlers} style={{ display: "contents" }}>{children}</div>;
  return (
    <AbsoluteFill {...handlers} style={fallback}>
      {children}
    </AbsoluteFill>
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
  edit,
}: {
  children: string;
  s: StyleSpec;
  size: number;
  color: string;
  accent: string;
  delay?: number;
  forceShadow?: boolean;
  /** Preview only: makes the text clickable for editing. */
  edit?: React.HTMLAttributes<HTMLDivElement>;
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
      <div {...edit} style={{ ...base, ...look, ...edit?.style }}>
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
    <div {...edit} style={{ ...base, ...anim, ...wrap, ...edit?.style }}>
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

/** Word-by-word captions replace the on-screen text while a voiceover plays. */
const captionsOn = (props: ReelRenderProps) => !!props.script.voice?.captions && !!props.script.voice.words.length && props.script.voice.source !== "clip";

function Hook({ props, s }: { props: ReelRenderProps; s: StyleSpec }) {
  const { brand, script, media } = props;
  const hideText = captionsOn(props);
  const first = media.find((m) => m.id === script.slides[0]?.mediaId) ?? media[0];
  const bg = s.framed ? "#f6f3ee" : `linear-gradient(200deg, ${brand.colors.secondary} 0%, ${brand.colors.background} 75%)`;
  const onPhoto = !!first && !s.framed;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <MediaLayer media={first} s={s} reverse boost={0.05} />
      {first && <Shade s={s} extra={0.1} />}
      <Placed props={props} field="hook" value={script.hook} fallback={{ ...placementStyle(s, true), display: hideText ? "none" : undefined }}>
        <StyledText
          s={s}
          size={Math.round(hookSize(script.hook.length) * Math.min(s.size, 1.25))}
          edit={editProps(props, "hook", script.hook)}
          color={s.framed ? "#111111" : onPhoto ? "#ffffff" : readableOn(brand.colors.background)}
          accent={brand.colors.primary}
          forceShadow={s.treatment === "pill" || s.treatment === "bar" || s.treatment === "tilt"}
        >
          {script.hook}
        </StyledText>
      </Placed>
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
        <MediaLayer media={m} s={s} reverse={index % 2 === 1} clipStart={slide.clipStart} sound={!!script.sound} />
        {m && <Shade s={s} extra={classic && isTips ? 0.2 : 0} />}
        <Placed props={props} field={`slide:${index}`} value={slide.text} fallback={{ ...(place as React.CSSProperties), display: captionsOn(props) ? "none" : undefined }}>
          <StyledText
            s={s}
            size={size}
            color={color}
            accent={brand.colors.primary}
            delay={s.transition === "slide" ? 6 : 0}
            forceShadow={classic && !onPill}
            edit={editProps(props, `slide:${index}`, slide.text)}
          >
            {slide.text}
          </StyledText>
        </Placed>
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
  const textPlace: React.CSSProperties = {
    ...placementStyle({ ...full, placement: s.placement === "top" ? "top" : s.placement === "lowerThird" ? "lowerThird" : "bottom" }),
    display: captionsOn(props) ? "none" : undefined,
  };
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
        <Placed props={props} field="slide:0" value={script.slides[0]?.text ?? ""} fallback={textPlace}>
          <StyledText
            s={full}
            size={Math.round(72 * s.size)}
            color="#ffffff"
            accent={brand.colors.primary}
            forceShadow={s.treatment === "pill"}
            edit={editProps(props, "slide:0", script.slides[0]?.text ?? "")}
          >
            {script.slides[0]?.text ?? ""}
          </StyledText>
        </Placed>
      </Sequence>
      <Sequence from={wipeStart + 24} layout="none">
        <Placed props={props} field="slide:1" value={script.slides[1]?.text ?? ""} fallback={textPlace}>
          <StyledText
            s={full}
            size={Math.round(72 * s.size)}
            color="#ffffff"
            accent={brand.colors.primary}
            forceShadow={s.treatment === "pill"}
            edit={editProps(props, "slide:1", script.slides[1]?.text ?? "")}
          >
            {script.slides[1]?.text ?? ""}
          </StyledText>
        </Placed>
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
      <Placed props={props} field="cta" value={script.cta} inline>
        <StyledText s={plain} size={Math.round(76 * Math.min(s.size, 1.2))} color={fg} accent={brand.colors.primary} delay={8} edit={editProps(props, "cta", script.cta)}>
          {script.cta}
        </StyledText>
      </Placed>
      {brand.logoUrl && (
        <StyledText s={plain} size={48} color={fg} accent={brand.colors.primary} delay={14}>
          {brand.name}
        </StyledText>
      )}
    </AbsoluteFill>
  );
}

/** Meme: white caption bar on top, the clip below (with its sound), punchline near the end, small brand mark. */
function Meme({ props, s, clipFrames }: { props: ReelRenderProps; s: StyleSpec; clipFrames: number }) {
  const frame = useCurrentFrame();
  const { brand, script, media } = props;
  const slide = script.slides[0];
  const clip = media.find((m) => m.id === slide?.mediaId) ?? media[0];
  const caption = script.hook;
  const size = caption.length > 70 ? 62 : caption.length > 40 ? 72 : 84;
  const t = script.titleStyle;
  // The caption area: white unless the customer picked a colour.
  const areaBg = t?.background && t.background !== "none" ? t.background : "#ffffff";
  const punchAt = Math.max(0, clipFrames - 40);
  const still = { ...s, motion: 0, grade: s.grade, framed: false };
  return (
    <AbsoluteFill style={{ background: areaBg }}>
      <div style={{ position: "absolute", top: 600, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "#000" }}>
        <MediaLayer media={clip} s={still} clipStart={slide?.clipStart ?? 0} sound={script.sound !== false} />
        <div
          style={{
            position: "absolute",
            right: 30,
            bottom: 40,
            fontFamily: fontOf(s),
            fontWeight: 800,
            fontSize: 34,
            color: "#fff",
            background: "rgba(0,0,0,0.45)",
            padding: "8px 18px",
            borderRadius: 999,
          }}
        >
          {brand.name}
        </div>
      </div>
      {/* Caption and punchline sit at full-frame level, so a dragged position means the same everywhere. */}
      <Placed
        props={props}
        field="hook"
        value={caption}
        fallback={{ bottom: "auto", height: 600, padding: "150px 70px 40px", alignItems: "center", justifyContent: "center" }}
      >
        <div
          {...editProps(props, "hook", caption)}
          style={{
            ...editProps(props, "hook", caption)?.style,
            fontFamily: fontOf({ ...s, font: t?.font ?? s.font }),
            fontWeight: (t?.font ?? s.font) === "bebas" || (t?.font ?? s.font) === "dmSerif" ? 400 : Math.max(s.weight, 700),
            fontSize: Math.round(size * TITLE_SIZE[t?.size ?? "m"]),
            lineHeight: 1.15,
            color: t?.color ?? readableOn(areaBg),
            textAlign: "center",
            letterSpacing: -0.5,
          }}
        >
          {(t?.upper ?? s.upper) ? caption.toUpperCase() : caption}
        </div>
      </Placed>
      {slide?.text && frame >= punchAt && (
        <Placed props={props} field="slide:0" value={slide.text} fallback={{ justifyContent: "flex-end", alignItems: "center", padding: "0 60px 170px" }}>
          <Sequence from={punchAt} layout="none">
            <StyledText
              s={{ ...s, treatment: "outline", wordByWord: false, transition: "pop", upper: true }}
              size={80}
              color="#ffffff"
              accent={brand.colors.primary}
              edit={editProps(props, "slide:0", slide.text)}
            >
              {slide.text}
            </StyledText>
          </Sequence>
        </Placed>
      )}
    </AbsoluteFill>
  );
}

/** Small "Made with Tadaa" mark on free-trial Reels. Top right unless moved; draggable in the preview. */
function Watermark({ props }: { props: ReelRenderProps }) {
  const saved = props.script.watermarkPos;
  const [drag, setDrag] = React.useState<{ x: number; y: number } | null>(null);
  const pos = drag ?? saved;
  const edit = props.edit;
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const root = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!root) return null;
    return { x: Math.min(Math.max((e.clientX - root.left) / root.width, 0.08), 0.92), y: Math.min(Math.max((e.clientY - root.top) / root.height, 0.04), 0.96) };
  };
  return (
    <div
      title={edit ? "Drag to move" : undefined}
      onPointerDown={
        edit
          ? (e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag(move(e));
            }
          : undefined
      }
      onPointerMove={edit ? (e) => drag && setDrag(move(e)) : undefined}
      onPointerUp={
        edit
          ? (e) => {
              const p = move(e) ?? drag;
              setDrag(null);
              if (p) edit.onWatermark(p);
            }
          : undefined
      }
      onClick={edit ? (e) => e.stopPropagation() : undefined}
      style={{
        position: "absolute",
        ...(pos ? { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: "translate(-50%, -50%)" } : { top: 70, right: 40 }),
        padding: "10px 22px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontFamily: FONTS.inter,
        fontWeight: 700,
        fontSize: 30,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
        cursor: edit ? (drag ? "grabbing" : "grab") : undefined,
        touchAction: "none",
        userSelect: "none",
        pointerEvents: edit ? "auto" : undefined,
        outline: drag ? "3px dashed rgba(255,255,255,0.9)" : undefined,
      }}
    >
      Made with <span style={{ color: "#ff6b5b" }}>Tadaa!</span>
    </div>
  );
}

export const Reel: React.FC<ReelRenderProps> = (props) => (
  <AbsoluteFill data-reel-root="">
    <ReelBody {...props} />
    {captionsOn(props) && (
      <Sequence durationInFrames={Math.ceil((props.script.voice!.duration + 0.5) * 30)} layout="none">
        <Captions words={props.script.voice!.words} s={styleOf(props.script)} accent={props.brand.colors.primary} bottom={300} />
      </Sequence>
    )}
    {props.watermark && <Watermark props={props} />}
    {props.edit && <style>{`.tadaa-editable:hover{outline:6px dashed rgba(255,255,255,0.85);outline-offset:10px;border-radius:8px}`}</style>}
    <Soundtrack audio={props.audio} />
  </AbsoluteFill>
);

/** Groups words into short caption lines (max 3 words, new line at pauses and sentence ends). */
function captionGroups(words: VoiceWord[]) {
  const groups: VoiceWord[][] = [];
  let cur: VoiceWord[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= 3 || (prev && w.start - prev.end > 0.45) || /[.!?…]$/.test(prev?.text ?? ""))) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
  });
  if (cur.length) groups.push(cur);
  return groups;
}

/** Captions that follow the voice: the current line, with the word being said highlighted. `offset` shifts word times (seconds). */
function Captions({ words, s, accent, bottom, offset = 0 }: { words: VoiceWord[]; s: StyleSpec; accent: string; bottom: number; offset?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = React.useMemo(() => captionGroups(words), [words]);
  const t = frame / fps + offset;
  const gi = groups.findIndex((g, i) => t >= g[0].start - 0.05 && (i === groups.length - 1 ? t <= g[g.length - 1].end + 0.6 : t < groups[i + 1][0].start - 0.05));
  if (gi < 0) return null;
  const g = groups[gi];
  const enter = interpolate(t - g[0].start, [-0.05, 0.12], [0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = g.reduce((n, w) => n + w.text.length, 0) > 22 ? 70 : 84;
  // The word being said: the brand colour when it stands out against the black outline, else yellow.
  const hi = contrastRatio(accent, "#000000") >= 5 ? accent : "#ffd93b";
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: `0 70px ${bottom}px`, pointerEvents: "none" }}>
      <div
        style={{
          fontFamily: fontOf(s),
          fontWeight: Math.max(s.weight, 800),
          fontSize: size,
          lineHeight: 1.15,
          textAlign: "center",
          maxWidth: 940,
          transform: `scale(${enter})`,
          color: "#fff",
          WebkitTextStroke: `${Math.round(size / 13)}px #000`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 0 rgba(0,0,0,0.35)",
        }}
      >
        {g.map((w, i) => {
          const active = t >= w.start && (i === g.length - 1 || t < g[i + 1].start);
          return (
            <React.Fragment key={i}>
              {i > 0 && " "}
              <span style={{ color: active ? hi : "#fff" }}>
                {s.upper ? w.text.toUpperCase() : w.text}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Talking video title: the brand look, or the customer's own size, font and colours. */
function TalkTitle({ text, s, accent, t, edit }: { text: string; s: StyleSpec; accent: string; t?: TitleStyle; edit?: React.HTMLAttributes<HTMLDivElement> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  const bg = t?.background ?? accent;
  const box = bg !== "none";
  const size = Math.round(64 * TITLE_SIZE[t?.size ?? "m"]);
  const color = t?.color ?? (box ? textOn(bg, "#ffffff") : "#ffffff");
  const font = t?.font ?? s.font;
  const upper = t?.upper ?? s.upper;
  return (
    <div
      {...edit}
      style={{
        ...edit?.style,
        fontFamily: `${FONTS[font]}, 'Helvetica Neue', Helvetica, Arial, sans-serif`,
        fontWeight: font === "bebas" || font === "dmSerif" ? 400 : Math.max(s.weight, 800),
        fontSize: size,
        lineHeight: 1.12,
        color,
        textAlign: "center",
        maxWidth: 940,
        transform: `scale(${0.85 + 0.15 * enter})`,
        opacity: enter,
        ...(box
          ? { background: bg, padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.47)}px`, borderRadius: Math.round(size * 0.34) }
          : { WebkitTextStroke: `${Math.round(size / 14)}px #000`, paintOrder: "stroke fill", textShadow: "0 6px 0 rgba(0,0,0,0.35)" }),
      }}
    >
      {upper ? text.toUpperCase() : text}
    </div>
  );
}

/** Talking video: the clip full screen with its own sound, a short title at the top, captions from the speech. */
function Talk({ props, s, clipFrames }: { props: ReelRenderProps; s: StyleSpec; clipFrames: number }) {
  const frame = useCurrentFrame();
  const { brand, script, media } = props;
  const slide = script.slides[0];
  const clip = media.find((m) => m.id === slide?.mediaId) ?? media[0];
  const titleOut = interpolate(frame, [90, 105], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const still = { ...s, motion: 0, framed: false };
  const voice = script.voice;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <MediaLayer media={clip} s={still} clipStart={slide?.clipStart ?? 0} sound />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.35) 100%)" }} />
      {script.hook && frame < 110 && (
        <Placed props={props} field="hook" value={script.hook} fallback={{ justifyContent: "flex-start", alignItems: "center", padding: "200px 70px 0", opacity: titleOut }}>
          <TalkTitle text={script.hook} s={s} accent={brand.colors.primary} t={script.titleStyle} edit={editProps(props, "hook", script.hook)} />
        </Placed>
      )}
      {voice?.captions && voice.words.length > 0 && frame < clipFrames && (
        <Captions words={voice.words} s={s} accent={brand.colors.primary} bottom={380} offset={slide?.clipStart ?? 0} />
      )}
    </AbsoluteFill>
  );
}

/** Background music (looped, faded in and out) and sound effects at their moments. */
function Soundtrack({ audio }: { audio: ReelRenderProps["audio"] }) {
  const { durationInFrames } = useVideoConfig();
  if (!audio) return null;
  const music = audio.music;
  return (
    <>
      {audio.voice && <Html5Audio src={audio.voice.url} volume={audio.voice.volume} />}
      {music && (
        <Html5Audio
          src={music.url}
          loop
          volume={(f) =>
            music.volume *
            interpolate(f, [0, 8, durationInFrames - 20, durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          }
        />
      )}
      {audio.effects.map((e, i) => (
        <Sequence key={i} from={e.from} durationInFrames={Math.max(1, durationInFrames - e.from)} layout="none">
          <Html5Audio src={e.url} volume={e.volume} />
        </Sequence>
      ))}
    </>
  );
}

const ReelBody: React.FC<ReelRenderProps> = (props) => {
  const { script } = props;
  const s = styleOf(script);
  if (script.template === "talk") {
    const clipFrames = memeClipFrames(script);
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Sequence durationInFrames={clipFrames}>
          <Talk props={props} s={s} clipFrames={clipFrames} />
        </Sequence>
        <Sequence from={clipFrames} durationInFrames={MEME_END_FRAMES}>
          <EndCard props={props} s={s} />
        </Sequence>
      </AbsoluteFill>
    );
  }
  if (script.template === "meme") {
    const clipFrames = memeClipFrames(script);
    return (
      <AbsoluteFill style={{ backgroundColor: "#fff" }}>
        <Sequence durationInFrames={clipFrames}>
          <Meme props={props} s={s} clipFrames={clipFrames} />
        </Sequence>
        <Sequence from={clipFrames} durationInFrames={MEME_END_FRAMES}>
          <EndCard props={props} s={{ ...s, framed: true }} />
        </Sequence>
      </AbsoluteFill>
    );
  }
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
