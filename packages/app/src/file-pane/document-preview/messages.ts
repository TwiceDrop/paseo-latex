import type { DocumentKind } from "./model";

export interface DocumentLabels {
  loading: string;
  failed: string;
  retry: string;
  previous: string;
  next: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  sheet: string;
  limitedColumns: string;
  legacy: string;
}

export interface DocumentRequest {
  kind: DocumentKind;
  base64: string;
  labels: DocumentLabels;
}
