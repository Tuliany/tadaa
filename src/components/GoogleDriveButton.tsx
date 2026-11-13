"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { MediaItem } from "@/lib/types";

interface Config {
  available: boolean;
  clientId?: string;
  apiKey?: string;
  appId?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
].join(",");

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

/**
 * "Import from Google Drive": Google's own sign-in and file picker. Tadaa only gets access to the files picked
 * (scope drive.file), copies them into the brand's library, and doesn't keep the Google token.
 */
export default function GoogleDriveButton({
  brandId,
  onImported,
  onError,
  className,
}: {
  brandId: string;
  onImported: (items: MediaItem[]) => void;
  onError: (msg: string) => void;
  className?: string;
}) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [busy, setBusy] = useState<"" | "opening" | "importing">("");
  const tokenRef = useRef<string>("");

  useEffect(() => {
    api<Config>("/api/google/config")
      .then(setCfg)
      .catch(() => setCfg({ available: false }));
  }, []);

  if (!cfg?.available) return null;

  async function start() {
    setBusy("opening");
    try {
      await Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")]);
      await new Promise<void>((resolve) => window.gapi.load("picker", { callback: resolve }));
      const token: string = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: cfg!.clientId,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (r: { access_token?: string; error?: string }) =>
            r.access_token ? resolve(r.access_token) : reject(new Error(r.error === "access_denied" ? "" : "Google sign-in failed.")),
          error_callback: (e: { type?: string }) => reject(new Error(e.type === "popup_closed" ? "" : "Google sign-in failed.")),
        });
        client.requestAccessToken({ prompt: tokenRef.current ? "" : "consent" });
      });
      tokenRef.current = token;
      const g = window.google.picker;
      const view = new g.DocsView(g.ViewId.DOCS).setMimeTypes(MIME_TYPES).setIncludeFolders(true).setSelectFolderEnabled(false);
      const picker = new g.PickerBuilder()
        .addView(view)
        .enableFeature(g.Feature.MULTISELECT_ENABLED)
        .setMaxItems(50)
        .setOAuthToken(token)
        .setDeveloperKey(cfg!.apiKey)
        .setAppId(cfg!.appId)
        .setTitle("Pick photos and clips for Tadaa")
        .setCallback(async (data: any) => {
          if (data[g.Response.ACTION] === g.Action.CANCEL) return setBusy("");
          if (data[g.Response.ACTION] !== g.Action.PICKED) return;
          const docs = (data[g.Response.DOCUMENTS] as any[]).map((d) => ({
            id: d[g.Document.ID],
            name: d[g.Document.NAME],
            mimeType: d[g.Document.MIME_TYPE],
          }));
          setBusy("importing");
          try {
            const r = await api<{ items: MediaItem[]; skipped: string[] }>(`/api/brands/${brandId}/media/google`, {
              method: "POST",
              json: { accessToken: token, files: docs },
            });
            onImported(r.items);
            if (r.skipped.length) onError(`Skipped: ${r.skipped.join(", ")}`);
          } catch (e) {
            onError((e as Error).message);
          } finally {
            setBusy("");
          }
        })
        .build();
      picker.setVisible(true);
      setBusy("");
    } catch (e) {
      setBusy("");
      if ((e as Error).message) onError((e as Error).message);
    }
  }

  return (
    <button type="button" onClick={start} disabled={!!busy} className={className ?? "btn-ghost"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/google-drive.png" alt="" className="mr-1.5 inline h-4 w-4 align-[-2px]" />
      {busy === "importing" ? "Importing from Drive…" : busy === "opening" ? "Opening Google Drive…" : "Import from Google Drive"}
    </button>
  );
}
