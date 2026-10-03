/**
 * The context inspector.
 *
 * It makes provenance visible. Every item in a Context Pack carries an
 * acquisition reason (never4ga `docs/specs/core/07` §12) — which stage put it
 * there, under which code, and why — which other surfaces show only as JSON.
 * Rendering it beside the item is what turns "mechanical-first" from
 * a claim into something a person can check.
 *
 * It runs the pack for the scope of the note being read. `startup` opens a
 * session, so the inspector defaults to `focus`, which does not: inspecting
 * context should not leave session records behind as a side effect of looking.
 */

import { ItemView, type WorkspaceLeaf } from "obsidian";

import { ApiError } from "../core/client.js";
import { isAdopted, NOT_ADOPTED } from "../core/foreign.js";
import type { ContextItem, ContextPack, ContextSignal } from "../core/types.js";
import type Never4gaPlugin from "../main.js";
import { button, empty, note, row, section } from "./dom.js";
import { pinnedNotice, renderScopePicker } from "./scope-picker.js";

export const CONTEXT_VIEW = "never4ga-context";

type Depth = "focus" | "deep";

export class ContextView extends ItemView {
  private depth: Depth = "focus";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: Never4gaPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return CONTEXT_VIEW;
  }

  override getDisplayText(): string {
    return "Never4gA context";
  }

  override getIcon(): string {
    return "search-code";
  }

  override async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("n4g-view");
    container.createEl("h2", { text: "Context" });

    const terms = this.plugin.termsFromActiveNote();
    const controls = section(container, "");
    for (const depth of ["focus", "deep"] as Depth[]) {
      const control = button(controls, depth === this.depth ? `▸ ${depth}` : depth, () => {
        this.depth = depth;
        void this.render();
      });
      control.toggleClass("n4g-button-active", depth === this.depth);
    }

    if (this.depth === "focus" && terms.length > 0) {
      note(controls, `Focused on: ${terms.join(" ")}`);
    }

    const client = await this.plugin.client();
    if (client === null) {
      note(section(container, "Pack"), this.plugin.pairingProblem() ?? "Not paired.");
      return;
    }

    const scope = await this.plugin.scopeForActiveNote();
    if (scope === null) {
      await renderScopePicker(container, this.plugin, () => void this.render());
      return;
    }

    // Assembling a pack is seconds of work, so say so before starting it. A
    // panel that awaited in silence would render as bare buttons, which reads
    // as nothing happening rather than as something taking a while.
    const pending = section(container, "Pack");
    note(
      pending,
      this.depth === "deep"
        ? "Assembling a deep pack… this takes a few seconds."
        : "Assembling the pack…",
    );

    let pack: ContextPack;
    try {
      pack = await client.context(this.depth, {
        cwd: scope.cwd,
        // `focus` is lexical and returns nothing without terms, so the note
        // being read supplies them: inspecting a note asks what context a
        // session working on *this* subject would be given. `deep` needs none.
        terms: this.depth === "focus" ? terms : [],
        client: "obsidian",
      });
    } catch (error) {
      pending.empty();
      note(pending, describe(error));
      return;
    }
    // Replace the placeholder rather than appending beneath it.
    pending.parentElement?.remove();

    if (scope.source === "pinned") {
      pinnedNotice(container, this.plugin, () => void this.render());
    }
    this.renderScope(container, pack);
    this.renderItems(container, pack.items);
    this.renderSignals(container, pack.signals);
  }

  private renderScope(container: HTMLElement, pack: ContextPack): void {
    const body = section(container, "Scope and budget");
    row(body, "Workspace", pack.scope.workspace_path);
    row(body, "Resolved by", `${pack.scope.reason.code} — ${pack.scope.reason.detail}`);
    row(body, "Items", `${pack.usage.items} (${pack.usage.dropped_items} dropped)`);
    row(body, "Characters", String(pack.usage.characters));
    row(body, "Estimated tokens", String(pack.usage.estimated_tokens));
    if (pack.llm_stages.length === 0) {
      // The defining claim of the system, stated where it can be checked.
      note(body, "No LLM stage ran. Every item below was acquired mechanically.");
    } else {
      row(body, "LLM stages", pack.llm_stages.join(", "));
    }
    if (pack.degraded_providers.length > 0) {
      note(body, `Degraded providers: ${pack.degraded_providers.join(", ")}`);
    }
  }

  private renderItems(container: HTMLElement, items: ContextItem[]): void {
    const body = section(container, `Items (${items.length})`);
    if (items.length === 0) {
      empty(body, "The pack is empty.");
      return;
    }
    for (const item of items) {
      const entry = body.createDiv({ cls: "n4g-pack-item" });
      const head = entry.createDiv({ cls: "n4g-pack-head" });
      head.createSpan({ text: item.category, cls: "n4g-pack-category" });
      const link = head.createEl("a", { text: item.title, cls: "n4g-link" });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void this.plugin.openVaultPath(item.path);
      });
      if (!isAdopted(item)) {
        head.createSpan({ text: NOT_ADOPTED, cls: "n4g-pack-reference" });
      }
      if (item.is_reference) {
        head.createSpan({ text: "reference", cls: "n4g-pack-reference" });
      }
      // The reason, always, beside the item it explains.
      entry.createDiv({
        text: `${item.reason.stage} · ${item.reason.code} — ${item.reason.detail}`,
        cls: "n4g-pack-reason",
      });
    }
  }

  private renderSignals(container: HTMLElement, signals: ContextSignal[]): void {
    const body = section(container, `Signals (${signals.length})`);
    if (signals.length === 0) {
      empty(body, "No operational signals.");
      return;
    }
    for (const signal of signals) {
      row(body, `${signal.provider}.${signal.kind}`, format(signal.value));
    }
  }
}

function format(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function describe(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
