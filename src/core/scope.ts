/**
 * Which repository a note belongs to.
 *
 * The scope-dependent endpoints (`/v1/work/items`, `/v1/context/*`) take a
 * `cwd` and resolve it the way the CLI does: path, Git root, then the
 * repository-to-workspace registry. A path inside the vault does not resolve
 * — the vault is one Git repository and is not itself mapped to a workspace —
 * so handing them the note's own folder returns `scope_unresolved` every time.
 *
 * What does work is the mapping in the other direction. `/v1/workspaces`
 * reports, for every workspace, the `workspace_path` inside the vault and the
 * `repository_root` on this machine. So the note being read names its
 * workspace by where it sits, and the workspace names the directory the API
 * will accept.
 *
 * This is deliberately mechanical: a longest-prefix match over paths, no
 * inference, no asking a model which project a note is about.
 */

import type { WorkspaceMapping } from "./types.js";

export interface ResolvedRepository {
  workspaceId: string;
  /** The workspace directory inside the vault, without `workspace.md`. */
  workspaceDirectory: string;
  /** The `cwd` the API will accept, or null when the workspace has no repository. */
  repositoryRoot: string | null;
}

/**
 * The workspace whose directory encloses this vault-relative path.
 *
 * Longest prefix wins, which is what makes a child workspace beat its parent:
 * `.../Harbor/Workspaces/Lighthouse/Logs/x.md` belongs to Lighthouse, not
 * to Harbor, and both are legitimate prefixes.
 */
export function resolveRepository(
  notePath: string,
  mappings: readonly WorkspaceMapping[],
): ResolvedRepository | null {
  const note = normalise(notePath);
  let best: ResolvedRepository | null = null;
  let bestLength = -1;

  for (const mapping of mappings) {
    const directory = workspaceDirectory(mapping.workspace_path);
    if (directory === "" || !encloses(directory, note)) {
      continue;
    }
    if (directory.length > bestLength) {
      bestLength = directory.length;
      best = {
        workspaceId: mapping.workspace_id,
        workspaceDirectory: directory,
        repositoryRoot: mapping.repository_root,
      };
    }
  }
  return best;
}

/**
 * The nearest enclosing workspace that actually has a repository.
 *
 * A workspace with no mapped repository is not a failure to report as one:
 * plenty of workspaces are vault-only. Walking outward to the nearest mapped
 * ancestor is workspace inheritance (never4ga `docs/specs/core/03`) applied
 * to a path, and it is what makes a note in a documentation-only child still
 * show its parent's work items.
 */
export function resolveCwd(
  notePath: string,
  mappings: readonly WorkspaceMapping[],
): string | null {
  const note = normalise(notePath);
  const candidates = mappings
    .map((mapping) => ({ mapping, directory: workspaceDirectory(mapping.workspace_path) }))
    .filter(({ directory }) => directory !== "" && encloses(directory, note))
    .sort((a, b) => b.directory.length - a.directory.length);

  for (const { mapping } of candidates) {
    if (mapping.repository_root) {
      return mapping.repository_root;
    }
  }
  return null;
}

/** `A/B/workspace.md` -> `A/B`. A manifest names its own directory. */
function workspaceDirectory(workspacePath: string): string {
  const path = normalise(workspacePath);
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/**
 * Whether `directory` contains `path`, on segment boundaries.
 *
 * A plain `startsWith` would put `10_Workspaces/Lighthouse-Docs/note.md`
 * inside `10_Workspaces/Lighthouse`, which is a different workspace with a
 * similar name.
 */
function encloses(directory: string, path: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function normalise(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
