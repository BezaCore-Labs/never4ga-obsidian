/**
 * A typed client over the loopback API.
 *
 * The service binds `127.0.0.1` and nothing else (never4ga
 * `docs/specs/core/05` §12). Every request carries the bearer credential.
 * None of them writes to the vault directly: the two that change it, create
 * and adopt, ask the service to.
 *
 * `fetch` is injected rather than reached for, so the client is testable
 * without a socket and the Obsidian build can hand it `requestUrl`, which the
 * renderer's own `fetch` cannot stand in for (see `host-fetch.ts`).
 */

import type {
  ConceptWritten,
  ContextPack,
  FindingsResponse,
  HealthResponse,
  IndexRun,
  IndexStatus,
  SearchResponse,
  TypeRegistry,
  WorkItem,
  WorkItemsResponse,
  WorkspaceListResponse,
} from "./types.js";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /**
     * Structured detail from `error.details`, when the service sent any.
     *
     * `candidates` is the one this plugin acts on: the registered types an
     * ambiguous adoption could have been. It arrives as data so the modal can
     * offer them as choices — the message names no flag, because this surface
     * has none.
     */
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }

  /** The candidate types, when the failure was an ambiguity. */
  get candidates(): string[] {
    const raw = this.details["candidates"];
    return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
  }
}

/** The service answered nothing at all — not running, or a wrong port. */
export class UnreachableError extends Error {}

export interface ClientOptions {
  baseUrl: string;
  credential: string;
  fetch: Fetch;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
  /** The shorter ceiling presence gets. Separate so a test need not wait it out. */
  healthTimeoutMs?: number;
}

/**
 * Generous, because the work is genuinely slow rather than stuck.
 *
 * A search on a large vault can take several seconds, and the service answers
 * requests in turn, so a few queued behind each other would exceed a short
 * ceiling and a panel would report a working service as unreachable.
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Presence is the exception and stays short.
 *
 * "Is it there" must answer quickly or the status bar lies by omission, and a
 * health check that has not returned in five seconds has told you what you
 * needed to know.
 */
const HEALTH_TIMEOUT_MS = 5_000;

export class Never4gaClient {
  private readonly baseUrl: string;
  private readonly credential: string;
  private readonly doFetch: Fetch;
  private readonly timeoutMs: number;
  private readonly healthTimeoutMs: number;

  constructor(options: ClientOptions) {
    // A trailing slash would produce `//v1/health`, which the router does not
    // match and which reads as a typo in every error message afterwards.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.credential = options.credential;
    this.doFetch = options.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.healthTimeoutMs = options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS;
  }

  health(): Promise<HealthResponse> {
    return this.get<HealthResponse>("/v1/health", this.healthTimeoutMs);
  }

  indexStatus(): Promise<IndexStatus> {
    return this.get<IndexStatus>("/v1/index/status");
  }

  findings(): Promise<FindingsResponse> {
    return this.get<FindingsResponse>("/v1/maintenance/findings");
  }

  /**
   * Work items for a scope.
   *
   * `cwd` is required by the route: work is read through the same scope
   * resolution the CLI uses, so a request that named no directory would have
   * no tracker to ask. `scope.ts` is what turns the note being read into one.
   */
  workItems(cwd: string, options: { statuses?: string[]; limit?: number } = {}): Promise<WorkItemsResponse> {
    const query = new URLSearchParams({ cwd });
    for (const status of options.statuses ?? []) {
      query.append("status", status);
    }
    if (options.limit !== undefined) {
      query.set("limit", String(options.limit));
    }
    return this.get<WorkItemsResponse>(`/v1/work/items?${query.toString()}`);
  }

  workItem(cwd: string, id: string): Promise<WorkItem> {
    const query = new URLSearchParams({ cwd });
    return this.get<WorkItem>(`/v1/work/items/${encodeURIComponent(id)}?${query.toString()}`);
  }

  workspaces(): Promise<WorkspaceListResponse> {
    return this.get<WorkspaceListResponse>("/v1/workspaces");
  }

  search(query: string, limit = 20): Promise<SearchResponse> {
    return this.post<SearchResponse>("/v1/concepts/search", { query, limit });
  }

