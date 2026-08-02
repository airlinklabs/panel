declare module 'better-sqlite3' {
  interface DatabaseOptions {
    fileMustExist?: boolean;
    timeout?: number;
    readonly?: boolean;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    pragma(source: string, simplify?: boolean | unknown): unknown;
    close(): void;
  }

  export default Database;
}