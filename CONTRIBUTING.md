# Contributing

Thank you for looking. This file says how to build and test the plugin, how
the code is laid out, and the rules a change has to keep.

## What this repository is

The Obsidian companion for [Never4gA](https://github.com/BezaCore-Labs/never4ga).
The plugin is a display and a small set of requests over the local Never4gA
service's HTTP API. The API, and every product rule behind it, is defined in the
`never4ga` repository; **this repository never defines product behaviour**, only
how it is shown and asked for.

## Building and testing

Node 24 is what CI uses.

```bash
npm ci
npm run gate      # typecheck, unit tests, public check, production build
npm run dev       # rebuild main.js on every change
```

`npm run gate` is what every pull request runs. Run it before you push.

To try a change in Obsidian, copy `main.js`, `manifest.json` and `styles.css`
into `.obsidian/plugins/never4ga-companion/` in a test vault, with a Never4gA
service running against that vault. Use a scratch vault, not one you care about:
the authoring commands create and move notes.

`main.js` is a build output and is not committed. Releases attach it.

## Layout

| Path | What it holds |
|---|---|
| `src/core/` | The logic: the API client, credential lookup, presence, scope resolution, the request adapter. Imports nothing from `obsidian`. |
| `src/ui/` | Panels, modals and rendering helpers. Everything that touches the Obsidian API. |
| `src/main.ts` | The plugin entry point: commands, views, the status bar, pairing. |
| `src/settings.ts` | The settings the plugin persists, and the settings tab. |
| `tests/` | Unit tests for `src/core/`, run with `node:test`. |
| `esbuild.config.mjs` | Bundles everything into the single `main.js` Obsidian loads. |

`src/core/` is the tested layer. If a piece of logic is worth being sure about,
it belongs there, with a test, and the UI calls it. The UI layer is not
unit-tested, so keep logic out of it.

Work test first in `src/core/`: the behaviour, a failing test, then the
smallest change that passes it.

## Rules a change has to keep

1. **The plugin talks only to the local Never4gA service**, at the address in
   its settings. No other network requests, no telemetry, no third-party
   services. Requests go through Obsidian's `requestUrl`.
2. **Writes go through the service.** The plugin itself writes no Markdown and
   no frontmatter. Creating and adopting a concept are requests to the
   service's concept endpoints, which apply every rule the Never4gA command
   line applies. Every panel renders derived or external state, and the vault
   stays fully usable with the plugin absent.
3. **No credential is persisted.** `.obsidian/` is inside the vault, so a
   persisted token would be a secret in the vault. Store the *path* to the
   secret store and read the value at runtime.
4. **Degraded states are stated, not hidden.** Absent, starting, unpaired,
   mismatched and answering are different facts with different fixes. When the
   service is off, say so, and say the vault is still usable.
5. **No inference.** Scope resolution is a longest-prefix match over paths.
   Nothing in this plugin asks a model what a note is about.
6. **If the API is missing something, do not rebuild it here.** A plugin that
   reconstructs product behaviour client-side becomes a second implementation
   of it. Open an issue on
   [never4ga](https://github.com/BezaCore-Labs/never4ga/issues) for the
   endpoint, or here to discuss it.

## Comments, tests and commit messages

This repository is public, and everything in it is written for a reader who
was not there.

- A comment says what the code does and the constraint it meets. It does not
  tell the story of how the code came to be: no dates, incidents, ticket or
  pull request numbers, or references to documents a reader cannot open.
- Cite a specification where one states the rule, as never4ga
  `docs/specs/core/05` §12. Never4gA's specifications are published under
  [`docs/specs`](https://github.com/BezaCore-Labs/never4ga/tree/main/docs/specs).
- Test data is invented. No real people, organisations, hosts, paths or
  personal details.
- A commit message describes the change and why it matters to the plugin.

`npm run public-check` holds comments to this: it refuses one that cites a
record a reader cannot open. It is part of the gate. To run it before every
push as well, which also reads the commit messages and added lines being
pushed:

```bash
git config core.hooksPath .githooks
```

## Releases

A release is a tag equal to the version in `manifest.json`, with no `v` prefix
(for example `0.2.0`). Bump the version in `manifest.json` and `package.json`,
add it to `versions.json` with the minimum Obsidian version, and push the tag.
The release workflow runs the gate, checks the tag against the manifest, and
attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release.

## Security

Please do not report a vulnerability in a public issue. See
[SECURITY.md](SECURITY.md).

## Licence

The project is licensed under the [Apache License 2.0](LICENSE), and a
contribution is accepted under the same terms, as section 5 of the licence sets
out.
