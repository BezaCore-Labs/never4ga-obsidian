# Never4gA Companion

An optional Obsidian plugin for [Never4gA](https://github.com/BezaCore-Labs/never4ga),
the local knowledge and context system. It shows what the local Never4gA service
knows about your vault — service health, index status, search, context
provenance, work items and maintenance findings — and lets you create and adopt
concepts without leaving Obsidian.

**The vault stays yours.** The plugin never writes Markdown itself: its two
write commands ask the Never4gA service to do it, and the service applies every
rule its command line applies — placement, validation, refusing to guess. Every
panel renders derived or external state, nothing in the vault depends on the
plugin, and with it uninstalled, or the service stopped, the vault is a plain,
fully useful Markdown vault.

## Requirements

- Obsidian 1.5.0 or later, on desktop.
- The Never4gA service, version 0.1.0 or later, running on the same machine:

  ```bash
  uv tool install never4ga
  never4ga serve       # runs the service in the foreground
  never4ga status      # confirms it is answering, and reports the build
  ```

  On Linux the service can also run in the background under systemd. See the
  [Never4gA README](https://github.com/BezaCore-Labs/never4ga) for that and for
  setting up a vault.

## Install

The plugin is not yet in Obsidian's community plugin list.

**From a GitHub release.** Download `main.js`, `manifest.json` and `styles.css`
from the [latest release](https://github.com/BezaCore-Labs/never4ga-obsidian/releases/latest)
into `<your vault>/.obsidian/plugins/never4ga-companion/`, then enable
**Never4gA Companion** in Settings → Community plugins.

**With BRAT.** Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat)
plugin, choose *Add beta plugin*, and enter `BezaCore-Labs/never4ga-obsidian`.
BRAT installs the latest release and keeps it updated.

**From source.** See [Development](#development).

## What it shows

| Panel | What it is |
|---|---|
| **Health** | Service presence, running build, index status, and two index actions: reconcile and rebuild. |
| **Findings** | The open maintenance findings, read-only, each linked to the document it names. |
| **Search** | The vault through Never4gA's retrieval, naming which lane found each result. Opens the Markdown file. |
| **Context** | A Context Pack for the note you are reading, with every item's acquisition reason. |
| **Work** | Open, blocked and recently updated items from the tracker mapped to the note's workspace. Read-only; the tracker link is how you act. |

## What it changes

Everything below goes through the local service. The plugin has no code that
writes to a vault file.

| Action | What happens |
|---|---|
| **Create concept here** (command) | Asks for a type and a title, and the service creates the concept in the folder of the note you are reading. The new note opens. The service works out the rest and refuses anything it would have to guess. |
| **Adopt this note** (command) | The service makes the note you are reading a tracked concept: it infers the type from the folder, adds the frontmatter, and keeps the body as it was. A note adopted out of foreign material is moved to where its type lives, and opened there. When the folder does not decide the type, the service's refusal names the candidates and you pick one. |
| **Reconcile now**, **Rebuild index** (Health panel) | The service brings its derived index in line with the vault, or rebuilds it from scratch. The index lives outside the vault; no Markdown changes. |

The plugin does not write to a work tracker and does not dismiss findings.

Its own settings are saved by Obsidian in
`.obsidian/plugins/never4ga-companion/data.json`, inside the vault. They hold the
service address, the path to the secret store, display preferences and, if you
pin one, a repository path. They never hold the credential.

## Privacy and network use

- **Network.** The plugin makes requests only to the service address in its
  settings, by default the local Never4gA service at `http://127.0.0.1:7377`.
  Requests go through Obsidian's `requestUrl`. It contacts nothing else. The
  service may in turn read from a work tracker you have configured in Never4gA;
  the plugin itself does not.
- **Credential.** The service protects its API with a local bearer credential.
  The plugin reads it at runtime from Never4gA's secret store on disk:
  `$XDG_STATE_HOME/never4ga/secrets.json`, or
  `~/.local/state/never4ga/secrets.json` when `XDG_STATE_HOME` is unset, or the
  path you set in settings. It keeps the value in memory only, and sends it
  with each request to the service address. That address must be a loopback
  address (`127.0.0.1`, `::1` or `localhost`); the plugin refuses any other,
  so the credential never leaves the machine.
- **No telemetry.** The plugin collects and sends no usage data, analytics or
  crash reports.

## Pairing

There is no pairing step and no token in the vault. `.obsidian/` lives inside
the vault, so anything the plugin persists is inside the vault too, and a
credential stored there would travel wherever the vault is synced or committed.
The plugin keeps only the path to the secret store, resolved by the same rules
Never4gA uses, so on a machine where the service has run once the plugin pairs
itself. If it cannot read the credential, the Health panel says which file it
looked in and what to run.

## Desktop and mobile

The plugin needs the Never4gA service and a filesystem to read its credential
from, so it works on desktop only. It can be installed on mobile, where it
loads, reports "not paired" in its panels and commands, and does nothing
else. The vault is unaffected either way.

## Limits

- **The build is shown, not checked.** Never4gA fingerprints its own source
  tree to tell which build is running, which a plugin inside Obsidian cannot
  do. The plugin displays the running build and compares it only against a
  value you pin in settings; `never4ga status` can answer it properly.
- **Search waits for a pause in typing.** A query can take a few seconds on a
  large vault, so the search box runs the newest query once you stop typing.

## Development

```bash
npm ci
npm run gate      # typecheck, tests, production build
npm run dev       # watch build
```

`npm run build` writes `main.js`. To try a build, copy `main.js`,
`manifest.json` and `styles.css` into a test vault's
`.obsidian/plugins/never4ga-companion/`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is laid out and the
rules it follows, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Licence

[Apache-2.0](LICENSE).
