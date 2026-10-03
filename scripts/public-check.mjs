/**
 * Keep what is private, and what is internal, out of what is pushed.
 *
 * This repository is public, so anything pushed is published: files, commit
 * messages, branch names. Two rules, checked here:
 *
 * 1. Comments and documentation explain the code to a stranger. They do not
 *    cite records a reader cannot open -- decision records, open questions,
 *    work items, milestones -- and cite a public specification section
 *    instead. A reference quoted as code, like `ADR-0002` in an example, is
 *    allowed. This needs nothing but the tree, so it runs everywhere,
 *    including CI.
 * 2. Nothing on the maintainer's private list is published. The list lives in
 *    the maintainer's private vault, never here: a denylist in a public tree
 *    publishes its own list. Where there is no vault, as for a contributor,
 *    there is no list and only rule 1 runs. Where the vault resolves but no
 *    list is found, that is an error rather than a quiet pass.
 *
 *     node scripts/public-check.mjs             # every tracked file, as it is now
 *     node scripts/public-check.mjs --pre-push  # .githooks/pre-push runs this
 *
 * Before a push it reads every commit about to leave this machine: each
 * one's message and each line it adds. A marker added in one commit and
 * removed in the next is still published, so the removal does not excuse the
 * addition.
 *
 * The list is the file named by `NEVER4GA_PRIVATE_MARKERS`, else the nearest
 * `private-markers.txt` in the workspace this repository resolves to or one
 * of its parent workspaces.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARKERS_VARIABLE = "NEVER4GA_PRIVATE_MARKERS";
const MARKERS_FILE = "private-markers.txt";
const NO_COMMIT = "0".repeat(40);

/** A reference to a record that is not public. */
const INTERNAL_REFERENCE =
  /\bADR-\d{4}\b|\bQ-\d{3}\b|\bwork items? \d+|\bMilestone \d+[a-z]?\b|\(\d{3,4}\)/gi;

