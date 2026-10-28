// agents.js
// The three agents compared in the experiments.
//
//   A  RandomAgent  No reasoning. Random moves, grabs the gold if it sees it.
//   B  LogicAgent   Hybrid agent of Russell & Norvig (Figure 7.20, p. 270) with DPLL.
//                   It only enters squares that DPLL proves safe. When nothing is
//                   safe it may shoot, and otherwise it goes home and climbs out.
//   C  LogicAgent with riskThreshold set. Same as B, but when nothing is safe it
//                   computes the probability of death in each frontier square
//                   (Section 13.6) and enters the least risky one if the risk is
//                   below the threshold.
//
// Every agent has the same interface:
//   agent.start(perception)        called once with the percept of /game/new
//   agent.nextAction()             returns the next action to send to the server
//   agent.observe(action, percept) called with the server answer to that action

import { DX, DY, key, label, neighbors, allCells, turnLeft, turnRight } from "../geometry.js";
import { WumpusKB } from "../logic/wumpus-kb.js";
import { dpllStats } from "../logic/dpll.js";
import { planRoute, planShot, arrowPath } from "./planner.js";
import { frontierRisks } from "./probability.js";

// ---------------------------------------------------------------------------
// Common state: what every agent knows about itself without any reasoning.
// The server never tells the position, so the agent tracks it from its own actions.
// ---------------------------------------------------------------------------
class BaseAgent {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.dir = 0;              // East
    this.hasArrow = true;
    this.hasGold = false;
    this.wumpusAlive = true;
    this.visited = new Set([key(0, 0)]);
    this.percepts = new Map(); // "x,y" -> percept seen in that square
    this.percept = null;       // latest percept
    this.plan = [];            // actions still to execute
    this.steps = 0;
    this.log = [];             // reasoning trace for the interface
    this.lastShot = null;      // path of the last arrow, to show it on the board
  }

  start(percept) {
    this.percept = percept;
    this.percepts.set(key(this.x, this.y), percept);
  }

  // Updates the agent position and state after the server answers an action.
  observe(action, percept) {
    this.steps++;
    if (action === "Forward" && !percept.bump) {
      this.x += DX[this.dir];
      this.y += DY[this.dir];
      this.visited.add(key(this.x, this.y));
    } else if (action === "TurnLeft") {
      this.dir = turnLeft(this.dir);
    } else if (action === "TurnRight") {
      this.dir = turnRight(this.dir);
    } else if (action === "Grab" && this.percept && this.percept.glitter) {
      this.hasGold = true;
    } else if (action === "Shoot" && this.hasArrow) {
      this.hasArrow = false;
      this.onShot(percept.scream);
    }
    if (percept.scream) this.wumpusAlive = false;
    this.percept = percept;
    if (!this.percepts.has(key(this.x, this.y))) {
      this.percepts.set(key(this.x, this.y), percept);
    }
  }

  onShot(scream) {
    this.lastShot = { path: arrowPath(this.x, this.y, this.dir), scream };
  }

  addLog(title, details = []) {
    this.log.push({ step: this.steps, cell: label(this.x, this.y), title, details });
  }

  pose() {
    return { x: this.x, y: this.y, dir: this.dir };
  }

  // Plan to go back to [1,1] through visited squares (always safe) and climb.
  planGoHome() {
    const route = planRoute(this.pose(), [{ x: 0, y: 0 }], this.visited) || [];
    return route.concat(["Climb"]);
  }
}

// ---------------------------------------------------------------------------
// Agent A: random exploration, used as the lower bound in the experiments.
// ---------------------------------------------------------------------------
export class RandomAgent extends BaseAgent {
  // maxRandomSteps: after this many random actions the agent goes home and climbs,
  // so every game ends and the server can free it.
  constructor(options = {}) {
    super();
    this.name = "A";
    this.maxRandomSteps = options.maxRandomSteps ?? 40;
    this.random = options.random || Math.random;
  }

  nextAction() {
    if (this.plan.length > 0) return this.plan.shift();

    if (this.percept.glitter && !this.hasGold) {
      this.addLog("Glitter: grab the gold and go home");
      this.plan = this.planGoHome();
      return "Grab";
    }
    if (this.steps >= this.maxRandomSteps) {
      this.addLog("Step limit reached: go home and climb");
      this.plan = this.planGoHome();
      return this.plan.shift();
    }
    // Forward half of the time, otherwise turn left or right.
    const r = this.random();
    const action = r < 0.5 ? "Forward" : r < 0.75 ? "TurnLeft" : "TurnRight";
    this.addLog("Random action: " + action);
    return action;
  }
}

