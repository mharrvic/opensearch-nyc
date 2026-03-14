import "dotenv/config";

import { runReindex } from "@/lib/ingest";

async function main() {
  const report = await runReindex();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
