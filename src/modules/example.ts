import { Express, Request, Response } from 'express';

interface ModuleInfo {
    name: string;
    description: string;
    version: string;
    moduleVersion: string;
    author: string;
    license: string;
}

interface Module {
    info: ModuleInfo;
    init: (app: Express) => void;
}

const exampleModule: Module = {
    info: {
        name: "Example Module",
        description: "This is a sample module for the AirLink project. It demonstrates how to create and load modules dynamically with metadata.",
        version: "1.0.0",
        moduleVersion: "1.0.0",
        author: "AirLinkLab",
        license: "MIT",
    },

    init: (app: Express) => {
        app.get('/example', (req: Request, res: Response) => {
            res.send('Hello from Example Module!');
        });

        app.get('/example/info', (req: Request, res: Response) => {
            res.json({
                message: "This is the info endpoint of the Example Module.",
                module: "Example Module",
                author: "AirLinkLab"
            });
        });
    }
};

export default exampleModule;
