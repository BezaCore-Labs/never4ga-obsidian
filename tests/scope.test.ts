/** A note finds its repository by path, mechanically. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCwd, resolveRepository } from "../src/core/scope.js";
import type { WorkspaceMapping } from "../src/core/types.js";

const MAPPINGS: WorkspaceMapping[] = [
  {
    workspace_id: "parent",
    workspace_path: "10_Workspaces/Harbor/workspace.md",
    repository_root: "/home/alex/Projects/harbor",
    parent_id: null,
  },
  {
    workspace_id: "child",
    workspace_path: "10_Workspaces/Harbor/Workspaces/Lighthouse/workspace.md",
    repository_root: "/home/alex/Projects/lighthouse",
    parent_id: "parent",
  },
  {
    workspace_id: "lookalike",
    workspace_path: "10_Workspaces/Harbor/Workspaces/Lighthouse-Docs/workspace.md",
    repository_root: "/home/alex/Projects/lighthouse-docs",
    parent_id: "parent",
  },
  {
    workspace_id: "vault-only",
    workspace_path: "10_Workspaces/Education/workspace.md",
    repository_root: null,
    parent_id: null,
  },
];

test("the nearest enclosing workspace wins over its parent", () => {
  const resolved = resolveRepository(
    "10_Workspaces/Harbor/Workspaces/Lighthouse/Logs/2026/a.md",
    MAPPINGS,
  );
  assert.equal(resolved?.workspaceId, "child");
  assert.equal(resolved?.repositoryRoot, "/home/alex/Projects/lighthouse");
});

test("a similarly named sibling is not a prefix match", () => {
  // `startsWith` alone would file a Lighthouse-Docs note under Lighthouse.
  const resolved = resolveRepository(
    "10_Workspaces/Harbor/Workspaces/Lighthouse-Docs/note.md",
    MAPPINGS,
  );
  assert.equal(resolved?.workspaceId, "lookalike");
});

test("a note outside every workspace resolves to nothing", () => {
  assert.equal(resolveRepository("30_Knowledge/Notes/python.md", MAPPINGS), null);
  assert.equal(resolveCwd("30_Knowledge/Notes/python.md", MAPPINGS), null);
});

test("the workspace manifest itself belongs to its own workspace", () => {
  const resolved = resolveRepository(
    "10_Workspaces/Harbor/Workspaces/Lighthouse/workspace.md",
    MAPPINGS,
  );
  assert.equal(resolved?.workspaceId, "child");
});

test("a vault-only workspace falls outward to the nearest mapped ancestor", () => {
  // Not every workspace has a repository, and that is not a failure. A
  // documentation-only child still shows its parent's work.
  const cwd = resolveCwd("10_Workspaces/Harbor/Notes/a.md", MAPPINGS);
  assert.equal(cwd, "/home/alex/Projects/harbor");
});

test("an unmapped workspace with no mapped ancestor has no cwd", () => {
  assert.equal(resolveCwd("10_Workspaces/Education/Programs/a.md", MAPPINGS), null);
});

test("a leading slash or backslash does not defeat the match", () => {
  const resolved = resolveRepository(
    "\\10_Workspaces\\Harbor\\Workspaces\\Lighthouse\\Logs\\a.md",
    MAPPINGS,
  );
  assert.equal(resolved?.workspaceId, "child");
});
