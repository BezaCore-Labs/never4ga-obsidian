/**
 * Keeping only the newest attempt, when the work is slower than the typing.
 *
 * Search-as-you-type assumes the backend is faster than a keystroke. This one
 * need not be: a query can take seconds when the semantic lane embeds it and
 * scores the corpus, and a single-worker service answers requests in turn.
 * Firing per keystroke would queue a request for each, and those behind the
 * first few would exceed their timeout, reporting failures for a search that
 * is working as designed.
 *
 * A generation counter is the whole mechanism. Each attempt takes a token and
 * asks, at every point where it is about to act, whether it is still the
 * newest. A superseded attempt does nothing rather than racing a fresher one
 * to the same output, which is what this prevents: results for "acq"
 * landing after results for "acquisition reason".
 */

export class LatestOnly {
  private generation = 0;

  /**
   * Start an attempt, superseding every attempt already in flight.
   *
   * Returns the predicate that attempt uses to check it is still wanted.
   */
  begin(): () => boolean {
    const mine = ++this.generation;
    return () => mine === this.generation;
  }

  /** Supersede everything in flight without starting anything. */
  cancel(): void {
    this.generation += 1;
  }
}
