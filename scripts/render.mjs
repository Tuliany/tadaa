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
const bundleDir = path.join(process.env.TADAA_DATA_DIR || path.join(root, "data"), ".remotion-bundle");
const inputProps = JSON.parse(readFileSync(propsFile, "utf8"));

const browserExecutable =
  process.env.REMOTION_BROWSER ||
  ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p)) ||
  null;

// Reuse the bundle between renders; set TADAA_REBUNDLE=1 after changing templates.
const serveUrl =
  existsSync(path.join(bundleDir, "index.html")) && !process.env.TADAA_REBUNDLE
    ? bundleDir
    : await bundle({ entryPoint: path.join(root, "src/remotion/index.ts"), outDir: bundleDir });

const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, browserExecutable });

let last = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outFile,
  inputProps,
  browserExecutable,
  chromiumOptions: { gl: "swangle" },
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct % 10 === 0 && pct !== last) {
      last = pct;
      console.log(`progress ${pct}%`);
    }
  },
});
console.log("done", outFile);
