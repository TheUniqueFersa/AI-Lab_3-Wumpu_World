// dpll.js
// DPLL (Davis-Putnam-Logemann-Loveland) satisfiability algorithm.
//
// References:
//   - Russell & Norvig, "Artificial Intelligence: A Modern Approach", 3rd ed.,
//     Section 7.6.1, Figure 7.17, p. 261.
//   - Course slides "04 Reasoning", DPLL Algorithm (slide 46).
//
// The structure follows the version in the course slides, which works by
// simplifying the formula (phi(l)) instead of carrying a partial model.
// Both versions are equivalent: assigning a literal l = true is the same as
// removing every clause that contains l and deleting -l from the rest.
//
// Representation (same idea as the DIMACS format used by SAT solvers):
//   - A proposition symbol is a positive integer, for example 7.
//   - A literal is a symbol (7) or its negation (-7).
//   - A clause is an array of literals, read as a disjunction: [7, -3] is (S7 v -S3).
//   - A CNF formula is an array of clauses, read as a conjunction.

// Counter of recursive calls. Used by the experiments to measure the cost of inference.
export const dpllStats = { calls: 0 };

export function resetDpllStats() {
  dpllStats.calls = 0;
}

// Returns true if the CNF formula has at least one model.
export function dpllSatisfiable(clauses) {
  return dpll(clauses);
}

// Returns true if KB entails the literal alpha, that is, KB |= alpha.
// Proof by refutation (Section 7.5): KB |= alpha  iff  (KB and not alpha) is unsatisfiable.
export function entails(kbClauses, alphaLiteral) {
  const query = kbClauses.concat([[-alphaLiteral]]);
  return !dpllSatisfiable(query);
}

function dpll(clauses) {
  dpllStats.calls++;

  // Early termination 1: no clauses left, every clause is already true.
  if (clauses.length === 0) {
    return true;
  }

  // Early termination 2: an empty clause can never be true.
  for (const clause of clauses) {
    if (clause.length === 0) {
      return false;
    }
  }

  // Unit clause heuristic: a clause with one literal forces its value.
  const unit = findUnitClause(clauses);
  if (unit !== null) {
    return dpll(simplify(clauses, unit));
  }

  // Pure symbol heuristic: a symbol that always appears with the same sign
  // can be set to make all its literals true without making any clause false.
  const pure = findPureLiteral(clauses);
  if (pure !== null) {
    return dpll(simplify(clauses, pure));
  }

  // Branching: pick a symbol and try both values (depth-first backtracking).
  const symbol = Math.abs(clauses[0][0]);
  if (dpll(simplify(clauses, symbol))) {
    return true;
  }
  return dpll(simplify(clauses, -symbol));
}

// phi(l): the formula that results from making literal l true.
//   - Clauses containing l are satisfied, so they are removed.
//   - The opposite literal -l is false, so it is deleted from the other clauses.
export function simplify(clauses, literal) {
  const result = [];
  for (const clause of clauses) {
    if (clause.includes(literal)) {
      continue;
    }
    if (clause.includes(-literal)) {
      result.push(clause.filter((l) => l !== -literal));
    } else {
      result.push(clause);
    }
  }
  return result;
}

// Returns the literal of the first clause that has exactly one literal, or null.
function findUnitClause(clauses) {
  for (const clause of clauses) {
    if (clause.length === 1) {
      return clause[0];
    }
  }
  return null;
}

// Returns a literal whose symbol appears with only one sign, or null.
function findPureLiteral(clauses) {
  // For each symbol, store which signs were seen: 1 = positive, 2 = negative, 3 = both.
  const signs = new Map();
  for (const clause of clauses) {
    for (const literal of clause) {
      const symbol = Math.abs(literal);
      const mark = literal > 0 ? 1 : 2;
      signs.set(symbol, (signs.get(symbol) || 0) | mark);
    }
  }
  for (const [symbol, mark] of signs) {
    if (mark === 1) return symbol;
    if (mark === 2) return -symbol;
  }
  return null;
}
