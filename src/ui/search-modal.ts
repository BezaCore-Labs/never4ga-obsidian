/**
 * Search.
 *
 * Results open the Markdown file, because the vault stays the thing you read
 * (never4ga `docs/specs/details/obsidian-experience` §2). The modal is a way
 * in, not a reader.
 *
 * **It does not search per keystroke, and that is not a preference.** A query
 * can take seconds: the semantic lane embeds it and scores the corpus. A
 * per-keystroke modal would queue a request per character against a
 * single-worker service, most of them would exceed their timeout, and a
 * search that was working would produce failures and no results. The queue
 * would also starve the health probe enough to report the service absent
 * while it was answering.
 *
 * So: wait for a pause, keep only the newest attempt, and say what is
 * happening in the modal's own empty state rather than in notifications. A
 * Notice per failed request is the worst available place to put this, because
 * it survives the modal that caused it.
 */

import { type App, SuggestModal } from "obsidian";

import { ApiError, type Never4gaClient, UnreachableError } from "../core/client.js";
import { kindOf } from "../core/foreign.js";
import { LatestOnly } from "../core/latest-only.js";
import type { SearchResult } from "../core/types.js";
import type Never4gaPlugin from "../main.js";

/** Long enough to outlast typing, short enough not to feel stuck. */
const DEBOUNCE_MS = 400;

const MINIMUM_QUERY = 2;

export class SearchModal extends SuggestModal<SearchResult> {
  private readonly latest = new LatestOnly();
  private shown: SearchResult[] = [];
  private stale = false;

  constructor(
    app: App,
    private readonly plugin: Never4gaPlugin,
    private readonly client: Never4gaClient,
  ) {
    super(app);
    this.setPlaceholder("Search the vault through Never4gA…");
    this.emptyStateText = "Type at least two characters.";
  }

  override onClose(): void {
    // A reply still on its way must not render into a modal that is gone.
    this.latest.cancel();
    super.onClose();
  }

  override async getSuggestions(query: string): Promise<SearchResult[]> {
    const terms = query.trim();
    if (terms.length < MINIMUM_QUERY) {
      this.latest.cancel();
      this.shown = [];
      this.emptyStateText = "Type at least two characters.";
      return [];
    }

    const isCurrent = this.latest.begin();
    await pause(DEBOUNCE_MS);
    // Still typing. Keep what is on screen rather than blanking it, and let
    // the newer attempt be the one that answers.
    if (!isCurrent()) {
      return this.shown;
    }

    this.emptyStateText = "Searching… this takes a few seconds.";
    try {
      const response = await this.client.search(terms, this.plugin.settings.searchLimit);
      if (!isCurrent()) {
        return this.shown;
      }
      this.stale = response.index_is_stale;
      this.shown = response.results;
      this.emptyStateText = response.results.length === 0 ? `Nothing matched "${terms}".` : "";
      return response.results;
    } catch (error) {
      if (!isCurrent()) {
        return this.shown;
      }
      this.shown = [];
      this.emptyStateText = describe(error);
      return [];
    }
  }

  override renderSuggestion(result: SearchResult, element: HTMLElement): void {
    element.createDiv({ text: result.title, cls: "n4g-suggest-title" });
    const meta = element.createDiv({ cls: "n4g-suggest-meta" });
    // Naming the lane is the honest version of a relevance score: it says how
    // the result was found rather than asserting how good it is.
    meta.createSpan({ text: `${kindOf(result)} · ${result.retriever}` });
    if (result.heading_path.length > 0) {
      meta.createSpan({ text: ` · ${result.heading_path.join(" › ")}` });
    }
    if (result.is_stale || this.stale) {
      meta.createSpan({ text: " · index stale", cls: "n4g-suggest-stale" });
    }
    if (result.excerpt) {
      element.createDiv({ text: result.excerpt, cls: "n4g-suggest-excerpt" });
    }
  }

  override onChooseSuggestion(result: SearchResult): void {
    void this.plugin.openVaultPath(result.path);
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describe(error: unknown): string {
  if (error instanceof UnreachableError) {
    return "The service did not answer in time. Search takes a few seconds on a vault this size.";
  }
  if (error instanceof ApiError && error.code) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
