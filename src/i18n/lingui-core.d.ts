declare module '@lingui/core' {
  export interface I18n {
    _: (
      descriptor: MessageDescriptor,
      values?: Record<string, unknown>,
    ) => string;
    t: (
      descriptor: MessageDescriptor,
      values?: Record<string, unknown>,
    ) => string;
    load(locale: string, messages: Record<string, unknown>): void;
    activate(locale: string): void;
    readonly locale: string;
  }

  export interface MessageDescriptor {
    id: string;
    message?: string;
    comment?: string;
    values?: Record<string, unknown>;
  }

  export function setupI18n(): I18n;
  export const i18n: I18n;
}
