// Vite plugin: inject a precache manifest into our handwritten service worker.
//
// At build time we walk `dist/client/`, collect the static assets we want
// available offline on cold-boot, hash that list, and rewrite the two
// placeholders in `dist/client/sw.js`:
//
//   const VERSION  = "__SW_VERSION__"  -> "<short content hash>"
//   const PRECACHE = "__PRECACHE__"    -> JSON array of URLs to precache
//
// The version hash is derived from the list contents so any change to the
// shipped assets produces a new SW byte stream — which is what tells the
// browser an update is available.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import type { Plugin } from "vite";

interface SwPrecacheOptions {
  // Output dir for the client bundle; default matches TanStack Start + CF Workers.
  clientDir?: string;
  // SW filename inside clientDir.
  swFile?: string;
  // URL of the app shell to also include in precache (NetworkFirst fallback target).
  appShell?: string;
}

const DEFAULT_OPTIONS: Required<SwPrecacheOptions> = {
  clientDir: "dist/client",
  swFile: "sw.js",
  appShell: "/",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function shouldPrecache(relPath: string, swFile: string): boolean {
  if (relPath === swFile) return false;
  if (relPath.startsWith(".")) return false;
  if (relPath.endsWith(".map")) return false;
  if (relPath.endsWith(".assetsignore")) return false;
  return true;
}

export function swPrecache(userOptions: SwPrecacheOptions = {}): Plugin {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  return {
    name: "sw-precache",
    apply: "build",
    closeBundle: {
      // We only want to run after the client bundle is fully written, not after
      // the SSR pass (TanStack Start builds both; SSR would otherwise re-run us
      // against a copy of public/sw.js that has been re-staged from source).
      handler() {
        // @ts-expect-error - this.environment exists on Vite 6+ plugin context
        const envName = this.environment?.name as string | undefined;
        if (envName && envName !== "client") return;

        const swPath = join(options.clientDir, options.swFile);
        let template: string;
        try {
          template = readFileSync(swPath, "utf8");
        } catch {
          this.warn(`[sw-precache] ${swPath} not found; skipping precache injection.`);
          return;
        }

        if (!template.includes("__SW_VERSION__") && !template.includes("__PRECACHE__")) {
          // Already substituted (e.g. plugin somehow ran twice). No-op.
          return;
        }

        const files = walk(options.clientDir);
        const urls = files
          .map((f) => relative(options.clientDir, f).split(sep).join(posix.sep))
          .filter((rel) => shouldPrecache(rel, options.swFile))
          .map((rel) => `/${rel}`)
          .sort();

        // Include the app shell (e.g. "/") so the SW can precache it for offline boot.
        const precache = [options.appShell, ...urls];

        const hash = createHash("sha256")
          .update(precache.join("\n"))
          .digest("hex")
          .slice(0, 12);

        const next = template
          .replace(/"__SW_VERSION__"/g, JSON.stringify(hash))
          .replace(/\["__PRECACHE__"\]/g, JSON.stringify(precache));

        if (next === template) {
          this.warn(
            "[sw-precache] placeholders detected but no substitution happened; check the SW template",
          );
          return;
        }

        writeFileSync(swPath, next);
        // eslint-disable-next-line no-console
        console.log(
          `[sw-precache] injected ${precache.length} URLs into ${options.swFile} (version ${hash})`,
        );
      },
    },
  };
}
