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

export function fitPages(container: HTMLElement, zoom = 1): void {
  if (container.clientWidth <= 24) return;
  const pages = container.querySelectorAll<HTMLElement>("section.docx");
  for (const page of pages) {
    const width = page.offsetWidth;
    if (width > 0)
      page.style.zoom = String(Math.min(1, (container.clientWidth - 24) / width) * zoom);
  }
}
