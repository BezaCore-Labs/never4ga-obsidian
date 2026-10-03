/**
 * Never4gA Companion — the optional Obsidian surface over the local service.
 *
 * The constraint that shapes every line of this: **the vault remains useful
 * with the plugin absent, and the plugin adds no canonical data of its own**
 * (never4ga `docs/specs/details/obsidian-experience` §2, §7, §9 and
 * `docs/specs/core/05` §19). Every panel renders derived or external state.
 * The plugin never writes Markdown itself: its two writes, creating and
 * adopting a concept, are requests the service carries out. Nothing in the
 * vault depends on this being installed.
 *
 * Pairing is configuration rather than ceremony: the plugin resolves
 * the machine's secret store by the same XDG rules Never4gA uses, reads the
 * credential at runtime, and keeps it in memory. Nothing it persists — all of
 * which lands in `.obsidian/`, inside the vault — ever holds a token.
 */

import { Notice, Platform, Plugin, requestUrl, type WorkspaceLeaf } from "obsidian";

import { Never4gaClient } from "./core/client.js";
import { CredentialError, defaultSecretsPath, readCredential } from "./core/credential.js";
import { fetchVia } from "./core/host-fetch.js";
import { loopbackProblem } from "./core/loopback.js";
import { fileReaderFrom, type NodeRequire } from "./core/node-reader.js";
import { probe, summarise } from "./core/presence.js";
import { resolveCwd } from "./core/scope.js";
import type { WorkspaceMapping } from "./core/types.js";

/** A directory the scope-dependent endpoints will accept, and where it came from. */
export interface Scope {
  cwd: string;
  /** `note` when the open note resolved it; `pinned` when it is the fallback. */
  source: "note" | "pinned";
}
import { DEFAULT_SETTINGS, Never4gaSettingTab, type Never4gaSettings } from "./settings.js";
import { CreateConceptModal, adoptNote } from "./ui/authoring-modals.js";
import { CONTEXT_VIEW, ContextView } from "./ui/context-view.js";
import { HEALTH_VIEW, HealthView } from "./ui/health-view.js";
import { SearchModal } from "./ui/search-modal.js";
import { WORK_VIEW, WorkView } from "./ui/work-view.js";

export default class Never4gaPlugin extends Plugin {
  override settings: Never4gaSettings = { ...DEFAULT_SETTINGS };

