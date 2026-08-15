# Gateway

Thin Express app that sits in front of the two independent applications in this repo
and serves a system-selection screen. It does not contain business logic — it's just
routing.

```
/              -> selection page (this folder's public/index.html)
/api/*         -> proxied unchanged to CALLS (../server.js, port 5002)
/calls/*       -> proxied (prefix stripped) to CALLS
/ai-sales/*    -> AI Sales frontend static build + /ai-sales/api/* proxied
                  (prefix stripped) to the AI Sales backend (port 4000)
```

Neither CALLS nor the AI Sales backend/frontend needed any route changes to make this
work — CALLS' frontend already calls `/api/...` as a root-relative path, so those
requests reach it correctly regardless of which page issued them; AI Sales' frontend
is built with `base: '/ai-sales/'` so its own asset/API paths are already correct for
this mount point.

## Local development

```bash
npm install
cp .env.example .env
npm run dev   # port 5000 by default
```

Requires CALLS (port 5002) and the AI Sales backend (port 4000) to already be running,
and the AI Sales frontend to be built (`cd ../ai-sales-call-analyzer/frontend && npm run build`) —
the gateway serves that build's `dist/` folder as static files.

## Production

Started as its own pm2 process (`ecosystem.config.js`, name `gateway`) by
`.github/workflows/deploy.yml`. The VPS's nginx `proxy_pass` gets pointed at this
gateway's port instead of straight at CALLS — see the root repo's deploy workflow for
the exact (self-healing: falls back to CALLS directly if the gateway isn't responding)
logic.
