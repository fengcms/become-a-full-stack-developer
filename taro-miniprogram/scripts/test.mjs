import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync(".test-build", { recursive: true });
await build({
  entryPoints: ["test/core.test.ts"],
  outfile: ".test-build/core.test.cjs",
  bundle: true,
  define: { __API_BASE__: JSON.stringify("https://api-befull.kao9.com/api/v1") },
  platform: "node",
  format: "cjs",
  alias: { "@tarojs/taro": resolve("test/taro-mock.ts") },
});
execFileSync(process.execPath, ["--test", ".test-build/core.test.cjs"], { stdio: "inherit" });
