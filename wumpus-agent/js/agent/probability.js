// probability.js
// Probability that a frontier square is deadly (pit or live wumpus), used by agent C
// when logic alone cannot prove any square safe.
//
// Reference: Russell & Norvig, 3rd ed., Section 13.6 "The Wumpus World Revisited"
// (pp. 499-503). The idea of that section:
//   - Only the "frontier" squares matter: unvisited squares next to a visited one.
//     Squares further away do not affect any percept, so summing over them gives 1
//     and they can be ignored.
//   - Enumerate every assignment of pits (and the wumpus position) to the frontier,
//     keep only the ones that agree with what the agent has perceived, and weight
//     each one by its prior probability. Each pit appears with probability 0.2
//     (public rule from the course slides) and the wumpus is uniform over the squares.
//
// "Agrees with what the agent has perceived" is checked with DPLL: the assignment
// is consistent iff  KB and assignment  is satisfiable. So this is still logical
// inference; probability only ranks the squares that logic could not decide.

export const PIT_PROBABILITY = 0.2;

// kb:          WumpusKB of the agent
// frontier:    array of { x, y } (unvisited squares next to visited ones)
// wumpusCandidates: array of { x, y } where the wumpus may still be (KB does not
//              entail not W), only used while the wumpus is alive
// wumpusAlive: boolean
// Returns a Map from "x,y" to the probability of death in that square.
export function frontierRisks(kb, frontier, wumpusCandidates, wumpusAlive) {
  const total = { weight: 0 };
  const deadly = new Map(frontier.map((c) => [c.x + "," + c.y, 0]));
  const n = frontier.length;

  // Each number `mask` from 0 to 2^n - 1 is one pit assignment of the frontier:
  // bit i set means "there is a pit in frontier[i]".
  for (let mask = 0; mask < 1 << n; mask++) {
    const assignment = [];
    let pitWeight = 1;
    for (let i = 0; i < n; i++) {
      const hasPit = (mask >> i) & 1;
      const p = kb.P(frontier[i].x, frontier[i].y);
      assignment.push([hasPit ? p : -p]);
      pitWeight *= hasPit ? PIT_PROBABILITY : 1 - PIT_PROBABILITY;
    }

    // Skip pit assignments that already contradict the KB.
    if (!kb.isSatisfiableWith(assignment)) continue;

    if (!wumpusAlive) {
      // The wumpus cannot kill anymore: only pits matter.
      addMass(total, deadly, frontier, mask, null, pitWeight);
      continue;
    }

    // Try every square where the wumpus may be. All of them have the same prior,
    // so each consistent position adds the same weight.
    for (const w of wumpusCandidates) {
      const withWumpus = assignment.concat([[kb.W(w.x, w.y)]]);
      if (!kb.isSatisfiableWith(withWumpus)) continue;
      let weight = pitWeight;
      // With the extra code rule, a pit cannot be in the wumpus square, so for that
      // square the prior of "no pit" is 1 instead of 0.8.
      const i = frontier.findIndex((c) => c.x === w.x && c.y === w.y);
      if (kb.useCodeRules && i >= 0) weight /= 1 - PIT_PROBABILITY;
      addMass(total, deadly, frontier, mask, w, weight);
    }
  }

  const risks = new Map();
  for (const [k, mass] of deadly) {
    risks.set(k, total.weight > 0 ? mass / total.weight : 1);
  }
  return risks;
}

// Adds the weight of one consistent world to the total, and to every frontier
// square that is deadly in that world (it has a pit or the wumpus).
function addMass(total, deadly, frontier, mask, wumpus, weight) {
  total.weight += weight;
  for (let i = 0; i < frontier.length; i++) {
    const c = frontier[i];
    const hasPit = (mask >> i) & 1;
    const hasWumpus = wumpus !== null && wumpus.x === c.x && wumpus.y === c.y;
    if (hasPit || hasWumpus) {
      const k = c.x + "," + c.y;
      deadly.set(k, deadly.get(k) + weight);
    }
  }
}
