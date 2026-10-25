/** Una copia de `set` con `value` dentro (`present`) o fuera: para los conjuntos del estado de React. */
export function withMember<T>(set: ReadonlySet<T>, value: T, present: boolean): Set<T> {
  const next = new Set(set);
  if (present) next.add(value);
  else next.delete(value);
  return next;
}
