import { useTranslation } from "react-i18next";

const style = { flex: 1, width: "100%", minHeight: 0, border: 0, background: "white" } as const;

export function DocumentSurface({ html }: { html: string }) {
  const { t } = useTranslation();
  return (
    <iframe
      title={t("panels.file.editor.preview")}
      data-testid="document-preview"
      srcDoc={html}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={style}
    />
  );
}
