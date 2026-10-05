# Troubleshooting

## Panel won't start

**Check Docker services:**
```bash
docker-compose ps
docker-compose logs -f
```

**Check the API logs:**
```bash
# Development
pnpm dev
# Look for startup errors — usually missing env vars or DB connection failures

# Production
docker-compose -f docker-compose.prod.yml logs -f api
```

**Common causes:**
- `DATABASE_URL` pointing at wrong host/port
- PostgreSQL not running (`docker-compose up -d`)
- `SESSION_SECRET` too short (must be 32+ chars)
- Port 5000 or 3000 already in use

## Database connection errors

```
Error: Can't reach database server at 127.0.0.1:5434
```

```bash
docker-compose up -d postgres
docker-compose logs postgres
```

If the container starts but connections fail, check that `DATABASE_URL` uses the correct host. Inside Docker Compose services, use the service name (`postgres`). From the host, use `localhost:5434`.

## Prisma Client out of date

After changing `schema.prisma`:
```bash
cd apps/api
pnpm db:generate
```

After running migrations in a fresh checkout:
```bash
cd apps/api
pnpm db:migrate
pnpm db:generate
```

## TypeScript errors after pulling changes

```bash
pnpm install          # pick up new deps
cd apps/api
pnpm db:generate      # regenerate Prisma Client
pnpm typecheck        # verify
```

## Deployment fails / container won't start

**Check Nixpacks build logs:**
```bash
# In the dashboard, open the deployment → Build Logs tab
# Or via API:
GET /api/deployments/{id}/logs
```

**Common causes:**
- Missing `PORT` env var in the project's environment
- Build command fails (check `buildCmd` in project settings)
- Project needs `startCmd` set (for frameworks Nixpacks doesn't auto-detect)

**Manually check the container:**
```bash
docker ps -a | grep vexlyx
docker logs vexlyx-{project-name}-app-1
```

## Email not sending / receiving

**Check Postfix:**
```bash
docker-compose logs postfix
docker exec -it vexlyx-postfix mailq   # queue
```

**Check DNS for deliverability:**
- Verify SPF, DKIM, DMARC records in the panel under **Mail → Authentication**
- Use `dig TXT yourdomain.com` to confirm SPF record is live

**Check Dovecot (IMAP):**
```bash
docker-compose logs dovecot
```

## SSL certificate not issued

Traefik uses Let's Encrypt ACME. Common causes:

1. **Domain doesn't point to the server yet** — check `dig A yourdomain.com` returns your server IP
2. **Port 80 blocked** — Let's Encrypt HTTP-01 challenge requires port 80 to be open
3. **Rate limited** — Let's Encrypt has a 5 certificates/domain/week limit during testing; use staging environment

Check Traefik logs:
```bash
docker-compose logs traefik
```

## File Manager: extract fails

**`Command 'unzip' failed`** — install unzip on the host:
```bash
apt-get install -y unzip
```

**`Command 'zip' failed`** — install zip:
```bash
apt-get install -y zip
```

The installer script (`system/scripts/install.sh`) installs these automatically. If you're running without the installer, add them manually.

## Redis connection errors

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

```bash
docker-compose up -d redis
docker-compose logs redis
```

If running in production without Docker Compose, ensure Redis is running and `REDIS_URL` is correct.

## "Session invalid" / constant logouts

- Check that `SESSION_SECRET` is the same value on all API instances
- Check `COOKIE_DOMAIN` is set correctly when using subdomains
- Check Redis is running and not full

## Still stuck?

- Search [GitHub Issues](https://github.com/atlantiqs-org/vexlyx/issues)
- Ask in [GitHub Discussions](https://github.com/atlantiqs-org/vexlyx/discussions)
- Join Discord
