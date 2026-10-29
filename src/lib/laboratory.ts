export interface LaboratoryAsset {
  id: string;
  name: string;
  type: string;
  quantity: string;
  status?: string;
  lastChecked?: { toDate: () => Date } | null;
}

export interface LaboratoryAnalysisResult {
  synthesis: string;
  recommendations: string[];
}
