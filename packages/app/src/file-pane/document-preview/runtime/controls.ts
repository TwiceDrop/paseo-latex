export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

export function button(label: string, action: () => void): HTMLButtonElement {
  const node = element("button", label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

/** Pane/sidebar animations can report many widths; render only their settled layout. */
export function observeContentWidth(container: HTMLElement, resize: () => void): void {
  let width = container.clientWidth;
  let pending: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => {
    const next = container.clientWidth;
    if (next === width) return;
    width = next;
    clearTimeout(pending);
    // A retained pane can temporarily have no layout. Refit when it becomes visible.
    if (next <= 24) return;
    pending = setTimeout(resize, 120);
  }).observe(container);
}

export function fitPages(container: HTMLElement, zoom = 1): void {
  if (container.clientWidth <= 24) return;
  const pages = container.querySelectorAll<HTMLElement>("section.docx");
  for (const page of pages) {
    const width = page.offsetWidth;
    if (width > 0)
      page.style.zoom = String(Math.min(1, (container.clientWidth - 24) / width) * zoom);
  }
}
