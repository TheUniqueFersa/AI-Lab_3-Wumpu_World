// wumpus-kb.js
// The knowledge base of the Wumpus World ("wumpus physics").
//
// Reference: Russell & Norvig, 3rd ed., Section 7.4.3 (p. 246) and Section 7.7.1 (p. 265).
//
// Proposition symbols (book numbering, the server cell (0,0) is [1,1]):
//   Px,y  there is a pit in square [x,y]
//   Wx,y  the wumpus is in square [x,y] (dead or alive)
//   Bx,y  square [x,y] is breezy
//   Sx,y  square [x,y] is smelly
//
// All of these symbols are atemporal: they never change during a game.
// The book also uses temporal symbols (fluents) for the agent location, the
// orientation and the arrow (Section 7.7.1). In this program those values are
// known with certainty from the actions the agent sends, so they are kept as
// ordinary variables in the agent instead of logic sentences. This is the
// "hybrid" design of Section 7.7.2: logic for what is uncertain, code for the rest.

import { KnowledgeBase } from "./kb.js";
import { allCells, neighbors } from "../geometry.js";

export class WumpusKB extends KnowledgeBase {
  // options.useCodeRules: also add rules that are only known by reading the
  // server source code (game.go). Used only for the "extra" experiments.
  constructor(options = {}) {
    super();
    this.useCodeRules = Boolean(options.useCodeRules);
    this.axiomCount = 0;
    this.addInitialAxioms();
    this.axiomCount = this.clauses.length;
  }

  // Integer ids of the four kinds of symbols.
  P(x, y) { return this.symbol("P" + (x + 1) + "," + (y + 1)); }
  W(x, y) { return this.symbol("W" + (x + 1) + "," + (y + 1)); }
  B(x, y) { return this.symbol("B" + (x + 1) + "," + (y + 1)); }
  S(x, y) { return this.symbol("S" + (x + 1) + "," + (y + 1)); }

  addInitialAxioms() {
    // Create the P and W symbols in a fixed order so their ids are predictable.
    for (const c of allCells()) {
      this.P(c.x, c.y);
      this.W(c.x, c.y);
    }

    // The starting square has no pit and no wumpus: not P1,1 and not W1,1.
    this.tell([-this.P(0, 0)]);
    this.tell([-this.W(0, 0)]);

    // There is at least one wumpus: W1,1 or W1,2 or ... or W4,4.
    this.tell(allCells().map((c) => this.W(c.x, c.y)));

    // There is at most one wumpus: for every pair of squares, at least one has no wumpus.
    const cells = allCells();
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        this.tell([-this.W(cells[i].x, cells[i].y), -this.W(cells[j].x, cells[j].y)]);
      }
    }

    // Extra rule taken from game.go (not in the public rules): the server never
    // places a pit in the wumpus square. In CNF: not W or not P, for every square.
    if (this.useCodeRules) {
      for (const c of cells) {
        this.tell([-this.W(c.x, c.y), -this.P(c.x, c.y)]);
      }
    }
  }

  // TELL what the agent learns the first time it stands on square (x, y).
  // Returns the new clauses as text, so the interface can show them.
  tellVisit(x, y, percept, wumpusAlive) {
    const told = [];
    const add = (clause) => {
      if (this.tell(clause)) told.push(this.clauseToString(clause));
    };

    // The agent is alive here, so this square has no pit.
    add([-this.P(x, y)]);
    // If the wumpus is still alive, it is not here either.
    // (After the wumpus dies the agent can walk into its square, so we cannot say this.)
    if (wumpusAlive) {
      add([-this.W(x, y)]);
    }

    // Breeze rule for this square:  Bx,y <=> (P of every neighbor)
    const pits = neighbors(x, y).map((n) => this.P(n.x, n.y));
    for (const clause of biconditionalToCnf(this.B(x, y), pits)) add(clause);
    // Stench rule for this square:  Sx,y <=> (W of every neighbor)
    const wumpus = neighbors(x, y).map((n) => this.W(n.x, n.y));
    for (const clause of biconditionalToCnf(this.S(x, y), wumpus)) add(clause);

    // Percept sentences: Bx,y or not Bx,y, and Sx,y or not Sx,y.
    add([percept.breeze ? this.B(x, y) : -this.B(x, y)]);
    add([percept.stench ? this.S(x, y) : -this.S(x, y)]);
    return told;
  }

  // TELL the result of shooting the arrow along the squares in its path.
  //   scream:    the wumpus was in one of those squares  ->  (W of path squares)
  //   no scream: the wumpus is in none of them            ->  not W for each square
  tellArrowResult(pathCells, scream) {
    const told = [];
    if (scream) {
      const clause = pathCells.map((c) => this.W(c.x, c.y));
      if (this.tell(clause)) told.push(this.clauseToString(clause));
    } else {
      for (const c of pathCells) {
        const clause = [-this.W(c.x, c.y)];
        if (this.tell(clause)) told.push(this.clauseToString(clause));
      }
    }
    return told;
  }
}

// Converts  A <=> (L1 or L2 or ... or Lk)  into CNF, following the steps of
// Section 7.5.2 (p. 253) for B1,1 <=> (P1,2 or P2,1):
//   (not A or L1 or ... or Lk)   from  A => (L1 or ... or Lk)
//   (not Li or A) for each i      from  (L1 or ... or Lk) => A
export function biconditionalToCnf(a, literals) {
  const clauses = [[-a, ...literals]];
  for (const l of literals) {
    clauses.push([-l, a]);
  }
  return clauses;
}
