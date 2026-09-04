#!/usr/bin/env node

import { DESIGN_PARITY_INVENTORY } from "./design-parity-inventory.mjs";
import { validateDesignParity } from "./check-completeness.mjs";

const errors = validateDesignParity(DESIGN_PARITY_INVENTORY, { checkFiles: true });
if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} design parity findings.`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: design parity inventory is green.");
}
