import { randomId } from "./vault";

export type SupportTicketCategory = "forgotten-lock" | "vault-unavailable" | "history-unavailable" | "other";
export type SupportTicketSeverity = "low" | "normal" | "high" | "critical";
export type SupportTicketStatus = "opened" | "reviewed" | "resolved";

export type SupportTicket = {
  id: string;
  number: string;
  category: SupportTicketCategory;
  description: string;
  severity: SupportTicketSeverity;
  status: SupportTicketStatus;
  cannedResponse: string;
  recoveryDirectory: string;
  networkSent: false;
  createdAt: number;
};

export const SUPPORT_DISCLOSURE = "Nothing is sent anywhere. This ticket exists only on this computer. No network request is made, no data is collected, and nobody is reading it.";

export class LocalSupportTickets {
  private readonly tickets: SupportTicket[] = [];
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  create(input: {
    category: SupportTicketCategory;
    description: string;
    severity?: SupportTicketSeverity;
    recoveryDirectory: string;
  }): SupportTicket {
    if (!input.description.trim() || input.description.length > 2_000) throw new Error("Ticket description is required and bounded");
    if (!input.recoveryDirectory.trim()) throw new Error("Recovery directory is required");
    const ticket: SupportTicket = {
      id: randomId("ticket"),
      number: `LOCAL-${this.tickets.length + 1}`,
      category: input.category,
      description: input.description.trim(),
      severity: input.severity ?? "normal",
      status: "opened",
      cannedResponse: "The local desk read the manual. Open the recovery folder and remove its data yourself if you choose.",
      recoveryDirectory: input.recoveryDirectory,
      networkSent: false,
      createdAt: this.now()
    };
    this.tickets.push(ticket);
    return { ...ticket };
  }

  list(query = ""): SupportTicket[] {
    const needle = query.trim().toLocaleLowerCase();
    return this.tickets
      .filter((ticket) => !needle || `${ticket.number} ${ticket.category} ${ticket.description}`.toLocaleLowerCase().includes(needle))
      .map((ticket) => ({ ...ticket }));
  }

  advance(id: string): SupportTicket {
    const ticket = this.require(id);
    ticket.status = ticket.status === "opened" ? "reviewed" : "resolved";
    return { ...ticket };
  }

  openRecoveryFolderIntent(id: string): { kind: "open-folder"; directory: string; destructiveAction: false } {
    const ticket = this.require(id);
    return { kind: "open-folder", directory: ticket.recoveryDirectory, destructiveAction: false };
  }

  exportRedacted(): string {
    return JSON.stringify({ version: 1, disclosure: SUPPORT_DISCLOSURE, tickets: this.list() }, null, 2);
  }

  private require(id: string): SupportTicket {
    const ticket = this.tickets.find((candidate) => candidate.id === id);
    if (!ticket) throw new Error(`Unknown support ticket: ${id}`);
    return ticket;
  }
}
