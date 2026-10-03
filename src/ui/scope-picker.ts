/**
 * What a panel shows when the open note answers for no workspace.
 *
 * In a Never4gA vault `home.md` sits at the root and everything in
 * `30_Knowledge/` is deliberately outside a workspace, so "this note has no
 * scope" is a normal state rather than a rare one — and a panel that stopped
 * there would be a dead end on the vault's own front page.
 *
 * The remedy stays mechanical. It does not guess which workspace was meant; it
 * lists the ones that have a mapped repository and lets a person say. That
 * choice is remembered, and any note that resolves on its own overrides it
 * again, so pinning is a fallback rather than a mode.
 */

import type Never4gaPlugin from "../main.js";
import { button, empty, note, section } from "./dom.js";

export async function renderScopePicker(
  container: HTMLElement,
  plugin: Never4gaPlugin,
  onPicked: () => void,
): Promise<void> {
  const body = section(container, "Scope");
  note(
    body,
    "The note you are reading is outside every mapped workspace, so nothing here can be " +
      "resolved from it. Pick a workspace to fall back to — a note that answers for itself " +
      "will still override this.",
  );

  const mappings = await plugin.workspaceMappings();
  if (mappings === null) {
    note(body, "The workspace list could not be read.");
    return;
  }
  const mapped = mappings.filter((mapping) => mapping.repository_root);
  if (mapped.length === 0) {
    empty(body, "No workspace on this machine has a mapped repository.");
    return;
  }

  for (const mapping of mapped) {
    const label = workspaceName(mapping.workspace_path);
    button(body, label, () => {
      void plugin.pinScope(mapping.repository_root).then(onPicked);
    });
  }
}

/** Shown when a panel is answering from the fallback rather than the note. */
export function pinnedNotice(
  container: HTMLElement,
  plugin: Never4gaPlugin,
  onCleared: () => void,
): void {
  const line = container.createDiv({ cls: "n4g-note" });
  line.createSpan({ text: "Pinned workspace — this note does not resolve to one. " });
  const clear = line.createEl("a", { text: "clear", cls: "n4g-link" });
  clear.addEventListener("click", (event) => {
    event.preventDefault();
    void plugin.pinScope(null).then(onCleared);
  });
}

/** `10_Workspaces/A/Workspaces/B/workspace.md` -> `B`. */
function workspaceName(workspacePath: string): string {
  const segments = workspacePath.split("/");
  return segments[segments.length - 2] ?? workspacePath;
}
