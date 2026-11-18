import { autoPostOf, CHANNEL_NAME } from "./autopost";
import { getReel, listAllUsers, listBrands, listSlots, updateUser } from "./db";
import { appOrigin, sendEmail } from "./email";
import { signUnsubscribe } from "./oauth";
import { localTime } from "./autopost";
import { isoWeekday, today } from "./studio";
import type { Brand, Slot, User } from "./types";

/**
 * Idea Studio part 2: the Monday email. One per user: this week's posts per brand, drafts waiting
 * for review, and how last week went. Sent Monday from 08:00 (brand's time zone), never twice a week.
 */

export const WEEKLY_HOUR = "08:00";

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const mondayOf = (date: string) => addDays(date, 1 - isoWeekday(date));
const fmt = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Line = { date: string; title: string; state: string; tone: "todo" | "ok" | "idle" | "bad" };
type BrandWeek = { brand: Brand; lines: Line[]; toReview: number; ideasNoDraft: number; lastPosted: number; lastFailed: number };

async function brandWeek(brand: Brand, monday: string): Promise<BrandWeek | null> {
  const sunday = addDays(monday, 6);
  const lastMonday = addDays(monday, -7);
  const auto = autoPostOf(brand);
  const slots = await listSlots(brand.id);
  const lines: Line[] = [];
  let toReview = 0;
  let ideasNoDraft = 0;
  for (const s of slots.filter((x) => x.date >= monday && x.date <= sunday && !x.skipped)) {
    const reel = s.reelId ? await getReel(s.reelId) : null;
    lines.push({ date: s.date, title: s.title, ...stateOf(s, reel?.status, auto) });
    if (reel?.status === "draft") toReview++;
    if (!reel) ideasNoDraft++;
  }
  const last = slots.filter((x) => x.date >= lastMonday && x.date < monday);
  const lastPosted = last.filter((x) => x.posting?.status === "posted").length;
  const lastFailed = last.filter((x) => x.posting?.status === "failed").length;
  if (!lines.length && !lastPosted && !lastFailed) return null;
  return { brand, lines, toReview, ideasNoDraft, lastPosted, lastFailed };
}

function stateOf(s: Slot, reelStatus: string | undefined, auto: ReturnType<typeof autoPostOf>): Omit<Line, "date" | "title"> {
  if (s.posting?.status === "posted") return { state: "Posted", tone: "ok" };
  if (s.posting?.status === "failed") return { state: "Not posted", tone: "bad" };
  if (reelStatus === "approved") {
    return auto.on && auto.channels.length
      ? { state: `Approved · posts ${auto.time} to ${auto.channels.map((c) => CHANNEL_NAME[c]).join(", ")}`, tone: "ok" }
      : { state: "Approved · post it from the Reel page", tone: "ok" };
  }
  if (reelStatus === "draft") return { state: "Draft · needs your review", tone: "todo" };
  return { state: "Idea · no draft yet", tone: "idle" };
}