/** Inline code, which quotes an example rather than citing a record. */
const CODE_SPAN = /``[^`]*``|`[^`]*`/g;

/** A fenced code block in Markdown, which is an example too. */
const CODE_FENCE = /^```[\s\S]*?^```/gm;

function git(...args) {
  return execFileSync("git", args, { cwd: REPOSITORY, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The private markers, or `null` where there is no vault to read them from. */
function loadMarkers() {
  let path = process.env[MARKERS_VARIABLE];
  if (!path) {
    const workspace = findWorkspace();
    if (workspace === null) {
      return null;
    }
    path = nearestMarkers(workspace.directory, workspace.vault);
    if (path === null) {
      throw new Error(`no ${MARKERS_FILE} in ${workspace.directory} or any parent workspace`);
    }
  }
  if (!existsSync(path)) {
    throw new Error(`no private markers at ${path}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

function never4ga(...args) {
  try {
    return JSON.parse(execFileSync("never4ga", ["--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

/** The vault and the workspace directory this repository resolves to. */
function findWorkspace() {
  const status = never4ga("status");
  const resolved = never4ga("workspace", "resolve", "--path", REPOSITORY);
  const vault = status?.vault;
  const manifest = resolved?.workspace_path;
  if (!vault || !manifest) {
    return null;
  }
  return { vault, directory: join(vault, dirname(manifest)) };
}

/** A child workspace's directory sits inside its parent's, so walk upward. */
function nearestMarkers(directory, vault) {
  for (let current = directory; current.startsWith(vault) && current !== vault; current = dirname(current)) {
    const candidate = join(current, MARKERS_FILE);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function scanMarkers(text, markers, where) {
  const folded = text.toLowerCase();
  return markers.filter((marker) => folded.includes(marker.toLowerCase())).map((marker) => `${where}: ${JSON.stringify(marker)}`);
}

/**
 * Every comment line in a TypeScript or JavaScript source, with its line.
 *
 * Read from the parsed tree rather than a bare token scan: a scanner alone
 * cannot tell a regular expression from a division or follow a template
 * literal, and loses its place in the comments after one.
 */
function scriptComments(source) {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, false);
  const ranges = new Map();
  const collect = (position) => {
    for (const range of [...(ts.getLeadingCommentRanges(source, position) ?? []), ...(ts.getTrailingCommentRanges(source, position) ?? [])]) {
      ranges.set(range.pos, range);
    }
  };
  const visit = (node) => {
    collect(node.getFullStart());
    collect(node.getEnd());
    node.getChildren(file).forEach(visit);
  };
  visit(file);
  const found = [];
  for (const range of [...ranges.values()].sort((a, b) => a.pos - b.pos)) {
    const first = file.getLineAndCharacterOfPosition(range.pos).line + 1;
    source
      .slice(range.pos, range.end)
      .split("\n")
      .forEach((line, offset) => found.push([first + offset, line]));
  }
  return found;
}

/** Every `#` comment in a YAML file or shell script, with its line. */
function hashComments(source) {
  const found = [];
  source.split("\n").forEach((line, index) => {
    if (line.startsWith("#!")) {
      return;
    }
    let quote = "";
    for (let i = 0; i < line.length; i++) {
      const character = line[i];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        found.push([index + 1, line.slice(i)]);
        return;
      }
    }
  });
  return found;
}

/** Markdown prose, with fenced blocks blanked so line numbers still hold. */
function markdownProse(source) {
  const prose = source.replace(CODE_FENCE, (block) => block.replace(/[^\n]/g, ""));
  return prose.split("\n").map((line, index) => [index + 1, line]);
}

/** Where the rule applies, and how to read that file's prose. */
function proseOf(path) {
  if (/^(src|tests|scripts)\/.*\.(ts|mjs|js)$/.test(path)) return scriptComments;
  if (/\.(ya?ml|sh)$/.test(path) || path.startsWith(".githooks/")) return hashComments;
  if (/^[^/]+\.md$/.test(path)) return markdownProse;
  return null;
}

function internalReferences(source, path) {
  const read = proseOf(path);
  if (read === null) {
    return [];
  }
  const findings = [];
  for (const [line, text] of read(source)) {
    for (const match of text.replace(CODE_SPAN, "").matchAll(INTERNAL_REFERENCE)) {
      findings.push(`${path}:${line}: ${JSON.stringify(match[0])}`);
    }
  }
  return findings;
}

function trackedFiles() {
  return git("ls-files", "-z").split("\0").filter((path) => path !== "");
}

function readTracked(path) {
  try {
    return readFileSync(join(REPOSITORY, path), "utf8");
  } catch {
    return null;
  }
}

function commitsToPush(local, remote) {
  const listed = remote === NO_COMMIT ? git("rev-list", local, "--not", "--remotes") : git("rev-list", `${remote}..${local}`);
  return listed.split("\n").filter((commit) => commit !== "");
}

/** The files a push adds, modifies or renames, as of its tip. */
function filesChanged(oldest, local, remote) {
  let base = remote;
  if (remote === NO_COMMIT) {
    const parents = git("rev-list", "--parents", "-n", "1", oldest).trim().split(" ").slice(1);
    if (parents.length === 0) {
      return git("ls-tree", "-r", "-z", "--name-only", local).split("\0").filter((path) => path !== "");
    }
    base = `${oldest}^`;
  }
  return git("diff", "--name-only", "-z", "--diff-filter=AMR", base, local).split("\0").filter((path) => path !== "");
}

function checkPush(updates, markers) {
  const privateFindings = [];
  const internal = [];
  for (const update of updates) {
    const parts = update.trim().split(/\s+/);
    if (parts.length !== 4) continue;
    const [localRef, local, , remote] = parts;
    if (markers !== null) privateFindings.push(...scanMarkers(localRef, markers, "branch name"));
    if (local === NO_COMMIT) continue; // a deletion publishes nothing
    const commits = commitsToPush(local, remote);
    if (commits.length === 0) continue;
    if (markers !== null) {
      for (const commit of commits) {
        const short = commit.slice(0, 7);
        privateFindings.push(...scanMarkers(git("log", "-1", "--format=%B", commit), markers, `${short} message`));
        const added = git("show", "--format=", "--unified=0", "--no-color", commit)
          .split("\n")
          .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
          .map((line) => line.slice(1))
          .join("\n");
        privateFindings.push(...scanMarkers(added, markers, `${short} added lines`));
      }
    }
    for (const path of filesChanged(commits[commits.length - 1], local, remote)) {
      if (proseOf(path) !== null) internal.push(...internalReferences(git("show", `${local}:${path}`), path));
    }
  }
  return { privateFindings, internal };
}

function checkTree(markers) {
  const privateFindings = [];
  const internal = [];
  for (const path of trackedFiles()) {
    const text = readTracked(path);
    if (text === null) continue;
    if (markers !== null) privateFindings.push(...scanMarkers(text, markers, path));
    internal.push(...internalReferences(text, path));
  }
  return { privateFindings, internal };
}

function main() {
  const prePush = process.argv.includes("--pre-push");
  let markers;
  try {
    markers = loadMarkers();
  } catch (error) {
    console.error(`public check: ${error.message}; refusing, because the vault is here`);
    return 1;
  }
  const updates = prePush ? readFileSync(0, "utf8").split("\n") : [];
  const { privateFindings, internal } = prePush ? checkPush(updates, markers) : checkTree(markers);
  if (privateFindings.length > 0) {
    console.error("\n  This would publish something private:\n");
    for (const finding of privateFindings) console.error(`    ${finding}`);
  }
  if (internal.length > 0) {
    console.error("\n  These comments cite records a reader cannot open:\n");
    for (const finding of internal) console.error(`    ${finding}`);
    console.error("\n  Cite a public spec section, or explain the rule itself.");
  }
  if (privateFindings.length > 0 || internal.length > 0) {
    console.error("\n  This repository is public. Fix it and push again.\n");
    return 1;
  }
  return 0;
}

process.exitCode = main();
