import type { Locator } from "@playwright/test";

export async function typeBeforeMenuFilters(
  composer: Locator,
  input: { text: string; key: "Tab" | "Enter" },
): Promise<void> {
  await composer.evaluate(async (element, { text, key }) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Composer input is not a textarea");
    }
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Textarea value setter is unavailable");
    setValue.call(element, text);
    element.setSelectionRange(text.length, text.length);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }, input);
}
