import { parseArgs } from "node:util";
import { runNpm } from "./run-npm.mjs";

// One contract list for upstream migration and release CI. Never run the full app suite here.
const suites = {
  unit: [
    "app.config.test.ts",
    "native-release-version.test.ts",
    "src/desktop/updates/desktop-app-updater.test.ts",
    "src/desktop/updates/desktop-updates.test.ts",
    "src/file-pane/document-preview/model.test.ts",
    "src/file-panels/catalog.test.ts",
    "src/file-panels/choice/model.test.ts",
    "src/file-panels/settings/rows.test.ts",
    "src/components/markdown/renderer.test.ts",
    "src/components/markdown/streaming.test.ts",
    "src/components/markdown/math/source.test.ts",
    "src/components/markdown/fence/mermaid/runtime/runtime-html.test.ts",
    "src/components/markdown/fence/mermaid/runtime/request-driver.test.ts",
    "src/utils/assistant-markdown-parser.test.ts",
    "src/attachments/service.test.ts",
    "src/data/push-router.test.ts",
    "src/agent-stream/bottom-anchor-controller.test.ts",
    "src/agent-stream/history-start-pagination.test.ts",
    "src/agent-stream/native-scroll-animation.test.ts",
    "src/agent-stream/native-disclosure-hold.test.ts",
    "src/agent-stream/render-strategy.test.ts",
    "src/composer/actions.test.ts",
    "src/hooks/use-image-attachment-picker.test.ts",
    "src/i18n/resources.test.ts",
    "src/components/download-toast.test.tsx",
    "src/stores/download-store.test.ts",
    "src/mobile-panels/gesture-intent.test.ts",
    "src/mobile-panels/gestures.test.tsx",
    "src/components/sidebar/sidebar-projection.test.ts",
    "src/panels/use-agent-panel-lookup.test.tsx",
    "src/polyfills/initialize-navigator.test.ts",
  ],
  browser: [
    "src/file-pane/document-preview/runtime.browser.test.ts",
    "src/components/markdown/math/enriched.browser.test.tsx",
    "src/components/markdown/fence/mermaid/runtime/runtime.browser.test.ts",
    "src/components/settings/row-density.browser.test.tsx",
    "src/assistant-selection-copy/content.browser.test.ts",
  ],
  e2e: [
    "e2e/browser/desktop-send-shortcut.spec.ts",
    "e2e/browser/sidebar-reorder.spec.ts",
    "e2e/browser/document-preview.spec.ts",
    "e2e/browser/mermaid-streaming.spec.ts",
    "e2e/browser/mermaid-fullscreen.spec.ts",
  ],
};
const { values } = parseArgs({ options: { suite: { type: "string", default: "unit" } } });
const files = suites[values.suite];
if (!files) throw new Error("Specify --suite unit, browser or e2e");
runNpm(
  values.suite === "e2e"
    ? ["run", "test:e2e", "--workspace=@getpaseo/app", "--", ...files, "--workers=1"]
    : [
        "run",
        "test",
        "--workspace=@getpaseo/app",
        "--",
        "--project",
        values.suite,
        ...files,
        "--maxWorkers=1",
        "--bail=1",
      ],
);
