// unit-tests.mjs
// Small checks of the logic and the agents. Run with:  node tests/unit-tests.mjs

import { dpllSatisfiable, entails } from "../js/logic/dpll.js";
import { WumpusKB } from "../js/logic/wumpus-kb.js";
import { planRoute, planShot } from "../js/agent/planner.js";
import { frontierRisks } from "../js/agent/probability.js";
import { LocalSimulator } from "../js/world/simulator.js";
import { playGame } from "../js/experiments/runner.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name); }
}

console.log("DPLL");
// (A or B) and (not A or B) and (not B or C): satisfiable (B = C = true)
check("satisfiable formula", dpllSatisfiable([[1, 2], [-1, 2], [-2, 3]]) === true);
// A and not A: unsatisfiable
check("unsatisfiable formula", dpllSatisfiable([[1], [-1]]) === false);
// (A or B) and (not A or B) and (A or not B) and (not A or not B): unsatisfiable
check("unsatisfiable 2-variable formula", dpllSatisfiable([[1, 2], [-1, 2], [1, -2], [-1, -2]]) === false);
check("empty formula is satisfiable", dpllSatisfiable([]) === true);
check("modus ponens: A, A => B entails B", entails([[1], [-1, 2]], 2) === true);
check("A or B does not entail A", entails([[1, 2]], 1) === false);

console.log("Wumpus KB, example of Figure 7.3 and 7.4 of the book");
// The agent feels nothing in [1,1], then breeze in [2,1], then stench in [1,2].
const kb = new WumpusKB();
kb.tellVisit(0, 0, { breeze: false, stench: false }, true);
check("[1,1] no percept: ¬P1,2 and ¬P2,1", kb.ask(-kb.P(0, 1)) && kb.ask(-kb.P(1, 0)));
kb.tellVisit(1, 0, { breeze: true, stench: false }, true);
check("breeze in [2,1]: pit in [2,2] not decided", !kb.ask(kb.P(1, 1)) && !kb.ask(-kb.P(1, 1)));
kb.tellVisit(0, 1, { breeze: false, stench: true }, true);
check("stench in [1,2]: wumpus in [1,3] (W1,3)", kb.ask(kb.W(0, 2)));
check("no breeze in [1,2]: ¬P2,2", kb.ask(-kb.P(1, 1)));
check("so the pit is in [3,1] (P3,1)", kb.ask(kb.P(2, 0)));
check("[2,2] is safe: ¬P2,2 and ¬W2,2", kb.ask(-kb.P(1, 1)) && kb.ask(-kb.W(1, 1)));

console.log("Planner (A*)");
const all = new Set(["0,0", "1,0", "2,0", "0,1", "1,1"]);
const route = planRoute({ x: 0, y: 0, dir: 0 }, [{ x: 1, y: 1 }], all);
check("route to [2,2] has 3 actions", route !== null && route.length === 3);
check("no route through forbidden squares", planRoute({ x: 0, y: 0, dir: 0 }, [{ x: 3, y: 3 }], new Set(["0,0"])) === null);
const shot = planShot({ x: 0, y: 0, dir: 0 }, [{ x: 0, y: 2 }], new Set(["0,0"]));
check("shot north from [1,1]: TurnLeft, Shoot", shot !== null && shot.actions.join(",") === "TurnLeft,Shoot");

console.log("Probability (Section 13.6 example: breeze in [1,2] and [2,1])");
const kb2 = new WumpusKB();
kb2.tellVisit(0, 0, { breeze: false, stench: false }, true);
kb2.tellVisit(1, 0, { breeze: true, stench: false }, true);
kb2.tellVisit(0, 1, { breeze: true, stench: false }, true);
const frontier = [{ x: 0, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
const risks = frontierRisks(kb2, frontier, [], false);
// The book gives P(P1,3) = 0.31 and P(P2,2) = 0.86 (p. 503).
check("P(pit in [1,3]) about 0.31", Math.abs(risks.get("0,2") - 0.31) < 0.01);
check("P(pit in [2,2]) about 0.86", Math.abs(risks.get("1,1") - 0.86) < 0.01);

console.log("Agents on 300 simulated worlds");
const sim = new LocalSimulator();
let deathsB = 0;
let finished = 0;
for (let seed = 1; seed <= 300; seed++) {
  for (const name of ["A", "B", "C"]) {
    const row = await playGame(sim, name, { seed });
    if (row.outcome !== "limit" && row.outcome !== "unfinished") finished++;
    if (name === "B" && row.outcome === "death") deathsB++;
  }
}
check("every game ends", finished === 900);
check("agent B never dies (it only enters proven safe squares)", deathsB === 0);

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
