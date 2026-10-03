/**
 * The shapes the local service answers with.
 *
 * These mirror `never4ga.api.models`, which is the payload shape every
 * interface renders through. They are deliberately partial where the
 * panel is: the plugin reads the fields it shows and tolerates the rest, so a
 * service that grows a key does not break a panel that never asked for it.
 */

/** `GET /v1/health`. Unauthenticated fields only -- liveness, and the build. */
export interface HealthResponse {
  status: string;
  service: string;
  api_version: string;
  version: string;
  /**
   * Which build is actually running. The version string is the same across
   * every commit of a release line, so it cannot answer "is this service
   * running the code I have?"
   */
  build: string;
  vault_id: string;
  uptime_seconds: number;
}

/** `GET /v1/index/status`. */
export interface IndexStatus {
  built: boolean;
  indexed_documents: number;
  last_indexed_at: string | null;
  stale: boolean;
}

/** `GET /v1/maintenance/findings`. Read only: the plugin never changes a finding. */
export interface MaintenanceFinding {
  finding_id: string;
  rule: string;
  severity: string;
  fingerprint: string;
  message: string;
  detected_at: string;
  path: string | null;
}

export interface FindingsResponse {
  /** False when this vault keeps no findings ledger. Not an error. */
  available: boolean;
  findings: MaintenanceFinding[];
}

/** `POST /v1/concepts/search`. */
export interface SearchResult {
  /** Null for a note in foreign material, reached by path. */
  id: string | null;
  path: string;
  title: string;
  /** Null exactly when `id` is: a foreign note has no type until adopted. */
  type: string | null;
  rank: number;
  /** Which lane found it -- the mechanical-first stage, named. */
  retriever: string;
  reason: string;
  heading_path: string[];
  excerpt: string;
  lines: number[] | null;
  is_stale: boolean;
}

export interface SearchResponse {
  index_is_stale: boolean;
  results: SearchResult[];
}

/** Why an item is in a pack (never4ga `docs/specs/core/07` §12). The inspector shows it. */
export interface AcquisitionReason {
  stage: string;
  code: string;
  detail: string;
}

export interface ContextItem {
  /** Null for a note in foreign material, reached by path. */
  id: string | null;
  path: string;
  title: string;
  category: string;
  priority: number;
  reason: AcquisitionReason;
  is_reference: boolean;
  body: string | null;
}

export interface ContextSignal {
  provider: string;
  kind: string;
  value: unknown;
  reason: AcquisitionReason;
}

export interface BudgetUsage {
  items: number;
  characters: number;
  estimated_tokens: number;
  full_documents: number;
  dropped_items: number;
}

export interface ResolvedScope {
  workspace_id: string;
  workspace_path: string;
  repository_root: string | null;
  parent_chain: string[];
  reason: AcquisitionReason;
  conflicts: string[];
}

export interface ContextPack {
  depth: string;
  scope: ResolvedScope;
  items: ContextItem[];
  signals: ContextSignal[];
  usage: BudgetUsage;
  degraded_providers: string[];
  llm_stages: string[];
  session_id: string | null;
}

/** `GET /v1/workspaces`. How a note's folder finds the repository it belongs to. */
export interface WorkspaceMapping {
  workspace_id: string;
  workspace_path: string;
  repository_root: string | null;
  parent_id: string | null;
}

export interface WorkspaceListResponse {
  mappings: WorkspaceMapping[];
}

/**
 * `GET /v1/work/items`. Rendered through `never4ga.rendering`, like the CLI.
 *
 * The identifier is `ref` — the provider-side reference — with `display_id`
 * being what a person sees. Neither is a Never4gA identity: a tracker's row id
 * is never canonical (never4ga `docs/specs/core/06` §3), which is why the
 * field is not called `id`.
 */
export interface WorkItem {
  ref: string;
  display_id: string;
  provider: string;
  title: string;
  status: string;
  type?: string | null;
  priority?: string | null;
  assignee?: string | null;
  description_excerpt?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  url?: string | null;
  parent?: string | null;
}

export interface WorkItemsResponse {
  connection?: string | null;
  project_ref?: string | null;
  /** How many the tracker reported, which a truncated list must not contradict. */
  counted?: number;
  items: WorkItem[];
}

/** `POST /v1/index/reconcile` and `/rebuild`. */
export interface IndexRun {
  indexed: number;
  unchanged: number;
  removed: number;
  issues: { code: string; message: string }[];
}

/**
 * `GET /v1/schema/types` — the Type Registry as data.
 *
 * A creation surface reads it instead of asking the person to already know
 * the type names, the optional fields, and the legal lifecycle values.
 */
export interface RegistryOptionalField {
  name: string;
  /**
   * How a declared value is written -- the service converts these itself, so
   * a surface sends what was typed. `null` means deliberately undeclared
   * (an A, a 95 and a Pass are all grades): render plain text, convert
   * nothing. `boolean` is the exception to sending what was typed: it is
   * offered as a choice and sent as a real boolean.
   */
  kind: "list" | "timestamp" | "date" | "integer" | "boolean" | null;
}

export interface RegistryType {
  name: string;
  /** Where this type lives, in human words -- prose, not enums. */
  locations: string[];
  /** False means placement is advisory; do not warn as if it were a rule. */
  location_is_binding: boolean;
  /** Type-specific, in addition to `required_base_fields`. */
  required_fields: string[];
  /** Possibly empty: an empty list tolerates any value, not no value. */
  lifecycle_values: string[];
  optional_fields: RegistryOptionalField[];
  recommended_authority: string | null;
  /** False must keep the type out of any create surface; create refuses it. */
  creatable: boolean;
}

export interface TypeRegistry {
  schema_version: string;
  required_base_fields: string[];
  types: RegistryType[];
}

/** What a concept write returned: POST /v1/concepts and /v1/concepts/adopt. */
export interface ConceptWritten {
  id: string;
  path: string;
  created_directories?: string[];
  created_files?: string[];
  /** Why the document went where it did, in the service's own words. */
  placement?: string | null;
  /**
   * Where the file was, when adopting it moved it out of foreign material.
   * The old path names nothing any more; `path` is the note now.
   */
  moved_from?: string | null;
}
