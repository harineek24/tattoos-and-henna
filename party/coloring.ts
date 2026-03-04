/**
 * PartyKit server for real-time coloring collaboration.
 *
 * To run locally:  npx partykit dev party/coloring.ts
 * To deploy:       npx partykit deploy party/coloring.ts
 *
 * Set VITE_PARTYKIT_HOST in .env to point to your deployed URL,
 * or leave it as localhost:1999 for local development.
 */

import type { Party, Connection, ConnectionContext } from "partykit/server";

export default class ColoringServer {
  party: Party;

  constructor(party: Party) {
    this.party = party;
  }

  onConnect(conn: Connection, _ctx: ConnectionContext) {
    // Send current canvas state to new connection if stored
    const stored = this.party.storage.get<string>("canvas");
    if (stored) {
      stored.then((data) => {
        if (data) {
          conn.send(JSON.stringify({ type: "image", dataUrl: data }));
        }
      });
    }
  }

  onMessage(message: string, sender: Connection) {
    try {
      const event = JSON.parse(message);

      // Store canvas snapshots for late-joiners
      if (event.type === "image") {
        this.party.storage.put("canvas", event.dataUrl);
      }

      // Broadcast to everyone except the sender
      for (const conn of this.party.getConnections()) {
        if (conn.id !== sender.id) {
          conn.send(message);
        }
      }
    } catch {
      // ignore malformed messages
    }
  }
}