  /**
   * A context pack at one of the three depths.
   *
   * The inspector shows the pack *with its reasons*, which is why this returns
   * the whole thing rather than a list of titles: the acquisition reason is
   * the part no other surface makes visible.
   *
   * `cwd` nests under `scope` — the request model rejects an unknown top-level
   * key outright — and `focus` returns an empty pack without `terms`, because
   * focused retrieval is lexical and has nothing to match on. `deep` needs
   * none.
   */
  context(
    depth: "startup" | "focus" | "deep",
    request: { cwd: string; terms?: string[]; client?: string },
  ): Promise<ContextPack> {
    return this.post<ContextPack>(`/v1/context/${depth}`, {
      scope: { cwd: request.cwd },
      ...(request.terms && request.terms.length > 0 ? { terms: request.terms } : {}),
      ...(request.client ? { client: request.client } : {}),
    });
  }

  /**
   * Create a concept of any registered type.
   *
   * One of the plugin's two writes, both made through the service and never
   * to the vault directly.
   * `folder` becomes the API's `in`, so "here" means the folder the person is
   * looking at; the service works out the workspace from it and refuses
   * anything it would otherwise have to guess.
   */
  createConcept(request: {
    type: string;
    title: string;
    folder?: string;
    description?: string;
    /**
     * Optional frontmatter, `lifecycle` included. Values go as typed: a
     * declared kind is the service's to convert, not this surface's to
     * guess.
     */
    fields?: Record<string, unknown>;
  }): Promise<ConceptWritten> {
    return this.post<ConceptWritten>("/v1/concepts", {
      type: request.type,
      title: request.title,
      ...(request.folder ? { in: request.folder } : {}),
      ...(request.description ? { description: request.description } : {}),
      ...(request.fields && Object.keys(request.fields).length > 0 ? { fields: request.fields } : {}),
    });
  }

  /**
   * The Type Registry: which types exist, which are creatable, their
   * optional fields and legal lifecycle values, so the create modal can
   * offer choices instead of free text.
   */
  schemaTypes(): Promise<TypeRegistry> {
    return this.get<TypeRegistry>("/v1/schema/types");
  }

  /**
   * Make the Markdown already at `path` a tracked concept, in place.
   * Obsidian's file paths are vault-relative, which is exactly
   * what the endpoint takes. The service infers the type from the folder and
   * refuses to guess an ambiguous one; the refusal names the candidates, and
   * retrying with `type` is how the person answers.
   */
  adoptConcept(request: { path: string; type?: string }): Promise<ConceptWritten> {
    return this.post<ConceptWritten>("/v1/concepts/adopt", {
      path: request.path,
      ...(request.type ? { type: request.type } : {}),
    });
  }

  reconcile(): Promise<IndexRun> {
    return this.post<IndexRun>("/v1/index/reconcile", {});
  }

  rebuild(): Promise<IndexRun> {
    return this.post<IndexRun>("/v1/index/rebuild", {});
  }

  private get<T>(path: string, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: "GET" }, timeoutMs);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    let response: Response;
    try {
      response = await this.doFetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          authorization: `Bearer ${this.credential}`,
          accept: "application/json",
        },
      });
    } catch (error) {
      // A refused connection and an abandoned one are the same fact to a
      // reader: nothing answered. Presence is what turns that into a state.
      throw new UnreachableError(
        `no answer from ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await this.failure(response);
    }
    return (await response.json()) as T;
  }

  /**
   * Turn an error response into the structured error the API actually sends.
   *
   * The service wraps every failure as `{"error": {code, message, ...}}`,
   * and reporting the code is what lets a panel say "this vault has not been
   * indexed yet" instead of "500".
   */
  private async failure(response: Response): Promise<ApiError> {
    let code: string | undefined;
    let details: Record<string, unknown> = {};
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      };
      if (body.error?.message) {
        message = body.error.message;
      }
      if (body.error?.code) {
        code = body.error.code;
      }
      if (body.error?.details) {
        details = body.error.details;
      }
    } catch {
      // A body that is not JSON is not worth a second failure mode; the
      // status line above already says what happened.
    }
    return new ApiError(message, response.status, code, details);
  }
}
