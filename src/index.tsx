import { Hono } from 'hono'

type Bindings = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const app = new Hono<{ Bindings: Bindings }>()

// Fallback to static assets handled by Cloudflare Pages
app.get('/*', async (c) => {
  return await c.env.ASSETS.fetch(c.req.raw)
})

export default app
