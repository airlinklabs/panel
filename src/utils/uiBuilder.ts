export interface ButtonConfig {
  label: string;
  variant: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  href?: string;
  extraClass?: string;
  disabled?: boolean;
}

export interface TableConfig {
  columns: { key: string; label: string; class?: string }[];
  rows: Record<string, unknown>[];
  rowHref?: string;
  emptyLabel: string;
  emptySubtext?: string;
  emptyIcon?: string;
}

export interface BadgeConfig {
  label: string;
  variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info';
  dot?: boolean;
}

export interface AlertConfig {
  variant: 'warning' | 'error' | 'info' | 'success';
  title: string;
  body?: string;
  action?: { label: string; onClick: string };
}

export interface InputConfig {
  id: string;
  name: string;
  type?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
}

export class UIBuilder {
  static button(config: ButtonConfig): ButtonConfig {
    return { size: 'md', type: 'button', disabled: false, ...config };
  }

  static table(config: TableConfig): TableConfig {
    return config;
  }

  static badge(config: BadgeConfig): BadgeConfig {
    return config;
  }

  static alert(config: AlertConfig): AlertConfig {
    return config;
  }

  static input(config: InputConfig): InputConfig {
    return { type: 'text', required: false, disabled: false, ...config };
  }
}
