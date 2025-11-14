This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Docker Deployment auf QNAP NAS

### Voraussetzungen
- QNAP NAS mit Container Station
- Git-Zugriff auf das Repository

### Schnellstart

1. **Projekt auf QNAP klonen**:
   ```bash
   cd /share/Container
   git clone https://github.com/your-repo/mgh-app.git
   cd mgh-app
   ```

2. **Umgebungsvariablen setzen**:
   ```bash
   cp .env.example .env
   nano .env  # Anpassen
   ```

3. **NEXTAUTH_SECRET generieren**:
   ```bash
   openssl rand -base64 32
   ```

4. **Volumes vorbereiten**:
   ```bash
   mkdir -p data uploads
   chmod 777 data uploads
   ```

5. **Container bauen und starten**:
   ```bash
   docker-compose up -d
   ```

6. **Erste Migration und Seed**:
   ```bash
   docker-compose exec mgh-app npx prisma migrate deploy
   docker-compose exec mgh-app npx prisma db seed
   ```

7. **Zugriff testen**:
   - App: `http://qnap-ip:4000`
   - Login mit Seed-User aus `prisma/seed.ts`

### Updates
Siehe [UPDATE.md](./UPDATE.md) für detaillierte Update-Anleitung.

### Wichtige Hinweise
- **Port 4000** ist frei wählbar (in docker-compose.yml anpassen)
- **Volumes** unter `./data` und `./uploads` bleiben bei Updates erhalten
- **Backups** sollten regelmäßig von `./data/production.db` erstellt werden
- **Logs** mit `docker-compose logs -f` überwachen

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
