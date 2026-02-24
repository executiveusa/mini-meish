# mini-meish

Meish Defense Dashboard with persistent storage and AI assistant.

## One-click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/executiveusa/mini-meish&project-name=mini-meish)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/executiveusa/mini-meish)

## Live Project IDs

- Vercel Project ID: `prj_PZbKk5mywAPRWy8RIyVbCnbVhFgy`
- Railway Project ID: `66946c9c-665a-47c0-8aa9-c41e3b9f29e2`

## Runtime Modes

- Vercel mode: Uses `api/chat.js` and `api/test.js` serverless functions.
- Railway/Docker mode: Uses `server.js` to serve `public/` and the same API handlers.

## Required Environment Variables

For Vercel and Railway:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `OPENAI_API_KEY`

## Local Docker Run

```bash
docker build -t mini-meish .
docker run --rm -p 3000:3000 \
	-e ANTHROPIC_API_KEY=your_key \
	-e SUPABASE_URL=your_supabase_url \
	-e SUPABASE_SERVICE_ROLE_KEY=your_service_role \
	mini-meish
```

Open `http://localhost:3000`.

## Railway CLI Setup

Install CLI:

```bash
npm install -g @railway/cli
```

Authenticate with token:

```bash
$env:RAILWAY_TOKEN="<your_token>"
railway whoami
```

Link the project:

```bash
railway link --project 66946c9c-665a-47c0-8aa9-c41e3b9f29e2
```

Deploy:

```bash
railway up
```

## Notes

- If `railway whoami` returns unauthorized, the token is invalid or lacks access to that project.
- Health endpoint is available at `/health`.
- API diagnostics endpoint is available at `/api/test`.
