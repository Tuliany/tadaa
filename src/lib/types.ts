export type Language = "en" | "sv" | "es" | "de" | "fr";

export const LANGUAGES: Record<Language, string> = {
  en: "English",
  sv: "Svenska",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
};

export interface BrandColors {
  primary: string;
  secondary: string;
  text: string;
  background: string;
}

export type PaidPlanId = "starter" | "pro";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  /** Stripe customer for this account (set at first checkout). */
  stripeCustomerId?: string;
  /** The current Stripe subscription, kept in sync by the webhook. */
  subscription?: {
    id: string;
    plan: PaidPlanId;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  /** Reels created: `trial` counts forever, `period` resets with each billing period. */
  usage?: { trial?: number; periodStart?: string; period?: number };
  /** Email settings: the Monday "your week" email is on unless turned off. */
  emails?: { weekly?: boolean };
  /** Monday (YYYY-MM-DD) of the last week a weekly email was sent, so it's never sent twice. */
  weeklySentFor?: string;
}

export interface Session {
  /** sha256 of the cookie token – the raw token is never stored. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface PasswordReset {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface Brand {
  id: string;
  ownerId: string;
  name: string;
  headline?: string;
  website?: string;
  instagram?: string;
  industry: string;
  description: string;
  audience: string;
  voice: string;
  offers: string[];
  claimsToAvoid: string[];
  colors: BrandColors;
  logoUrl?: string;
  language: Language;
  /** Example Reels the owner wants to resemble (links). */
  referenceReels: string[];
  /** The look last chosen for this brand's Reels (pre-selected next time). */
  defaultStyle?: import("./styles").StyleId;
  /** Looks learned from reference videos the owner uploaded (newest first). */
  references?: ReferenceStyle[];
  /** Last chosen reference look, pre-selected next time instead of defaultStyle. */
  defaultReferenceId?: string;
  /** Idea Studio: weekdays to post on (1 = Monday … 7 = Sunday) and whether drafts are made automatically. */
  schedule?: { days: number[]; autoDraft: boolean; /** When the customer turned automatic drafts on themselves. */ autoDraftOnAt?: string };
  /** Idea Studio: post approved Reels automatically on their day (the customer turns this on). */
  autoPost?: AutoPost;
  createdAt: string;
}

/** Channels Idea Studio can post to by itself (TikTok needs the person to confirm each post). */
export type AutoChannel = "instagram" | "facebook" | "linkedin";

export interface AutoPost {
  on: boolean;
  /** When the customer turned it on. */
  onAt?: string;
  /** Local posting time, "HH:MM" in the brand's time zone. */
  time: string;
  channels: AutoChannel[];
}

