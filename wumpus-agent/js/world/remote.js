// remote.js
// Client for the Wumpus World server API (README.md of the server).
//
//   POST /game/new                 -> { gameId, perception }
//   POST /game/{gameId}/action     body { "action": "Forward" | "TurnLeft" | "TurnRight"
//                                          | "Grab" | "Shoot" | "Climb" }
//                                  -> perception
//
// The local simulator (simulator.js) has the same two methods, so the agents and
// the interface do not need to know which one they are using.

import { SERVERS, DEFAULT_SERVER } from "../config.js";

export const DEFAULT_SERVER_URL = SERVERS[DEFAULT_SERVER].url;

export class RemoteServer {
  // timeoutMs: the free Render plan sleeps after 15 minutes without requests and
  // takes about a minute to wake up, so the first request may be slow.
  constructor(baseUrl = DEFAULT_SERVER_URL, timeoutMs = 90000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.kind = "remote";
  }

  async newGame() {
    return this.post("/game/new", null);
  }

  async action(gameId, action) {
    return this.post("/game/" + gameId + "/action", { action });
  }

  async post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const options = { method: "POST", signal: controller.signal };
      if (body !== null) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(this.baseUrl + path, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error("Server answered " + response.status + ": " + text.trim());
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