  private cachedClient: Never4gaClient | null = null;
  private problem: string | null = null;
  private statusBar: HTMLElement | null = null;
  private timer: number | null = null;
  private mappings: WorkspaceMapping[] | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new Never4gaSettingTab(this.app, this));

    this.registerView(HEALTH_VIEW, (leaf: WorkspaceLeaf) => new HealthView(leaf, this));
    this.registerView(WORK_VIEW, (leaf: WorkspaceLeaf) => new WorkView(leaf, this));
    this.registerView(CONTEXT_VIEW, (leaf: WorkspaceLeaf) => new ContextView(leaf, this));

    this.addRibbonIcon("activity", "Never4gA health", () => void this.reveal(HEALTH_VIEW));

    this.addCommand({
      id: "open-health",
      name: "Open health panel",
      callback: () => void this.reveal(HEALTH_VIEW),
    });
    this.addCommand({
      id: "open-work",
      name: "Open work items",
      callback: () => void this.reveal(WORK_VIEW),
    });
    this.addCommand({
      id: "open-context",
      name: "Inspect context for this note",
      callback: () => void this.reveal(CONTEXT_VIEW),
    });
    this.addCommand({
      id: "search",
      name: "Search the vault",
      callback: () => void this.openSearch(),
    });
    this.addCommand({
      id: "create-concept",
      name: "Create concept here",
      callback: () => void this.createConceptHere(),
    });
    this.addCommand({
      id: "adopt-note",
      name: "Adopt this note",
      callback: () => void this.adoptActiveNote(),
    });

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("n4g-status");
    this.statusBar.addEventListener("click", () => void this.reveal(HEALTH_VIEW));

    // The first probe waits for layout so a cold start does not race the
    // workspace, and so a vault opened without the service running settles on
    // "off" rather than flickering.
    this.app.workspace.onLayoutReady(() => {
      void this.refreshStatus();
      this.restartPolling();
    });
  }

  override onunload(): void {
    this.stopPolling();
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<Never4gaSettings>) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Any of these can change where or how the service is reached, so the
    // built client is no longer trustworthy.
    this.cachedClient = null;
    this.mappings = null;
    await this.refreshStatus();
  }

  /**
   * A client, or `null` with `pairingProblem()` explaining why not.
   *
   * Null is a state rather than an error: on mobile there is no service and no
   * filesystem to read a credential from, and saying so is the honest answer
   * (the portability test of obsidian-experience §9), not a failure to report.
   */
  async client(): Promise<Never4gaClient | null> {
    if (this.cachedClient !== null) {
      return this.cachedClient;
    }
    if (!Platform.isDesktopApp) {
      this.problem =
        "Not paired: the local service runs on the desktop only. The vault is fully usable here.";
      return null;
    }
    const read = fileReaderFrom(ambientRequire());
    if (read === null) {
      // No filesystem, which is a fact about the platform rather than about
      // the secret store. Saying "cannot read secrets.json" here would send
      // the reader to look at a file that was never the problem.
      this.problem =
        "Not paired: this Obsidian build gives the plugin no filesystem access, so the " +
        "machine's secret store cannot be read. The vault is fully usable.";
      return null;
    }
    const address = loopbackProblem(this.settings.baseUrl);
    if (address !== null) {
      this.problem = `Not paired: ${address}.`;
      return null;
    }
    let credential: string;
    try {
      credential = await readCredential(this.resolvedSecretsPath() as string, read);
    } catch (error) {
      this.problem = error instanceof CredentialError ? error.message : String(error);
      return null;
    }
    this.problem = null;
    this.cachedClient = new Never4gaClient({
      baseUrl: this.settings.baseUrl,
      credential,
      // `requestUrl`, not the renderer's `fetch`. The page's origin is
      // `app://obsidian.md` and the service sends no CORS headers -- nor
      // should it, since widening a loopback API to satisfy a browser would
      // be the wrong end to fix this at. `requestUrl` runs the request in the
      // main process instead, so the service needs no change at all.
      fetch: fetchVia((options) => requestUrl(options).then((response) => response)),
    });
    return this.cachedClient;
  }

  /** The client, for a caller that has already checked there is one. */
  require(): Never4gaClient {
    if (this.cachedClient === null) {
      throw new Error("the Never4gA client is not available");
    }
    return this.cachedClient;
  }

  pairingProblem(): string | null {
    return this.problem;
  }

  /** Where the secret store is: the setting if given, otherwise the XDG rules. */
  resolvedSecretsPath(): string | null {
    if (this.settings.secretsPath) {
      return this.settings.secretsPath;
    }
    if (!Platform.isDesktopApp) {
      return null;
    }
    return defaultSecretsPath(process.env, homeDirectory());
  }

  /**
   * The `cwd` the scope-dependent endpoints will accept, for the open note.
   *
   * A path inside the vault does not resolve on its own — the vault is one Git
   * repository and is not itself mapped — so the note names its workspace by
   * where it sits, and the workspace names the repository. See `core/scope.ts`.
   */
  async scopeForActiveNote(): Promise<Scope | null> {
    const mappings = await this.workspaceMappings();
    const file = this.app.workspace.getActiveFile();
    if (file !== null && mappings !== null) {
      const cwd = resolveCwd(file.path, mappings);
      if (cwd !== null) {
        return { cwd, source: "note" };
      }
    }
    // The note is outside every mapped workspace, as a Never4gA vault's
    // `home.md` and everything in `30_Knowledge/` are by design. A panel that
    // stopped there would be a dead end on the vault's own front page, so a
    // pinned workspace stands in until a note answers for itself again.
    if (this.settings.pinnedScope) {
      return { cwd: this.settings.pinnedScope, source: "pinned" };
    }
    return null;
  }

  /** Every workspace mapping, fetched once and kept. */
  async workspaceMappings(): Promise<WorkspaceMapping[] | null> {
    if (this.mappings !== null) {
      return this.mappings;
    }
    const client = await this.client();
    if (client === null) {
      return null;
    }
    try {
      this.mappings = (await client.workspaces()).mappings;
    } catch {
      return null;
    }
    return this.mappings;
  }

  /** Choose the workspace the panels fall back to when a note does not answer. */
  async pinScope(cwd: string | null): Promise<void> {
    this.settings.pinnedScope = cwd ?? "";
    await this.saveData(this.settings);
  }

  /**
   * Retrieval terms from the note being read.
   *
   * Its title, split into words — nothing cleverer. `focus` is a lexical stage
   * and needs something to match on, and the note's own title is the one thing
   * on screen that says what the reader is looking at. Deriving terms any other
   * way would mean deciding what a note is *about*, which is judgement, and
   * context assembly is mechanical first.
   */
  termsFromActiveNote(): string[] {
    const file = this.app.workspace.getActiveFile();
    if (file === null) {
      return [];
    }
    return file.basename
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2)
      .slice(0, 12);
  }

  /** Open a vault-relative path in Obsidian. The vault stays the thing you read. */
  async openVaultPath(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (file === null) {
      new Notice(`${path} is not in this vault.`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  restartPolling(): void {
    this.stopPolling();
    if (this.settings.refreshSeconds <= 0) {
      return;
    }
    this.timer = window.setInterval(
      () => void this.refreshStatus(),
      this.settings.refreshSeconds * 1000,
    );
    this.registerInterval(this.timer);
  }

  private stopPolling(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async refreshStatus(): Promise<void> {
    if (this.statusBar === null) {
      return;
    }
    const client = await this.client();
    if (client === null) {
      this.statusBar.setText("Never4gA: not paired");
      this.statusBar.setAttr("aria-label", this.problem ?? "Not paired");
      return;
    }
    const presence = await probe(client, this.settings.expectedBuild || null);
    this.statusBar.setText(summarise(presence));
    this.statusBar.setAttr("aria-label", presence.detail);
    if (presence.state === "unpaired") {
      // The credential the service minted has changed under us; the cached
      // client is holding a token that will never work again.
      this.cachedClient = null;
    }
  }

  /**
   * The two writes, both through the service and never to the vault directly.
   *
   * "Here" is the folder of the note being read -- the person's answer to the
   * placement question the CLI answers with --in. Adoption sends the active
   * file's own path; Obsidian paths are vault-relative, which is exactly what
   * the endpoint takes.
   */
  private async createConceptHere(): Promise<void> {
    const client = await this.client();
    if (client === null) {
      new Notice(this.problem ?? "Not paired.");
      return;
    }
    const folder = this.app.workspace.getActiveFile()?.parent?.path ?? "";
    // The registry decides what the modal can offer. Fetched fresh rather
    // than cached: it changes when the service does, and the call is local.
    // Without it the modal falls back to asking for the type as free text.
    let registry = null;
    try {
      registry = await client.schemaTypes();
    } catch {
      registry = null;
    }
    new CreateConceptModal(this.app, client, registry, folder === "/" ? "" : folder, (written) => {
      void this.app.workspace.openLinkText(written.path, "", false);
    }).open();
  }

  private async adoptActiveNote(): Promise<void> {
    const client = await this.client();
    if (client === null) {
      new Notice(this.problem ?? "Not paired.");
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (file === null || !file.path.endsWith(".md")) {
      new Notice("Open the Markdown note to adopt first.");
      return;
    }
    await adoptNote(this.app, client, file.path, (written) => {
      new Notice(written.placement ?? `Adopted ${written.path}.`);
      // Adopting out of foreign material moves the file, and the note the person was
      // reading is gone from under them. Open it where it now lives.
      if (written.moved_from) {
        void this.app.workspace.openLinkText(written.path, "", false);
      }
    });
  }

  private async openSearch(): Promise<void> {
    const client = await this.client();
    if (client === null) {
      new Notice(this.problem ?? "Not paired.");
      return;
    }
    new SearchModal(this.app, this, client).open();
  }

  private async reveal(type: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(type);
    if (existing.length > 0) {
      const leaf = existing[0];
      if (leaf) {
        await workspace.revealLeaf(leaf);
        return;
      }
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf === null) {
      return;
    }
    await leaf.setViewState({ type, active: true });
    await workspace.revealLeaf(leaf);
  }
}

/**
 * Electron's `require`, if this build has one.
 *
 * Read off the global rather than used as a bare identifier: the bundle is
 * CommonJS and Obsidian evaluates it with its own `require` in scope, which is
 * a module resolver rather than Node's. `window.require` is the one with the
 * builtins on it.
 */
function ambientRequire(): NodeRequire | undefined {
  return (globalThis as { require?: NodeRequire }).require;
}

function homeDirectory(): string {
  return process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
}