/** One planned post in a brand's content calendar. */
export interface Slot {
  id: string;
  brandId: string;
  /** YYYY-MM-DD (the brand's local posting day). */
  date: string;
  title: string;
  /** Brief for the script writer: what the Reel is about and the angle. */
  topic: string;
  hook: string;
  template: TemplateId;
  /** A seasonal moment this idea plays on, e.g. "Midsommar". */
  occasion?: string;
  /** What photos or clips would suit it (shown to the owner). */
  needsMedia?: string;
  skipped?: boolean;
  /** The draft Reel made for this slot. */
  reelId?: string;
  /** The posting date this idea was planned for, when it has been moved. */
  plannedFor?: string;
  /** Why an automatic draft wasn't made (e.g. out of Reels this month). */
  note?: string;
  /** Automatic posting of this post's Reel. */
  posting?: {
    status: "posting" | "posted" | "failed";
    at: string;
    channels: AutoChannel[];
    /** Channels that didn't work, with why (a post can go out on some channels and not others). */
    errors?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

/** A look learned from an uploaded reference video (the video itself is not kept). */
export interface ReferenceStyle {
  id: string;
  name: string;
  /** One user-facing sentence, e.g. "Fast cuts (1.2 s), bold centred captions, warm colours". */
  summary: string;
  base: import("./styles").StyleId;
  overrides: import("./styles").StyleOverrides;
  avgShotSeconds: number | null;
  sourceUrl?: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  brandId: string;
  fileName: string;
  mimeType: string;
  kind: "image" | "video";
  /** Length of a video clip in seconds (when known). */
  duration?: number;
  /** Where it came from, e.g. "Pexels" stock (for attribution). */
  source?: { name: string; url?: string; author?: string };
  createdAt: string;
}

/** Size, font and colours chosen for a Meme caption or Talking video title. */
export interface TitleStyle {
  size?: "s" | "m" | "l" | "xl";
  font?: "inter" | "playfair" | "bebas" | "nunito" | "montserrat" | "dmSerif";
  /** Text colour, #rrggbb */
  color?: string;
  /** Box colour (Talking video) or caption area colour (Meme), #rrggbb; "none" = no box. */
  background?: string;
  upper?: boolean;
}

export type TemplateId = "showcase" | "beforeAfter" | "tips" | "meme" | "talk";

export interface Slide {
  text: string;
  mediaId?: string;
  /** For video clips: where in the clip to start (seconds). */
  clipStart?: number;
  /** Meme only: where the clip ends (seconds). */
  clipEnd?: number;
}

export interface ReelScript {
  template: TemplateId;
  /** Visual look (see src/lib/styles.ts); Bold Pop when missing. */
  style?: import("./styles").StyleId;
  /** Tweaks copied from an uploaded reference video (set by the server only). */
  styleOverrides?: import("./styles").StyleOverrides;
  /** The brand reference those tweaks came from. */
  referenceId?: string;
  /** Meme / Talking video: the customer's own look for the title (top caption). */
  titleStyle?: TitleStyle;
  hook: string;
  slides: Slide[];
  /** Keep the clips' own sound (Meme default); otherwise clips are muted. */
  sound?: boolean;
  /** Background music (looped under the whole Reel). Volume 0–1. */
  music?: SoundRef & { volume?: number };
  /** Sound effects at moments of the Reel. */
  effects?: { at: SoundMoment; sound: SoundRef; volume?: number }[];
  /** Spoken voice: a recorded or uploaded voiceover, an AI voice, or (Talking video) the clip's own speech. */
  voice?: VoiceTrack;
  cta: string;
  caption: string;
  hashtags: string[];
}

export type ReelStatus = "draft" | "approved";

export interface Revision {
  request: string;
  at: string;
}

export interface Reel {
  id: string;
  brandId: string;
  topic: string;
  script: ReelScript;
  mediaIds: string[];
  status: ReelStatus;
  revisions: Revision[];
  renderFile?: string;
  /** Whether the stored MP4 has the free-trial watermark. */
  renderWatermark?: boolean;
  /** Where this Reel has been posted (newest last). */
  publications?: Publication[];
  createdAt: string;
  updatedAt: string;
}

export type SocialProvider = "tiktok" | "meta" | "instagram" | "linkedin";

/** A Facebook Page the user manages, with its linked Instagram professional account (if any). */
export interface MetaPage {
  id: string;
  name: string;
  pictureUrl?: string;
  /** Page access token (never expires when derived from a long-lived user token), encrypted. */
  tokenEnc: string;
  igId?: string;
  igUsername?: string;
  igPictureUrl?: string;
}

/** A brand's connected social account. Tokens are stored encrypted. */
export interface SocialConnection {
  id: string;
  brandId: string;
  ownerId: string;
  provider: SocialProvider;
  /** The account id on the platform (TikTok open_id). */
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  scope: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  /** Meta only: the user's Pages and which one this brand posts to. */
  pages?: MetaPage[];
  /** Meta: the selected Page. LinkedIn: the selected company page id (unset = the member's own profile). */
  selectedPageId?: string;
  /** LinkedIn only: company pages the member may post for, and which app the token belongs to. */
  orgs?: { id: string; name: string; logoUrl?: string }[];
  liApp?: "pages" | "member";
  createdAt: string;
  updatedAt: string;
}

export type PublishTarget = "tiktok" | "instagram" | "facebook" | "linkedin";

export interface Publication {
  provider: PublishTarget;
  accountName: string;
  /** Platform id for the upload (TikTok publish_id). */
  publishId: string;
  privacy: string;
  status: "processing" | "published" | "failed";
  error?: string;
  postId?: string;
  /** Link to the live post, when the platform gives one. */
  permalink?: string;
  /** Which connection posted it (Instagram can come from "Connect Instagram" or from a Facebook Page). */
  via?: SocialProvider;
  createdAt: string;
  updatedAt: string;
}

export interface PlanIdea {
  title: string;
  template: TemplateId;
  hook: string;
  needsMedia: string;
}

export interface Plan {
  brandId: string;
  ideas: PlanIdea[];
  createdAt: string;
}

/** Props passed to the Remotion composition (browser preview and MP4 render). */
/** A sound effect or music track imported from Openverse (CC0 only: no credit needed, commercial use OK). */
export interface SoundRef {
  /** Openverse id */
  id: string;
  title: string;
  creator?: string;
  /** Always "cc0" today. */
  license: string;
  /** Seconds */
  duration: number;
  /** Where it came from (e.g. the Freesound page), for our records. */
  pageUrl?: string;
}

export interface StoredSound extends SoundRef {
  fileName: string;
  mimeType: string;
  importedAt: string;
}

/** One spoken word with its timing (seconds from the start of the voice audio, or of the clip for Talking video). */
export interface VoiceWord {
  text: string;
  start: number;
  end: number;
}

export interface VoiceTrack {
  /** Id in the "voices" collection. */
  id: string;
  source: "recorded" | "ai" | "clip";
  text: string;
  words: VoiceWord[];
  /** Seconds */
  duration: number;
  /** Show word-by-word captions (replaces the slide text while the voice plays). */
  captions: boolean;
  /** AI voice name, for display. */
  voiceName?: string;
}

/** A voice recording, AI voice or clip transcript, owned by a brand. */
export interface StoredVoice extends Omit<VoiceTrack, "captions"> {
  brandId: string;
  /** Audio file in storage (recorded / AI). Talking video uses the clip's own audio instead. */
  fileName?: string;
  mimeType?: string;
  /** Talking video: the clip that was transcribed. */
  mediaId?: string;
  /** ElevenLabs voice id (AI voice). */
  voiceId?: string;
  language?: string;
  createdAt: string;
}

/** Moments a sound effect can play at: "hook", "s0"…"s7" (slides), "cta"; memes: "start", "punch", "end". */
export type SoundMoment = string;

export interface ReelRenderProps {
  /** Background music and sound effects, resolved to URLs and frames. */
  audio?: {
    music?: { url: string; volume: number };
    effects: { url: string; from: number; volume: number }[];
    /** Recorded / AI voiceover, from the start of the Reel. */
    voice?: { url: string; volume: number };
  };
  brand: Pick<Brand, "name" | "colors" | "logoUrl">;
  /** Free-trial Reels carry a small "Made with Tadaa" mark. */
  watermark?: boolean;
  script: ReelScript;
  media: { id: string; url: string; kind: "image" | "video" }[];
  [key: string]: unknown;
}

/** A client (e.g. Claude) registered through OAuth dynamic client registration. */
export interface OAuthClient {
  clientId: string;
  /** sha256 of the client secret, for confidential clients. */
  secretHash?: string;
  name: string;
  redirectUris: string[];
  createdAt: string;
}

/** One-time authorization code (stored hashed). */
export interface OAuthCode {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: string;
}

/** Access or refresh token (stored hashed). */
export interface OAuthToken {
  tokenHash: string;
  kind: "access" | "refresh";
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: string;
  createdAt: string;
}