// ---------------------------------------------------------------------------
// Agents B and C: the hybrid knowledge-based agent (Figure 7.20).
// ---------------------------------------------------------------------------
export class LogicAgent extends BaseAgent {
  // options.riskThreshold: null for agent B (never take a risk), a number in [0, 1]
  //                        for agent C (largest accepted probability of death).
  // options.useCodeRules:  add the rules known only from the server code (extra).
  constructor(options = {}) {
    super();
    this.riskThreshold = options.riskThreshold ?? null;
    this.name = this.riskThreshold === null ? "B" : "C";
    this.kb = new WumpusKB({ useCodeRules: options.useCodeRules });

    // Cache of proven facts. Entailment is monotonic: once KB |= not P, adding more
    // sentences never changes it, so each fact only has to be proven once
    // (the caching idea of Section 7.7.3).
    this.noPit = new Set();      // KB |= not Px,y
    this.noWumpus = new Set();   // KB |= not Wx,y
    this.pit = new Set();        // KB |= Px,y
    this.wumpusAt = null;        // square where KB |= Wx,y, if known
    this.risks = new Map();      // last risk table computed by agent C
    this.dpllCalls = 0;          // DPLL calls made by this agent
    this.thinkTimeMs = 0;        // total time spent deciding
    this.toldSquares = new Set(); // squares whose percepts are already in the KB
    this.lastTold = [];          // clauses added in the last TELL, for the interface
  }

  start(percept) {
    super.start(percept);
    this.tellVisit();
  }

  observe(action, percept) {
    const before = key(this.x, this.y);
    super.observe(action, percept);
    // New square: TELL the KB what is perceived here.
    if (key(this.x, this.y) !== before) this.tellVisit();
  }

  // MAKE-PERCEPT-SENTENCE + TELL (Figure 7.1), only the first time in each square,
  // because breeze and stench never change.
  tellVisit() {
    const k = key(this.x, this.y);
    if (this.toldSquares.has(k)) return;
    this.toldSquares.add(k);
    const told = this.kb.tellVisit(this.x, this.y, this.percept, this.wumpusAlive);
    this.lastTold = told;
    this.addLog("TELL percepts at " + label(this.x, this.y) + ": " + perceptText(this.percept), told);
  }

  onShot(scream) {
    super.onShot(scream);
    const told = this.kb.tellArrowResult(this.lastShot.path, scream);
    this.lastTold = told;
    this.addLog(scream ? "Scream: the wumpus is dead" : "No scream: the wumpus is not in the arrow path", told);
    if (scream) this.wumpusAlive = false;
  }

  nextAction() {
    const t0 = now();
    const callsBefore = dpllStats.calls;
    const action = this.decide();
    this.dpllCalls += dpllStats.calls - callsBefore;
    this.thinkTimeMs += now() - t0;
    return action;
  }

  // The body of HYBRID-WUMPUS-AGENT (Figure 7.20), in the same order of priorities.
  decide() {
    // 1. Glitter: grab the gold, go back to [1,1] and climb out.
    if (this.percept.glitter && !this.hasGold) {
      this.plan = this.planGoHome();
      this.addLog("Glitter: grab the gold, return to [1,1] and climb");
      return "Grab";
    }

    // Continue the current plan, if any.
    if (this.plan.length > 0) return this.plan.shift();

    // Once the gold is in hand nothing else matters: go home.
    if (this.hasGold) {
      this.plan = this.planGoHome();
      return this.plan.shift();
    }

    // ASK the KB about every square that is not settled yet.
    this.updateKnowledge();
    const safe = this.safeSquares();
    const unvisited = allCells().filter((c) => !this.visited.has(key(c.x, c.y)));

    // 2. Plan a route to the closest safe square not visited yet.
    const safeUnvisited = unvisited.filter((c) => safe.has(key(c.x, c.y)));
    if (safeUnvisited.length > 0) {
      const route = planRoute(this.pose(), safeUnvisited, safe);
      if (route && route.length > 0) {
        this.plan = route;
        this.addLog("Safe squares to explore: " + safeUnvisited.map((c) => label(c.x, c.y)).join(" "),
          ["Route: " + route.join(", ")]);
        return this.plan.shift();
      }
    }

    // 3. Shoot to make a square safe. The book shoots at any possible wumpus square;
    //    here we only shoot when it can open a new square: a frontier square that is
    //    proven pit-free and only blocked by a possible wumpus.
    if (this.hasArrow && this.wumpusAlive) {
      const targets = this.frontier(unvisited).filter((c) =>
        this.noPit.has(key(c.x, c.y)) && !this.noWumpus.has(key(c.x, c.y)));
      const shot = planShot(this.pose(), targets, safe);
      if (shot) {
        this.plan = shot.actions;
        this.addLog("No safe square. Shoot toward " + label(shot.target.x, shot.target.y) +
          " (pit-free, wumpus possible)", ["Plan: " + shot.actions.join(", ")]);
        return this.plan.shift();
      }
    }

    // 4. Agent C only: take a calculated risk (replaces the "not unsafe" step of the book).
    if (this.riskThreshold !== null) {
      const choice = this.chooseRisk(unvisited, safe);
      if (choice) {
        const allowed = new Set(safe);
        allowed.add(key(choice.x, choice.y));
        const route = planRoute(this.pose(), [choice], allowed);
        if (route && route.length > 0) {
          this.plan = route;
          return this.plan.shift();
        }
      }
    }

    // 5. Nothing else to do: return to [1,1] and climb out.
    this.addLog("No safe square left: return to [1,1] and climb");
    this.plan = this.planGoHome();
    return this.plan.shift();
  }

