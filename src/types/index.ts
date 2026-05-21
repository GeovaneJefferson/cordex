export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  tabType?: 'file' | 'flow';  // flow tabs are special
  flowSourceTabId?: string;    // which file tab spawned this flow
}

export interface HardwareInfo {
  total_ram_gb: number;
  free_ram_gb?: number;
  cpu_model?: string;
  cpu_cores?: number;
  platform?: string;
  has_gpu: boolean;
  gpu_vendor: string;
  gpu_name?: string;
  vram_mb?: number;
  gpu_backend?: 'cuda' | 'rocm' | 'metal' | 'vulkan' | 'cpu';
  gpu_layers?: number;
  gpu_reason?: string;
  cuda_version?: string | null;
  rocm_version?: string | null;
  llama_flags?: string[];
  capability: 'PRO' | 'MID' | 'LITE';
  canThink?: boolean;
  canFlow?: boolean;
  recommended_models?: { autocomplete: string; analysis: string };
  modelMap?: Record<string, string>;
}
