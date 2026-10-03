/**
 * Finding the local API credential without ever putting it in the vault.
 *
 * `.obsidian/` lives *inside* the vault, so anything the plugin persists is
 * inside the vault too — which rules out storing the token there (never4ga
 * `docs/specs/core/05` §9: secrets never enter the vault). What the plugin keeps is the
 * *path* to the machine's secret store; the value is read at runtime and held
 * only in memory.
 *
 * This module knows nothing about Obsidian or about Node. It is handed a
 * reader, so the desktop passes one backed by `fs` and a test passes a map.
 */

/** Reads a file as UTF-8, or rejects. The desktop supplies `fs.promises`. */
export type FileReader = (path: string) => Promise<string>;

/** The name the Never4gA service registers its local API token under. */
export const LOCAL_API_CREDENTIAL = "never4ga.local_api_credential";

export interface SecretsFile {
  version?: number;
  secrets?: Record<string, string>;
}

export class CredentialError extends Error {}

/**
 * Where the Never4gA service puts `secrets.json`, by the same XDG rules.
 *
 * `$XDG_STATE_HOME/never4ga/secrets.json`, falling back to
 * `~/.local/state/never4ga/secrets.json`. Resolved here rather than asked of
 * the user, so pairing is configuration rather than ceremony, and a user who
 * has moved their state directory can still say so in settings.
 */
export function defaultSecretsPath(
  environment: Record<string, string | undefined>,
  home: string,
): string {
  const state = environment["XDG_STATE_HOME"];
  const base = state && state.trim() !== "" ? state : join(home, ".local", "state");
  return join(base, "never4ga", "secrets.json");
}

/**
 * Read the API credential out of the secret store.
 *
 * Every failure is named rather than collapsed into "not paired": a missing
 * file, an unreadable one and a file with no credential in it are three
 * different problems with three different fixes, and a panel that says only
 * "not paired" sends the user looking in the wrong place.
 */
export async function readCredential(path: string, read: FileReader): Promise<string> {
  let raw: string;
  try {
    raw = await read(path);
  } catch (error) {
    throw new CredentialError(
      `cannot read the secret store at ${path}: ${describe(error)}. ` +
        "Run `never4ga status` on this machine to confirm the service has been started at least once.",
    );
  }

  let parsed: SecretsFile;
  try {
    parsed = JSON.parse(raw) as SecretsFile;
  } catch (error) {
    throw new CredentialError(`the secret store at ${path} is not valid JSON: ${describe(error)}`);
  }

  const credential = parsed.secrets?.[LOCAL_API_CREDENTIAL];
  if (typeof credential !== "string" || credential === "") {
    throw new CredentialError(
      `the secret store at ${path} holds no ${LOCAL_API_CREDENTIAL}. ` +
        "Start the service once with `never4ga serve` and it will mint one.",
    );
  }
  return credential;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** POSIX join, kept local so the core imports nothing. */
function join(...parts: string[]): string {
  return parts
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, "")))
    .filter((part) => part !== "")
    .join("/");
}