  // ASK the KB the four questions of each unsettled square:
  //   not P?  not W?  P?  W?   (each one is one DPLL refutation proof)
  updateKnowledge() {
    const proven = [];
    for (const c of allCells()) {
      const k = key(c.x, c.y);
      if (this.visited.has(k)) {
        this.noPit.add(k);
        continue;
      }
      if (!this.noPit.has(k) && !this.pit.has(k)) {
        if (this.kb.ask(-this.kb.P(c.x, c.y))) {
          this.noPit.add(k);
          proven.push("¬P" + label(c.x, c.y));
        } else if (this.kb.ask(this.kb.P(c.x, c.y))) {
          this.pit.add(k);
          proven.push("P" + label(c.x, c.y));
        }
      }
      if (this.wumpusAlive && !this.noWumpus.has(k) && this.wumpusAt === null) {
        if (this.kb.ask(-this.kb.W(c.x, c.y))) {
          this.noWumpus.add(k);
          proven.push("¬W" + label(c.x, c.y));
        } else if (this.kb.ask(this.kb.W(c.x, c.y))) {
          this.wumpusAt = { x: c.x, y: c.y };
          proven.push("W" + label(c.x, c.y));
        }
      }
    }
    // Once the wumpus square is known, every other square is wumpus-free.
    if (this.wumpusAt) {
      for (const c of allCells()) {
        if (c.x !== this.wumpusAt.x || c.y !== this.wumpusAt.y) this.noWumpus.add(key(c.x, c.y));
      }
    }
    if (proven.length > 0) this.addLog("ASK: DPLL proved " + proven.join(" "));
  }

  // OK x,y = not P x,y and (wumpus dead or not W x,y). Visited squares are always safe.
  isSafe(k) {
    if (this.visited.has(k)) return true;
    if (!this.noPit.has(k)) return false;
    return !this.wumpusAlive || this.noWumpus.has(k);
  }

  safeSquares() {
    const safe = new Set();
    for (const c of allCells()) {
      const k = key(c.x, c.y);
      if (this.isSafe(k)) safe.add(k);
    }
    return safe;
  }

  // Squares proven deadly: a pit, or the live wumpus.
  isProvenDeadly(k) {
    if (this.pit.has(k)) return true;
    return this.wumpusAlive && this.wumpusAt !== null && key(this.wumpusAt.x, this.wumpusAt.y) === k;
  }

  // Unvisited squares next to a visited square.
  frontier(unvisited) {
    return unvisited.filter((c) => neighbors(c.x, c.y).some((n) => this.visited.has(key(n.x, n.y))));
  }

  // Agent C: compute the probability of death in each frontier square and pick the
  // lowest one if it is below the threshold.
  chooseRisk(unvisited, safe) {
    const frontier = this.frontier(unvisited).filter((c) => !safe.has(key(c.x, c.y)));
    if (frontier.length === 0) return null;
    const candidates = allCells().filter((c) => !this.noWumpus.has(key(c.x, c.y)));
    this.risks = frontierRisks(this.kb, frontier, candidates, this.wumpusAlive);

    let best = null;
    for (const c of frontier) {
      const r = this.risks.get(key(c.x, c.y));
      if (best === null || r < best.risk) best = { x: c.x, y: c.y, risk: r };
    }
    const table = frontier.map((c) => label(c.x, c.y) + " " + (100 * this.risks.get(key(c.x, c.y))).toFixed(1) + "%");
    const accept = best.risk <= this.riskThreshold;
    this.addLog("No safe square. Risk of death in the frontier (threshold " +
      (100 * this.riskThreshold).toFixed(0) + "%)", table.concat([
      accept ? "Take the risk: enter " + label(best.x, best.y) : "Every risk is too high",
    ]));
    return accept ? best : null;
  }
}

export function createAgent(name, options = {}) {
  if (name === "A") return new RandomAgent(options);
  if (name === "B") return new LogicAgent({ ...options, riskThreshold: null });
  if (name === "C") return new LogicAgent({ ...options, riskThreshold: options.riskThreshold ?? 0.35 });
  throw new Error("Unknown agent: " + name);
}

export function perceptText(p) {
  const names = [];
  if (p.stench) names.push("Stench");
  if (p.breeze) names.push("Breeze");
  if (p.glitter) names.push("Glitter");
  if (p.bump) names.push("Bump");
  if (p.scream) names.push("Scream");
  return names.length > 0 ? names.join(", ") : "nothing";
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

