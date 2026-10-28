// config.js
// Server addresses used by the web page and by tests/run-experiments.mjs.
// To change an address or the port, edit it here; nothing else needs to change.
//
// "render" is the class server: the MAIN tests of the report must use it, because it
// is the same server every other team uses.
// "localhost" is our own copy of the Go server (with the CORS change) running on this
// computer; useful for the live demo and for debugging.

export const SERVERS = {
  render: {
    name: "Class server (Render) - main tests",
    url: "https://wumpus-world-cipl.onrender.com",
  },
  localhost: {
    name: "Our Go server on this computer (localhost:8080)",
    url: "http://localhost:8080",
  },
};

// Option selected when the page opens.
export const DEFAULT_SERVER = "render";

// EXTRA: the in-page simulator (same rules as game.go, worlds chosen by seed).
export const SIMULATOR = "simulator";
export const SIMULATOR_NAME = "Local simulator, no server (extra)";
