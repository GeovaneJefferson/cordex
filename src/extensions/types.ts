// src/extensions/types.ts

export interface ExtensionCapability {
  id: string;
  label: string;
  description?: string;
  defaultEnabled?: boolean;
}

export interface ExtensionConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  default: string | number | boolean;
  label: string;
}

export interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  icon?: string;
  iconColor?: string;
  category: string;
  status: 'installed' | 'available' | 'error';
  enabled: boolean;
  capabilities: ExtensionCapability[];
  installNote?: string;
  configSchema?: Record<string, ExtensionConfigField>;
}

export type ExtensionCategory = 'language' | 'formatter' | 'linter' | 'ai' | 'theme' | 'tool';
