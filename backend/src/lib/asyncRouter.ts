import { Router, RequestHandler } from 'express';

// Express 4 does not catch rejected promises from async handlers; route them to the error handler instead.
export function asyncRouter() {
  const router = Router();
  for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
    const original = router[method].bind(router) as (...args: any[]) => any;
    (router as any)[method] = (path: any, ...handlers: RequestHandler[]) =>
      original(
        path,
        ...handlers.map((h): RequestHandler => (req, res, next) => {
          try {
            const result: any = h(req, res, next);
            if (result && typeof result.catch === 'function') result.catch(next);
          } catch (err) {
            next(err);
          }
        })
      );
  }
  return router;
}
