/**
 * Read-only work views.
 *
 * No Markdown ticket duplication (never4ga
 * `docs/specs/details/obsidian-experience` §6). The tracker link stays the
 * canonical way to act, and this panel is a window rather than a copy:
 * nothing here is written into the vault, and nothing here can be edited.
 * The plugin does not write work items.
 *
 * The scope follows the note being read, resolved mechanically through
 * `core/scope.ts`.
 */

import { ItemView, type WorkspaceLeaf } from "obsidian";

import { ApiError } from "../core/client.js";
import type { WorkItem, WorkItemsResponse } from "../core/types.js";
import type Never4gaPlugin from "../main.js";
import { empty, note, row, section } from "./dom.js";
import { pinnedNotice, renderScopePicker } from "./scope-picker.js";

export const WORK_VIEW = "never4ga-work";

/** The lanes the panel splits items into. Everything else falls under "other". */
const OPEN_STATUSES = ["New", "In progress", "In specification", "Scheduled"];
const BLOCKED_STATUSES = ["On hold", "Blocked", "Rejected"];

export class WorkView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: Never4gaPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return WORK_VIEW;
  }

  override getDisplayText(): string {
    return "Never4gA work";
  }

  override getIcon(): string {
    return "list-checks";
  }

  override async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("n4g-view");
    container.createEl("h2", { text: "Work" });

    const client = await this.plugin.client();
    if (client === null) {
      note(section(container, "Tracker"), this.plugin.pairingProblem() ?? "Not paired.");
      return;
    }

    const scope = await this.plugin.scopeForActiveNote();
    if (scope === null) {
      await renderScopePicker(container, this.plugin, () => void this.render());
      return;
    }

    // Painted before the request, not after it. The tracker read is a network
    // round trip, and a panel that awaits before drawing anything looks
    // broken rather than busy.
    const meta = section(container, "Tracker");
    const loading = note(meta, "Reading the tracker…");

    let response: WorkItemsResponse;
    try {
      response = await client.workItems(scope.cwd);
    } catch (error) {
      loading.setText(describe(error));
      return;
    }
    loading.remove();

    row(meta, "Connection", response.connection);
    row(meta, "Project", response.project_ref);
    row(meta, "Scope", scope.cwd);
    if (scope.source === "pinned") {
      pinnedNotice(meta, this.plugin, () => void this.render());
    }
    if (response.counted !== undefined && response.counted > response.items.length) {
      // A truncated list that reported no truncation reads as "this is all of
      // it", which is the failure a count exists to prevent.
      note(
        meta,
        `Showing ${response.items.length} of ${response.counted}. Raise the limit to see the rest.`,
      );
    }

    const open = response.items.filter((item) => OPEN_STATUSES.includes(item.status));
    const blocked = response.items.filter((item) => BLOCKED_STATUSES.includes(item.status));
    const rest = response.items.filter(
      (item) => !OPEN_STATUSES.includes(item.status) && !BLOCKED_STATUSES.includes(item.status),
    );

    this.renderLane(container, "Open", open);
    this.renderLane(container, "Blocked and rejected", blocked);
    this.renderLane(container, "Recently updated", byRecency(rest).slice(0, 10));
  }

  private renderLane(container: HTMLElement, title: string, items: WorkItem[]): void {
    const body = section(container, `${title} (${items.length})`);
    if (items.length === 0) {
      empty(body, "Nothing here.");
      return;
    }
    for (const item of items) {
      const line = body.createDiv({ cls: "n4g-work-item" });
      line.createSpan({ text: `#${item.display_id || item.ref}`, cls: "n4g-work-id" });
      if (item.url) {
        // The tracker is where you act. The link is the whole affordance.
        const link = line.createEl("a", { text: item.title, cls: "n4g-link", href: item.url });
        link.setAttr("target", "_blank");
        link.setAttr("rel", "noopener");
      } else {
        line.createSpan({ text: item.title });
      }
      line.createSpan({ text: item.status, cls: "n4g-work-status" });
    }
  }
}

function byRecency(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

function describe(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
