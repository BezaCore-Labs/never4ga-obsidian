/**
 * The `fields` a create request carries, from what the person chose.
 *
 * Text is sent as typed: a declared kind is the service's to convert.
 * A boolean is the exception, because it is never typed -- the modal offers
 * it as (unset), true and false, and the choice is already the value. Sending
 * the string "true" instead would ask the service to convert a word the
 * person never wrote.
 */

/** A text field's value as typed, or a boolean field's choice. */
export type FieldValue = string | boolean | undefined;

/**
 * The value a boolean dropdown option stands for. Anything but the two
 * literal choices is unset, so the blank first option sends nothing.
 */
export function booleanChoice(option: string): boolean | undefined {
  if (option === "true") {
    return true;
  }
  if (option === "false") {
    return false;
  }
  return undefined;
}

/**
 * Drop what was left empty, keep a chosen `false`, and add the lifecycle
 * when one was chosen. An empty result means the request carries no fields.
 */
export function conceptFields(values: Record<string, FieldValue>, lifecycle: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      fields[name] = value;
    } else if (value !== undefined && value.trim() !== "") {
      fields[name] = value.trim();
    }
  }
  if (lifecycle !== "") {
    fields["lifecycle"] = lifecycle;
  }
  return fields;
}
