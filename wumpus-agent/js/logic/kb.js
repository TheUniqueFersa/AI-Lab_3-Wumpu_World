// kb.js
// A propositional knowledge base (KB) with the two standard operations:
//   TELL: add a sentence to the KB.
//   ASK:  ask whether a sentence follows from the KB (entailment).
//
// Reference: Russell & Norvig, 3rd ed., Section 7.1 and Figure 7.1, p. 236.
//
// Sentences are stored already in conjunctive normal form (CNF), as a list of
// clauses, because DPLL works on CNF (Section 7.5.2).

import { entails, dpllSatisfiable } from "./dpll.js";

export class KnowledgeBase {
  constructor() {
    this.clauses = [];            // list of clauses, each one an array of integer literals
    this.clauseSet = new Set();   // text form of each clause, to avoid storing duplicates
    this.symbolIds = new Map();   // symbol name -> integer id, for example "P2,1" -> 5
    this.symbolNames = [null];    // integer id -> symbol name (index 0 is not used)
  }

  // Returns the integer id of a symbol, creating it the first time it is used.
  symbol(name) {
    if (!this.symbolIds.has(name)) {
      this.symbolIds.set(name, this.symbolNames.length);
      this.symbolNames.push(name);
    }
    return this.symbolIds.get(name);
  }

  // TELL one clause, given as an array of integer literals.
  // Returns true if the clause was new.
  tell(clause) {
    const sorted = [...new Set(clause)].sort((a, b) => a - b);
    const text = sorted.join(" ");
    if (this.clauseSet.has(text)) {
      return false;
    }
    this.clauseSet.add(text);
    this.clauses.push(sorted);
    return true;
  }

  // ASK whether KB |= literal.
  ask(literal) {
    return entails(this.clauses, literal);
  }

  // Is the KB plus some extra clauses satisfiable? Used by the probability module.
  isSatisfiableWith(extraClauses) {
    return dpllSatisfiable(this.clauses.concat(extraClauses));
  }

  // Text form of a literal, for example -5 -> "¬P2,1".
  literalToString(literal) {
    const name = this.symbolNames[Math.abs(literal)];
    return literal > 0 ? name : "¬" + name;
  }

  // Text form of a clause, for example [-5, 7] -> "¬P2,1 ∨ P3,1".
  clauseToString(clause) {
    return clause.map((l) => this.literalToString(l)).join(" ∨ ");
  }

  get symbolCount() {
    return this.symbolNames.length - 1;
  }
}
