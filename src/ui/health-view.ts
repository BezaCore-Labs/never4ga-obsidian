/**
 * Health, index status, the two runtime actions, and the findings ledger.
 *
 * Everything here is derived or external state; nothing is written into
 * Markdown, which is the constraint the whole plugin sits under (never4ga
 * `docs/specs/details/obsidian-experience` §2, §7, §9).
 *
 * The panel's first duty is the portability test: with the service killed it
 * must say so plainly and leave a fully useful Markdown vault behind, rather
 * than showing a spinner or an empty panel that reads as breakage.
 */

import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";

import { ApiError } from "../core/client.js";
import { type Presence, probe } from "../core/presence.js";
import type { FindingsResponse, IndexStatus } from "../core/types.js";
import type Never4gaPlugin from "../main.js";
import { button, empty, note, row, section, when } from "./dom.js";

export const HEALTH_VIEW = "never4ga-health";

export class HealthView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: Never4gaPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return HEALTH_VIEW;
  }

  override getDisplayText(): string {
    return "Never4gA health";
  }

  override getIcon(): string {
    return "activity";
  }

  override async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("n4g-view");
    container.createEl("h2", { text: "Never4gA" });

    // The probe is a round trip. Say the panel is working before it starts,
    // or an answering service looks like a blank panel for a second.
    const opening = section(container, "Service");
    note(opening, "Checking the service…");

    const client = await this.plugin.client();
    opening.parentElement?.remove();
    if (client === null) {
      const body = section(container, "Service");
      note(body, this.plugin.pairingProblem() ?? "Not paired.");
      note(
        body,
        "The vault is a plain Markdown vault and stays fully usable. Nothing here is canonical.",
      );
      button(body, "Try again", () => void this.render());
      return;
    }

    const presence = await probe(client, this.plugin.settings.expectedBuild || null);
    this.renderService(container, presence);

    if (presence.state !== "answering" && presence.state !== "mismatched") {
      button(section(container, ""), "Try again", () => void this.render());
      return;
    }

    await this.renderIndex(container);
    this.renderActions(container);
    await this.renderFindings(container);
  }

  private renderService(container: HTMLElement, presence: Presence): void {
    const body = section(container, "Service");
    row(body, "State", presence.state);
    note(body, presence.detail);
    if (presence.health) {
      row(body, "Version", presence.health.version);
      row(body, "Build", presence.health.build);
      row(body, "Uptime", `${Math.round(presence.health.uptime_seconds)}s`);
    }
    if (!this.plugin.settings.expectedBuild) {
      note(
        body,
        "The build is shown but not checked: the plugin cannot compute the on-disk fingerprint. " +
          "`never4ga status` can, or pin one in settings.",
      );
    }
  }

  private async renderIndex(container: HTMLElement): Promise<void> {
    const body = section(container, "Index");
    let status: IndexStatus;
    try {
      status = await this.plugin.require().indexStatus();
    } catch (error) {
      note(body, describe(error));
      return;
    }
    row(body, "Built", status.built ? "yes" : "no");
    row(body, "Documents", String(status.indexed_documents));
    row(body, "Last indexed", when(status.last_indexed_at));
    row(body, "Stale", status.stale ? "yes — a reconcile would move it" : "no");
  }

  /**
   * Exactly two actions, both on the derived index.
   *
   * A finding-dismissal button is deliberately absent: nothing in the service
   * acts on a dismissal, so a button that wrote one would promise an effect
   * that never happens.
   */
  private renderActions(container: HTMLElement): void {
    const body = section(container, "Actions");
    button(body, "Reconcile now", () => {
      void this.run("Reconcile", () => this.plugin.require().reconcile());
    });
    button(body, "Rebuild index", () => {
      // Behind a confirm because it discards and re-derives everything. The
      // index is derived and rebuildable, so this is slow rather than
      // dangerous -- but slow without warning reads as a hang.
      if (
        window.confirm(
          "Rebuild the whole index? Everything is re-derived from the vault; nothing canonical is lost, but it takes minutes on a large vault.",
        )
      ) {
        void this.run("Rebuild", () => this.plugin.require().rebuild());
      }
    });
  }

  private async run(label: string, action: () => Promise<unknown>): Promise<void> {
    new Notice(`${label} started…`);
    try {
      await action();
      new Notice(`${label} finished.`);
    } catch (error) {
      new Notice(`${label} failed: ${describe(error)}`);
    }
    await this.render();
  }

  private async renderFindings(container: HTMLElement): Promise<void> {
    const body = section(container, "Findings");
    let response: FindingsResponse;
    try {
      response = await this.plugin.require().findings();
    } catch (error) {
      note(body, describe(error));
      return;
    }
    if (!response.available) {
      note(body, "This vault keeps no findings ledger.");
      return;
    }
    if (response.findings.length === 0) {
      empty(body, "No open findings.");
      return;
    }
    for (const finding of response.findings) {
      const item = body.createDiv({ cls: "n4g-finding" });
      item.createDiv({ text: `${finding.severity} · ${finding.rule}`, cls: "n4g-finding-rule" });
      item.createDiv({ text: finding.message, cls: "n4g-finding-message" });
      if (finding.path) {
        // Linking the finding to the file it names is the whole value of the
        // panel: a code and a message with no way to reach the document is a
        // report you have to go and act on somewhere else.
        const link = item.createEl("a", { text: finding.path, cls: "n4g-link" });
        link.addEventListener("click", (event) => {
          event.preventDefault();
          void this.plugin.openVaultPath(finding.path as string);
        });
      }
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
