/**
 * What the plugin persists — which is deliberately almost nothing.
 *
 * `.obsidian/` lives inside the vault, so everything here is inside the vault
 * too. That is why the credential is absent: what is stored is the *path* to
 * the machine's secret store, and the value is read at runtime and held in
 * memory (never4ga `docs/specs/core/05` §9). A token in this file would be a secret in the
 * vault, and the vault is what gets synced and committed.
 */

import { type App, PluginSettingTab, Setting } from "obsidian";

import { defaultSecretsPath } from "./core/credential.js";
import type Never4gaPlugin from "./main.js";

export interface Never4gaSettings {
  /** Loopback only; the plugin will not send the credential anywhere else. */
  baseUrl: string;
  /** Where `secrets.json` is. Empty means "resolve it by the XDG rules". */
  secretsPath: string;
  /** How often the status bar re-probes, in seconds. Zero disables polling. */
  refreshSeconds: number;
  /**
   * A build fingerprint to compare the running service against. Optional
   * because the plugin cannot compute the on-disk build itself — see
   * `core/presence.ts`.
   */
  expectedBuild: string;
  /** Results per search. */
  searchLimit: number;
  /**
   * A repository root the work and context panels fall back to when the open
   * note is outside every mapped workspace, as a Never4gA vault's `home.md`
   * and everything in `30_Knowledge/` are by design. Empty means no fallback.
   */
  pinnedScope: string;
}

export const DEFAULT_SETTINGS: Never4gaSettings = {
  baseUrl: "http://127.0.0.1:7377",
  secretsPath: "",
  refreshSeconds: 30,
  expectedBuild: "",
  searchLimit: 20,
  pinnedScope: "",
};

export class Never4gaSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: Never4gaPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Service address")
      .setDesc(
        "Loopback only: 127.0.0.1, ::1 or localhost. The plugin sends the service's credential " +
          "with every request, so it refuses any other address.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.baseUrl)
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Secret store")
      .setDesc(
        "Path to secrets.json on this machine. Leave empty to resolve it by the same XDG rules " +
          "Never4gA uses. The credential itself is never stored in the vault.",
      )
      .addText((text) =>
        text
          .setPlaceholder(this.plugin.resolvedSecretsPath() ?? defaultSecretsPath({}, "~"))
          .setValue(this.plugin.settings.secretsPath)
          .onChange(async (value) => {
            this.plugin.settings.secretsPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Refresh interval")
      .setDesc("Seconds between status-bar probes. Zero stops polling.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.refreshSeconds)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.refreshSeconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          await this.plugin.saveSettings();
          this.plugin.restartPolling();
        }),
      );

    new Setting(containerEl)
      .setName("Expected build")
      .setDesc(
        "Optional. A build fingerprint to hold the running service to. The plugin cannot compute " +
          "this itself — `never4ga status` reports it — so leaving it empty means the build is " +
          "shown but not checked.",
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.expectedBuild).onChange(async (value) => {
          this.plugin.settings.expectedBuild = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Search results").addText((text) =>
      text.setValue(String(this.plugin.settings.searchLimit)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        this.plugin.settings.searchLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
        await this.plugin.saveSettings();
      }),
    );
  }
}
