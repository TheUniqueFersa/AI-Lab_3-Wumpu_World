// runner.js
// Plays games and collects the results of the experiments.
// Works the same in the browser (web page) and in Node (tests/run-experiments.mjs).

import { createAgent } from "../agent/agents.js";
import { optimalScore } from "../world/oracle.js";

// Safety limit: a game is stopped after this many actions (no agent should need it).
export const MAX_ACTIONS = 300;

// Plays one full game with one agent and returns one result row.
//   server: RemoteServer or LocalSimulator
//   options: { riskThreshold, useCodeRules, seed, onStep, delayMs }
export async function playGame(server, agentName, options = {}) {
  const agent = createAgent(agentName, options);
  const started = await server.newGame(options.seed);
  const gameId = started.gameId;

  // Only the local simulator can reveal the world (extra experiments).
  let optimum = null;
  if (server.kind === "local") {
    optimum = optimalScore(server.getOriginalWorld(gameId));
  }

  agent.start(started.perception);
  const initial = started.perception;
  let percept = started.perception;
  let actions = 0;
  let killedWumpus = false;

  while (!percept.gameOver && actions < MAX_ACTIONS) {
    const action = agent.nextAction();
    percept = await server.action(gameId, action);
    agent.observe(action, percept);
    actions++;
    if (percept.scream) killedWumpus = true;
    if (options.onStep) await options.onStep(agent, action, percept);
    if (options.delayMs) await sleep(options.delayMs);
  }

  return {
    agent: agentName,
    threshold: agentName === "C" ? agent.riskThreshold : "",
    codeRules: options.useCodeRules ? 1 : 0,
    backend: server.kind,
    seed: server.kind === "local" ? (options.seed ?? "") : "",
    gameId,
    score: percept.score,
    outcome: outcomeOf(percept, actions),
    actions,
    usedArrow: agent.hasArrow ? 0 : 1,
    killedWumpus: killedWumpus ? 1 : 0,
    startBreeze: initial.breeze ? 1 : 0,
    startStench: initial.stench ? 1 : 0,
    visited: agent.visited.size,
    dpllCalls: agent.dpllCalls ?? 0,
    thinkMs: Math.round((agent.thinkTimeMs ?? 0) * 100) / 100,
    optimum: optimum ?? "",
  };
}

// Plays `games` rounds; each round plays one game with every configuration, in turns
// (A, B, C, A, B, C, ...), so a slow or restarted server affects all of them equally.
//   configs: array of { agent, riskThreshold, useCodeRules }
//   With the local simulator every configuration of a round uses the same seed,
//   so all of them play exactly the same world.
export async function runExperiment(server, configs, games, hooks = {}) {
  const rows = [];
  const firstSeed = hooks.firstSeed ?? 1;
  for (let round = 0; round < games; round++) {
    for (const config of configs) {
      if (hooks.shouldStop && hooks.shouldStop()) return rows;
      const seed = server.kind === "local" ? firstSeed + round : undefined;
      try {
        const row = await playGame(server, config.agent, { ...config, seed, delayMs: hooks.delayMs });
        rows.push(row);
        if (hooks.onResult) hooks.onResult(row, rows);
        // In the browser, give the page a moment to redraw between games.
        if (hooks.yieldToUi) await sleep(0);
      } catch (error) {
        if (hooks.onError) hooks.onError(error, config);
        else throw error;
      }
    }
  }
  return rows;
}

export function outcomeOf(percept, actions) {
  if (!percept.gameOver) return actions >= MAX_ACTIONS ? "limit" : "unfinished";
  if (percept.message.includes("VICTORY")) return "gold";
  if (percept.message.includes("Died")) return "death";
  return "empty";
}

// Name used to group rows, for example "A", "B" or "C (35%)".
export function configName(row) {
  let name = row.agent;
  if (row.agent === "C") name += " (" + Math.round(100 * row.threshold) + "%)";
  if (row.codeRules) name += " +code";
  return name;
}

// Summary statistics of a group of rows, with 95% confidence intervals
// (normal approximation: mean +- 1.96 * standard error).
export function summarize(rows) {
  const n = rows.length;
  const scores = rows.map((r) => r.score);
  const mean = average(scores);
  const sd = n > 1 ? Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const rate = (outcome) => rows.filter((r) => r.outcome === outcome).length / Math.max(n, 1);
  const rateCi = (p) => 1.96 * Math.sqrt((p * (1 - p)) / Math.max(n, 1));
  const gold = rate("gold");
  const death = rate("death");
  const optimumRows = rows.filter((r) => r.optimum !== "");
  return {
    n,
    meanScore: mean,
    sdScore: sd,
    ciScore: n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0,
    medianScore: median(scores),
    goldRate: gold,
    goldCi: rateCi(gold),
    deathRate: death,
    deathCi: rateCi(death),
    emptyRate: rate("empty"),
    meanActions: average(rows.map((r) => r.actions)),
    arrowRate: average(rows.map((r) => r.usedArrow)),
    killRate: average(rows.map((r) => r.killedWumpus)),
    meanDpllCalls: average(rows.map((r) => r.dpllCalls)),
    meanThinkMs: average(rows.map((r) => r.thinkMs)),
    meanOptimum: optimumRows.length > 0 ? average(optimumRows.map((r) => r.optimum)) : null,
  };
}

// Groups rows by configuration name and summarizes each group.
export function summarizeByConfig(rows, filter = () => true) {
  const groups = new Map();
  for (const row of rows.filter(filter)) {
    const name = configName(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups].map(([name, group]) => ({ name, ...summarize(group) }));
}

export const CSV_COLUMNS = ["agent", "threshold", "codeRules", "backend", "seed", "gameId", "score", "outcome",
  "actions", "usedArrow", "killedWumpus", "startBreeze", "startStench", "visited", "dpllCalls", "thinkMs", "optimum"];

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => row[c]).join(","));
  return lines.join("\n") + "\n";
}

function average(values) {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
