/**
 * A note nobody has adopted yet.
 *
 * Search and the context endpoints reach notes in registered foreign material
 * by path, with `id` and `type` both null: the note is not a concept, so it
 * has neither. Rendering that null as text would show "null" where the type
 * belongs. What the reader needs to know is that the note is untracked, which is
 * also what `Adopt this note` is for.
 */

export const NOT_ADOPTED = "not adopted";

/** True for a concept, false for a note reached by path alone. */
export function isAdopted(item: { id: string | null }): boolean {
  return item.id !== null;
}

/** A concept's type, or `not adopted` for a foreign note. */
export function kindOf(item: { id: string | null; type: string | null }): string {
  return item.type ?? NOT_ADOPTED;
}
