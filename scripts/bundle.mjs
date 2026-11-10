// Pre-builds the Remotion bundle so renders don't run webpack at request time.
// Usage: node scripts/bundle.mjs [outDir]   (default: ./remotion-bundle)
import { bundle } from "@remotion/bundler";
import path from "path";

const root = process.cwd();
const outDir = path.resolve(process.argv[2] || path.join(root, "remotion-bundle"));
await bundle({ entryPoint: path.join(root, "src/remotion/index.ts"), outDir });
console.log("Remotion bundle written to", outDir);
