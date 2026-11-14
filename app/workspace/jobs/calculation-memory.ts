/** Session-only, bounded answers keyed by the complete mathematical inputs.
 * A failed or unfinished calculation belongs to the caller, never this memory. */
export function calculationMemory<T>(capacity: number) {
  const answers = new Map<string, T>();
  return {
    clear(): void { answers.clear(); },
    read(key: string): T | undefined {
      const answer = answers.get(key);
      if (answer !== undefined) {
        answers.delete(key);
        answers.set(key, answer);
      }
      return answer;
    },
    remember(key: string, answer: T): void {
      answers.delete(key);
      answers.set(key, answer);
      while (answers.size > capacity) answers.delete(answers.keys().next().value!);
    },
  };
}
