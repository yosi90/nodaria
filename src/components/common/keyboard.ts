/** Un atajo global no debe actuar si el foco está en un campo editable o hay un modal abierto. */
export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"], dialog[open]'));
}
