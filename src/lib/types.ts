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

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
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
  createdAt: string;
}

export interface MediaItem {
  id: string;
  brandId: string;
  fileName: string;
  mimeType: string;
  kind: "image" | "video";
  createdAt: string;
}

export type TemplateId = "showcase" | "beforeAfter" | "tips";

export interface Slide {
  text: string;
  mediaId?: string;
}

export interface ReelScript {
  template: TemplateId;
  /** Visual look (see src/lib/styles.ts); Bold Pop when missing. */
  style?: import("./styles").StyleId;
  hook: string;
  slides: Slide[];
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
  selectedPageId?: string;
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
export interface ReelRenderProps {
  brand: Pick<Brand, "name" | "colors" | "logoUrl">;
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
