// Renders a Reel to MP4 with Remotion.
// Usage: node scripts/render.mjs <props.json> <out.mp4>
// Runs as a separate process so the Next.js server never bundles Remotion's renderer.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { existsSync, readFileSync } from "fs";
import path from "path";

const [propsFile, outFile] = process.argv.slice(2);
if (!propsFile || !outFile) {
  console.error("Usage: node scripts/render.mjs <props.json> <out.mp4>");
  process.exit(1);
}

const root = process.cwd();
const inputProps = JSON.parse(readFileSync(propsFile, "utf8"));

// Browser: an explicit path wins; otherwise Remotion's own headless shell (installed in the Docker image),
// falling back to a system Chrome for local development.
const browserExecutable =
  process.env.REMOTION_BROWSER ||
  (existsSync(path.join(root, "node_modules/.remotion")) ? null : ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p))) ||
  null;

// Bundle: use the one built at deploy time (scripts/bundle.mjs) if present, else build and cache one.
const prebuilt = path.join(root, "remotion-bundle");
const cacheDir = path.join(process.env.TADAA_DATA_DIR || path.join(root, "data"), ".remotion-bundle");
let serveUrl;
if (existsSync(path.join(prebuilt, "index.html"))) serveUrl = prebuilt;
else if (existsSync(path.join(cacheDir, "index.html")) && !process.env.TADAA_REBUNDLE) serveUrl = cacheDir;
else serveUrl = await bundle({ entryPoint: path.join(root, "src/remotion/index.ts"), outDir: cacheDir });

const concurrency = Number(process.env.TADAA_RENDER_CONCURRENCY || 1);
// Tunables so a host can switch Chrome setups with env vars, without a rebuild.
const chromeMode = process.env.TADAA_CHROME_MODE || (browserExecutable ? "chrome-for-testing" : "headless-shell");
const gl = process.env.TADAA_RENDER_GL || "swangle";
const chromiumOptions = { gl };
// e.g. 0.75 renders 810x1440 and 0.5 renders 540x960 instead of 1080x1920 – lighter on small servers.
const scale = Number(process.env.TADAA_RENDER_SCALE || 1);
console.log(`render start browser=${browserExecutable ?? "remotion-headless-shell"} mode=${chromeMode} gl=${gl} bundle=${serveUrl} concurrency=${concurrency} scale=${scale}`);

const timeoutInMilliseconds = Number(process.env.TADAA_RENDER_TIMEOUT_MS || 120000);
const t0 = Date.now();
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, browserExecutable, chromeMode, chromiumOptions, timeoutInMilliseconds });
console.log(`composition ready after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let last = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outFile,
  inputProps,
  browserExecutable,
  concurrency,
  timeoutInMilliseconds,
  chromeMode,
  chromiumOptions,
  scale,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct % 10 === 0 && pct !== last) {
      last = pct;
      console.log(`progress ${pct}% after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  },
});
console.log("done", outFile);
