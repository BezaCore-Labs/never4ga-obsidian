/**
 * What state the service is in, said honestly.
 *
 * The failure principle (never4ga `docs/specs/core/05` §19) is the constraint
 * the whole plugin sits under: nothing depends on the service, and the vault
 * is a plain, fully useful Markdown vault when it is not running. So the honest answer to "is it there" has more than two
 * values, and a panel that collapsed them would be claiming certainty it does
 * not have.
 *
 * - `unpaired`   — no credential could be read. Not a service problem.
 * - `absent`     — nothing is listening.
 * - `starting`   — something answered, but not yet with a health payload.
 * - `answering`  — healthy.
 * - `mismatched` — healthy, but running a build the reader pinned as wrong.
 *
 * **The build check is opt-in, and that is a limitation rather than a
 * preference.** Never4gA fingerprints its source tree in-process, so the CLI
 * knows the on-disk build because it *is* the on-disk build. A plugin inside
 * Obsidian has no Python and no source tree, and cannot compute the expected
 * value. So the panel shows the running build always, and compares it only
 * against a value a reader pinned in settings. Inventing a comparison here
 * would be the confident, wrong answer the fingerprint exists to prevent;
 * `never4ga status` is the surface that can answer it properly.
 */

import { ApiError, Never4gaClient, UnreachableError } from "./client.js";
import type { HealthResponse } from "./types.js";

export type PresenceState = "unpaired" | "absent" | "starting" | "answering" | "mismatched";

export interface Presence {
  state: PresenceState;
  health?: HealthResponse;
  /** What to show a reader. Always set, always specific. */
  detail: string;
}

export async function probe(
  client: Never4gaClient,
  expectedBuild?: string | null,
): Promise<Presence> {
  let health: HealthResponse;
  try {
    health = await client.health();
  } catch (error) {
    if (error instanceof UnreachableError) {
      return {
        state: "absent",
        detail: "The service is not answering. The vault is still a plain Markdown vault.",
      };
    }
    if (error instanceof ApiError) {
      // Something is listening and refusing us. Starting up, or a credential
      // that no longer matches the one the service minted.
      if (error.status === 401 || error.status === 403) {
        return {
          state: "unpaired",
          detail: `The service rejected the credential (${error.status}). Restart it, or re-read the secret store.`,
        };
      }
      return { state: "starting", detail: `The service answered ${error.status}: ${error.message}` };
    }
    return { state: "absent", detail: describe(error) };
  }

  if (expectedBuild && health.build && health.build !== expectedBuild) {
    return {
      state: "mismatched",
      health,
      detail:
        `The running service is build ${short(health.build)}; settings pin ${short(expectedBuild)}. ` +
        "Restart it with `never4ga service restart`.",
    };
  }
  return { state: "answering", health, detail: `Answering, build ${short(health.build)}.` };
}

/** How a state reads in a status bar: short, and never falsely reassuring. */
export function summarise(presence: Presence): string {
  switch (presence.state) {
    case "answering":
      return "Never4gA: ok";
    case "mismatched":
      return "Never4gA: stale build";
    case "starting":
      return "Never4gA: starting";
    case "unpaired":
      return "Never4gA: not paired";
    case "absent":
      return "Never4gA: off";
  }
}

function short(build: string): string {
  return build.slice(0, 12);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
