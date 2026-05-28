import "dotenv/config";
import Replicate from "replicate";
import { env } from "../env.js";

const r = new Replicate({ auth: env.REPLICATE_API_TOKEN });
const slug = process.argv[2] ?? "whisperx";
const m = await r.models.get("victor-upmeet", slug);
console.log(`# victor-upmeet/${slug}`);
const schema = m.latest_version?.openapi_schema as { components?: { schemas?: { Input?: { properties?: Record<string, { type?: string; default?: unknown; description?: string }> } } } };
const props = schema.components?.schemas?.Input?.properties ?? {};
for (const [name, def] of Object.entries(props)) {
  console.log(`  ${name.padEnd(35)} default=${JSON.stringify(def.default)}  desc=${(def.description ?? "").slice(0, 80)}`);
}
process.exit(0);
