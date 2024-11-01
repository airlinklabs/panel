import { Express, Request, Response } from 'express';

interface ModuleInfo {
    name: string;
    description: string;
    version: string;
    moduleVersion: string;
    author: string;
    license: string;
}
  
export interface Module {
    info: ModuleInfo;
    init: (app: Express) => void;
}