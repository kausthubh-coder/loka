import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelCases } from "./model-cases";

test("model-cases.json is what the model gives today (bun run model:cases rewrites it)", () => {
	const saved = JSON.parse(readFileSync(join(import.meta.dir, "model-cases.json"), "utf8"));
	expect(saved).toEqual(modelCases());
});
