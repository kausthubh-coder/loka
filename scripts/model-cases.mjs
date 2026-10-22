// Writes prototype/src/features/sidebar/model-cases.json from the prototype's model (model-cases.ts): the cases the
// browser's C++ model must answer the same way.
//
//   bun run model:cases             write the file
//   bun run model:cases -- --cpp    write it, then build and run the C++ tests against it (Windows, build checkout)

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { modelCases } from "../prototype/src/features/sidebar/model-cases";

const root = resolve(import.meta.dirname, "..");
const file = join(root, "prototype", "src", "features", "sidebar", "model-cases.json");
const { states, cases } = modelCases();
// One case a line, so a change to the model shows as the cases it changed.
const lines = cases.map((c) => `\t${JSON.stringify(c)}`).join(",\n");
writeFileSync(file, `{"states": ${JSON.stringify(states)},\n"cases": [\n${lines}\n]}\n`);
console.log(`Wrote ${cases.length} cases to ${file}`);

if (process.argv.includes("--cpp")) {
	const ran = spawnSync("python", [join(root, "scripts", "loka_core_test.py"), file], { stdio: "inherit" });
	process.exit(ran.status ?? 1);
}