export async function buildWeeklyEmail(user: User, monday: string) {
  const weeks = (await Promise.all((await listBrands(user.id)).map((b) => brandWeek(b, monday)))).filter((w): w is BrandWeek => !!w);
  if (!weeks.length) return null;
  const origin = appOrigin();
  const unsub = `${origin}/api/email/unsubscribe?u=${user.id}&t=${await signUnsubscribe(user.id)}`;
  const toReview = weeks.reduce((n, w) => n + w.toReview, 0);
  const posts = weeks.reduce((n, w) => n + w.lines.length, 0);
  const subject = toReview
    ? `Your week: ${toReview} Reel${toReview > 1 ? "s" : ""} to review`
    : `Your week: ${posts} post${posts === 1 ? "" : "s"} planned`;
  const first = user.name?.split(" ")[0] || "there";

  // Plain text
  const text = [
    `Hi ${first},`,
    "",
    `Here's your week on Tadaa (from ${fmt(monday)}).`,
    ...weeks.flatMap((w) => [
      "",
      w.brand.name.toUpperCase(),
      ...(w.lines.length ? w.lines.map((l) => `- ${fmt(l.date)}: ${l.title} – ${l.state}`) : ["- Nothing planned this week."]),
      ...(w.lastPosted || w.lastFailed ? [`Last week: ${w.lastPosted} posted${w.lastFailed ? `, ${w.lastFailed} not posted` : ""}.`] : []),
      `Open Idea Studio: ${origin}/brands/${w.brand.id}/calendar`,
    ]),
    "",
    "– Tadaa",
    "",
    `Don't want this email? ${unsub}`,
  ].join("\n");

  // HTML
  const colors = { todo: "#b45309", ok: "#047857", idle: "#6b7280", bad: "#b91c1c" };
  const section = (w: BrandWeek) => `
    <tr><td style="padding:24px 0 8px"><div style="font-size:18px;font-weight:800">${esc(w.brand.name)}</div>
    ${w.toReview ? `<div style="color:#b45309;font-size:14px;margin-top:2px">${w.toReview} draft${w.toReview > 1 ? "s" : ""} waiting for your review</div>` : ""}
    </td></tr>
    ${
      w.lines.length
        ? w.lines
            .map(
              (l) => `<tr><td style="padding:8px 12px;background:#faf7f2;border-radius:10px;border-bottom:4px solid #fff">
      <div style="font-size:12px;color:#6b7280">${fmt(l.date)}</div>
      <div style="font-size:15px;font-weight:700">${esc(l.title)}</div>
      <div style="font-size:13px;color:${colors[l.tone]}">${esc(l.state)}</div></td></tr>`,
            )
            .join("")
        : `<tr><td style="font-size:14px;color:#6b7280">Nothing planned this week.</td></tr>`
    }
    ${w.lastPosted || w.lastFailed ? `<tr><td style="font-size:13px;color:#6b7280;padding-top:6px">Last week: ${w.lastPosted} posted${w.lastFailed ? `, <span style="color:#b91c1c">${w.lastFailed} not posted</span>` : ""}.</td></tr>` : ""}
    <tr><td style="padding-top:12px"><a href="${origin}/brands/${w.brand.id}/calendar" style="display:inline-block;background:#ff5a4e;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:14px">${w.toReview ? "Review drafts" : "Open Idea Studio"}</a></td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
  <table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:22px;font-weight:900">Tadaa</td></tr>
    <tr><td style="padding-top:16px;font-size:15px">Hi ${esc(first)}, here's your week (from ${fmt(monday)}).</td></tr>
    ${weeks.map(section).join("")}
    <tr><td style="padding-top:32px;font-size:12px;color:#9ca3af">You get this every Monday because you plan Reels with Tadaa.
    <a href="${unsub}" style="color:#9ca3af">Unsubscribe</a> · <a href="${origin}/account" style="color:#9ca3af">Email settings</a></td></tr>
  </table></td></tr></table></body></html>`;

  return { subject, text, html, unsub };
}

let running = false;

/** Background job: sends the weekly email to everyone due (Monday from 08:00 in their first brand's zone). */
export async function weeklyEmails(now = new Date()) {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    for (const user of await listAllUsers()) {
      if (user.emails?.weekly === false) continue;
      const brands = await listBrands(user.id);
      if (!brands.length) continue;
      const zoneBrand = brands[brands.length - 1]; // oldest brand
      const day = today(zoneBrand, now);
      if (isoWeekday(day) !== 1 || localTime(zoneBrand, now) < WEEKLY_HOUR) continue;
      const monday = mondayOf(day);
      if (user.weeklySentFor === monday) continue;
      try {
        const mail = await buildWeeklyEmail(user, monday);
        // Mark first so a slow or failing send never turns into repeated emails.
        await updateUser(user.id, { weeklySentFor: monday });
        if (!mail) continue;
        await sendEmail(user.email, mail.subject, mail.text, {
          html: mail.html,
          headers: { "List-Unsubscribe": `<${mail.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        sent++;
      } catch (e) {
        console.error("[weekly] user", user.id, e);
      }
    }
  } finally {
    running = false;
  }
  return sent;
}
