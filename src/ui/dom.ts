/**
 * Small rendering helpers.
 *
 * No framework: a panel that renders a dozen rows does not need
 * a runtime to do it, and a bundle the user installs by hand should stay small
 * enough to read.
 */

export function section(parent: HTMLElement, title: string): HTMLElement {
  const wrapper = parent.createDiv({ cls: "n4g-section" });
  wrapper.createEl("h3", { text: title, cls: "n4g-section-title" });
  return wrapper.createDiv({ cls: "n4g-section-body" });
}

/** A label/value row. The value may be missing, and says so rather than blank. */
export function row(parent: HTMLElement, label: string, value: string | null | undefined): void {
  const line = parent.createDiv({ cls: "n4g-row" });
  line.createSpan({ text: label, cls: "n4g-row-label" });
  line.createSpan({ text: value ?? "—", cls: "n4g-row-value" });
}

/**
 * A short, plain statement.
 *
 * Used for every degraded state. The plugin's whole contract is that it tells
 * the truth about what it cannot reach, so these are ordinary text rather than
 * a warning banner that trains a reader to ignore it.
 */
export function note(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ text, cls: "n4g-note" });
}

export function empty(parent: HTMLElement, text: string): void {
  parent.createDiv({ text, cls: "n4g-empty" });
}

export function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const element = parent.createEl("button", { text: label, cls: "n4g-button" });
  element.addEventListener("click", onClick);
  return element;
}

/** A timestamp as something a person reads, falling back to the raw string. */
export function when(value: string | null | undefined): string {
  if (!value) {
    return "never";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
