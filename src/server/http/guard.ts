import type { MiddlewareHandler } from 'hono';

/**
 * Only the page this server serves may call the API.
 *
 * The Host check stops DNS rebinding (another site's name resolving to 127.0.0.1). For anything that
 * changes data, the custom header forces a CORS preflight that is never approved, and a foreign
 * Origin is refused outright. No CORS headers are ever sent, so other sites cannot read responses.
 */
export function createGuard(port: number): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));

  return async (c, next) => {
    const refuse = () => c.json({ error: { code: 'FORBIDDEN', message: '이 주소에서는 요청할 수 없어요' } }, 403);
    if (!hosts.has(c.req.header('host') ?? '')) return refuse();
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (c.req.header('x-spendprint') !== '1') return refuse();
      const origin = c.req.header('origin');
      if (origin !== undefined && !origins.has(origin)) return refuse();
    }
    await next();
  };
}
