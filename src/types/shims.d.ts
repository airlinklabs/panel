declare var global: any;
declare var process: any;
declare function require(name: string): any;

declare class Buffer {
  static from(data: any, encoding?: string): Buffer;
  static concat(list: readonly Buffer[], totalLength?: number): Buffer;
  static isBuffer(value: any): boolean;
  toString(encoding?: string): string;
}

declare namespace NodeJS {
  interface Timeout {}
}

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): NodeJS.Timeout;
declare function clearTimeout(timeoutId: NodeJS.Timeout | undefined): void;

declare module 'express' {
  export interface Request {
    [key: string]: any;
    body?: any;
    params?: any;
    query?: any;
    headers?: any;
    user?: any;
    session?: any;
    ip?: string;
    socket?: any;
  }

  export interface Response {
    [key: string]: any;
    locals?: any;
    render?: any;
    json?: any;
    status?: any;
    send?: any;
    redirect?: any;
  }

  export type NextFunction = (...args: any[]) => void;
  export type RequestHandler = (...args: any[]) => any;
  export type Express = any;
  export type Router = any;
  export const Router: any;
  const express: any;
  export default express;
}

declare module 'express-serve-static-core' {
  export type Express = any;
  export type Router = any;
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
}

declare module 'ws' {
  export class WebSocket {
    static readonly OPEN: number;
    static readonly CONNECTING: number;
    [key: string]: any;
    constructor(...args: any[]);
    send(...args: any[]): any;
    close(...args: any[]): any;
    on(...args: any[]): any;
    addEventListener(...args: any[]): any;
  }
  export class Server {
    [key: string]: any;
  }
  const ws: any;
  export default ws;
}

declare module 'axios' {
  export type InternalAxiosRequestConfig = any;
  const axios: any;
  export default axios;
}

declare module 'bcryptjs' {
  const bcrypt: any;
  export default bcrypt;
}

declare module 'multer' {
  const multer: any;
  export default multer;
}

declare module 'validator' {
  const validator: any;
  export default validator;
}

declare module 'path' {
  const path: any;
  export = path;
}

declare module 'fs' {
  const fs: any;
  export = fs;
}

declare module '@prisma/client' {
  export const Prisma: any;
  export type PrismaClient = any;
  export const PrismaClient: any;
  export type Users = any;
  export type Session = any;
  export type Server = any;
  export type Images = any;
  export type Node = any;
  export type settings = any;
  export type ServerFolder = any;
  export type ServerFolderMember = any;
  export type ApiKey = any;
  export type LoginHistory = any;
  export type PlayerStats = any;
  export type Addon = any;
  export type Backup = any;
  const client: any;
  export default client;
}

// Prisma client shim for generated client path used in source imports.
declare module '../generated/prisma/client' {
  export const Prisma: any;
  export type PrismaClient = any;
  export const PrismaClient: any;
  export type Users = any;
  export type Session = any;
  export type Server = any;
  export type Images = any;
  export type Node = any;
  export type settings = any;
  export type ServerFolder = any;
  export type ServerFolderMember = any;
  export type ApiKey = any;
  export type LoginHistory = any;
  export type PlayerStats = any;
  export type Addon = any;
  export type Backup = any;
  const client: any;
  export default client;
}
