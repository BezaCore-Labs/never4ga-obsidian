/**
 * Obsidian's `requestUrl`, adapted to the shape the client speaks.
 *
 * A plugin cannot reach `http://127.0.0.1:7377` with the renderer's `fetch`.
 * The page's origin is `app://obsidian.md`, the service sends no CORS headers
 * — nor should it: it binds loopback and answers a bearer credential, and
 * adding `Access-Control-Allow-Origin` to satisfy a browser would be widening
 * a local API to please a client that has another way in.
 *
 * That other way is `requestUrl`, which performs the request in the main
 * process rather than the page. It is the documented route for exactly this,
 * and it means the service needs no change to be reachable from Obsidian.
 *
 * Two details this has to get right, both of which would otherwise be silent:
 * `requestUrl` throws on 400+ by default, which would turn every structured
 * API error into "unreachable" and lose the code the panels report; and it has
 * no cancellation, so the client's timeout would set an `AbortSignal` nothing
 * ever listened to.
 */

import type { Fetch } from "./client.js";

/** The part of `RequestUrlParam` this uses. */
export interface HostRequestOptions {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  throw?: boolean;
}

/** The part of `RequestUrlResponse` this uses. */
export interface HostResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type HostRequest = (options: HostRequestOptions) => Promise<HostResponse>;

/** Statuses the Response constructor refuses to give a body. */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

export function fetchVia(request: HostRequest): Fetch {
  return async (url, init) => {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) {
      throw abortError();
    }

    const options: HostRequestOptions = {
      url,
      method: init.method ?? "GET",
      // Never let the host throw: a 409 carrying `index_not_built` is an
      // answer, and the client is what turns it into a message.
      throw: false,
    };
    if (typeof init.body === "string") {
      options.body = init.body;
    }
    if (init.headers) {
      options.headers = init.headers as Record<string, string>;
    }

    const response = signal
      ? await Promise.race([request(options), rejectOnAbort(signal)])
      : await request(options);

    return new Response(NULL_BODY.has(response.status) ? null : response.text, {
      status: response.status,
      headers: response.headers,
    });
  };
}

/** A promise that never resolves and rejects the moment the signal aborts. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

function abortError(): Error {
  const error = new Error("the request was aborted");
  error.name = "AbortError";
  return error;
}
