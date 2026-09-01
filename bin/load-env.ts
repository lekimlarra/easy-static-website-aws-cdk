// Loads .env before anything else in the app is imported.
//
// The constructs under lib/ read their configuration from process.env at module
// scope, so .env has to be in place *before* those modules are evaluated.
// ES module imports are hoisted, so calling dotenv.config() inline in the entry
// point is not enough: keeping the call in its own module and importing it first
// is what guarantees the ordering under any loader.
import * as dotenv from "dotenv";

dotenv.config({ quiet: true }); // quiet keeps dotenv v17 from printing its banner into "cdk synth" stdout
