import { getSlides, loadPresentation } from "@office-kit/pptx";
import { renderSlideToSvg } from "@office-kit/pptx-preview";
import type { DocumentLabels } from "../messages";
import { button, element, observeContentWidth } from "./controls";

export async function renderSlides(
  bytes: Uint8Array,
  root: HTMLElement,
  controls: HTMLElement,
  labels: DocumentLabels,
): Promise<void> {
  const presentation = await loadPresentation(bytes);
  const slides = getSlides(presentation);
  if (slides.length === 0) throw new Error("No slides");
  let index = 0;
  let zoom = 1;
  let rendered: Element | null = null;
  const status = element("span");
  const previous = button(labels.previous, () => {
    index--;
    show();
  });
  const next = button(labels.next, () => {
    index++;
    show();
  });
  controls.append(
    previous,
    status,
    next,
    button(labels.zoomOut, () => {
      zoom = Math.max(0.5, zoom - 0.25);
      fit();
    }),
    button(labels.zoomIn, () => {
      zoom = Math.min(3, zoom + 0.25);
      fit();
    }),
    button(labels.fit, () => {
      zoom = 1;
      fit();
    }),
  );
  function fit(): void {
    if (root.clientWidth <= 24) return;
    // Scaling the existing SVG preserves its content and avoids parsing the slide
    // again for every zoom click or sidebar/viewport size change.
    rendered?.setAttribute("width", `${(root.clientWidth - 24) * zoom}`);
  }
  function show(): void {
    const markup = renderSlideToSvg(presentation, slides[index]);
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    const svg = parsed.documentElement;
    // Rendered SVG is document content. Remove navigation and executable nodes
    // before it joins the trusted viewer document.
    svg
      .querySelectorAll("script, iframe, object, embed, foreignObject script")
      .forEach((node) => node.remove());
    svg.querySelectorAll("*").forEach((node) => {
      for (const attribute of Array.from(node.attributes)) {
        const external = /^(?:https?:|javascript:|\/\/)/i.test(attribute.value.trim());
        if (attribute.name.startsWith("on") || external) node.removeAttribute(attribute.name);
      }
    });
    svg.removeAttribute("height");
    rendered = document.importNode(svg, true);
    root.replaceChildren(rendered);
    fit();
    root.scrollTo(0, 0);
    previous.disabled = index === 0;
    next.disabled = index + 1 === slides.length;
    status.textContent = `${index + 1} / ${slides.length}`;
  }
  show();
  observeContentWidth(root, fit);
}
