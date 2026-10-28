// servers.js
// Builds the object that plays the games for one option of the "World" menu.

import { SERVERS, SIMULATOR, SIMULATOR_NAME } from "../config.js";
import { RemoteServer } from "./remote.js";
import { LocalSimulator } from "./simulator.js";

// Returns a RemoteServer for an entry of SERVERS, or a LocalSimulator.
export function createServer(choice) {
  if (choice === SIMULATOR) return new LocalSimulator();
  const entry = SERVERS[choice];
  if (!entry) throw new Error("Unknown server option: " + choice);
  return new RemoteServer(entry.url);
}

// Fills a <select> with the servers of config.js plus the simulator.
export function fillServerSelect(select) {
  select.innerHTML = "";
  for (const [id, entry] of Object.entries(SERVERS)) {
    select.add(new Option(entry.name, id));
  }
  select.add(new Option(SIMULATOR_NAME, SIMULATOR));
}
