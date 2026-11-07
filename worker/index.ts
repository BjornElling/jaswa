/**
 * The published JASWA is static files, with one exception: the game's artwork.
 *
 * Monster, rune and artifact images are the game's, so they are never committed
 * (.gitignore), and a site built from git therefore has none. They live in an
 * R2 bucket instead, uploaded by `npm run upload:artwork`, and this Worker is
 * the one door to them. `run_worker_first` in wrangler.jsonc sends only those
 * three paths here; every other request is answered by the static assets
 * without running any code.
 *
 * A missing image answers 404, never the application shell: the shell is what
 * the asset fallback returns for an unknown path, and an `<img>` handed HTML is
 * a broken image where the page would otherwise show the monster's initial.
 */

type R2Object = {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
};

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ARTWORK: { get(key: string): Promise<R2Object | null> };
};

const artworkPath = /^\/(monster-images|rune-images|artifact-images)\/[A-Za-z0-9._-]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!artworkPath.test(pathname)) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const object = await env.ARTWORK.get(pathname.slice(1));
    if (!object) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    /* A file name never changes its picture: a new piece of artwork arrives
       under a new name from the catalogue, so a day of caching costs nothing
       and saves every table a few hundred requests. */
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  },
};
