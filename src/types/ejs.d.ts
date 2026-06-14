declare module 'ejs' {
  type Callback = (err: Error | null, str: string) => void;
  interface RenderOptions {
    [key: string]: unknown;
  }
  interface EjsModule {
    __express?: (path: string, data: RenderOptions, cb: Callback) => void;
    renderFile(path: string, data: RenderOptions, cb: Callback): void;
    renderFile(
      path: string,
      data: RenderOptions,
      options: RenderOptions,
      cb: Callback,
    ): void;
  }
  const ejs: EjsModule;
  export = ejs;
}
