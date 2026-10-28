// run-experiments.mjs
// Runs the agent comparison from the terminal and saves one CSV row per game.
// Node 18 or newer is needed (it includes fetch).
//
// Main experiment (shared server, as every other team):
//   node tests/run-experiments.mjs --games 300 --agents A,B,C --out results/server.csv
//
// Options:
//   --server NAME        "render" (default, main tests) or "localhost", as named in js/config.js;
//                        a full address like http://localhost:9000 also works
//   --local              EXTRA: use the local simulator (same worlds for every agent)
//   --games N            rounds; each round plays one game with every configuration
//   --agents A,B,C       agents to compare
//   --thresholds 0.35    risk thresholds for agent C, for example 0.2,0.35,0.5
//   --code-rules         EXTRA: also run B and C with the rules taken from game.go
//   --delay MS           pause between actions (be gentle with the shared server)
//   --out FILE           CSV file to write

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RemoteServer } from "../js/world/remote.js";
import { SERVERS, DEFAULT_SERVER } from "../js/config.js";
import { LocalSimulator } from "../js/world/simulator.js";
import { runExperiment, summarizeByConfig, toCsv } from "../js/experiments/runner.js";

const args = parseArgs(process.argv.slice(2));
const games = Number(args.games ?? 50);
const agents = (args.agents ?? "A,B,C").split(",");
const thresholds = (args.thresholds ?? "0.35").split(",").map(Number);
const out = args.out ?? "results/results.csv";
const serverName = args.server ?? DEFAULT_SERVER;
const serverUrl = SERVERS[serverName] ? SERVERS[serverName].url : serverName;
const server = args.local ? new LocalSimulator() : new RemoteServer(serverUrl);

// Build the list of configurations to compare.
const configs = [];
for (const agent of agents) {
  if (agent === "C") {
    for (const t of thresholds) configs.push({ agent, riskThreshold: t, useCodeRules: false });
  } else {
    configs.push({ agent, useCodeRules: false });
  }
}
if (args["code-rules"]) {
  for (const c of configs.filter((c) => c.agent !== "A")) configs.push({ ...c, useCodeRules: true });
}

console.log("Backend: " + (args.local ? "local simulator (extra)" : server.baseUrl));
console.log("Configurations: " + configs.length + ", rounds: " + games + ", games: " + configs.length * games);

const t0 = Date.now();
const rows = await runExperiment(server, configs, games, {
  delayMs: Number(args.delay ?? 0),
  onResult: (row, all) => {
    if (all.length % configs.length !== 0) return;
    const round = all.length / configs.length;
    const seconds = ((Date.now() - t0) / 1000).toFixed(0);
    const text = "Round " + round + "/" + games + "  (" + seconds + " s)";
    // In a terminal, rewrite the same line; in a log file, print every 10% only.
    if (process.stdout.isTTY) process.stdout.write("\r" + text);
    else if (round % Math.max(1, Math.round(games / 10)) === 0) console.log(text);
  },
  onError: (error, config) => console.error("\nGame failed (" + config.agent + "): " + error.message),
});
console.log("\n");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCsv(rows));
console.log("Saved " + rows.length + " games to " + out + "\n");

printTable("All games", summarizeByConfig(rows));
printTable("Games with breeze in [1,1]", summarizeByConfig(rows, (r) => r.startBreeze === 1));
printTable("Games without breeze in [1,1]", summarizeByConfig(rows, (r) => r.startBreeze === 0));

function printTable(title, summaries) {
  console.log(title);
  const table = summaries.map((s) => ({
    config: s.name,
    games: s.n,
    "gold %": (100 * s.goldRate).toFixed(1) + " ± " + (100 * s.goldCi).toFixed(1),
    "death %": (100 * s.deathRate).toFixed(1),
    "empty %": (100 * s.emptyRate).toFixed(1),
    "mean score": s.meanScore.toFixed(0) + " ± " + s.ciScore.toFixed(0),
    actions: s.meanActions.toFixed(1),
    "DPLL calls": s.meanDpllCalls.toFixed(0),
    "think ms": s.meanThinkMs.toFixed(1),
    ...(s.meanOptimum !== null ? { optimum: s.meanOptimum.toFixed(0) } : {}),
  }));
  console.table(table);
}

function parseArgs(list) {
  const result = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith("--")) continue;
    const name = list[i].slice(2);
    const next = list[i + 1];
    if (next === undefined || next.startsWith("--")) result[name] = true;
    else { result[name] = next; i++; }
  }
  return result;
}
