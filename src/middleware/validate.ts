import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ error: 'invalid_input', details: result.error.flatten() });
      }
      return res.redirect('back');
    }
    req.body = result.data; // replace with sanitised data
    next();
  };
}
