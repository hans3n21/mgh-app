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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

### Voraussetzungen

1. **Vercel Account** erstellen
2. **Vercel Blob Storage** aktivieren (für File-Uploads)
3. **Umgebungsvariablen** in Vercel Dashboard setzen:
   - `DATABASE_URL` - PostgreSQL Connection String
   - `BLOB_READ_WRITE_TOKEN` - Vercel Blob Storage Token (automatisch gesetzt)
   - `NEXTAUTH_SECRET` - Secret für NextAuth
   - `NEXTAUTH_URL` - Deine Vercel-URL
   - Weitere ENV-Variablen je nach Bedarf (IMAP, etc.)

### Deployment

1. **Repository mit Vercel verbinden**:
   - Vercel Dashboard → New Project
   - Repository auswählen
   - Build Settings automatisch erkannt

2. **Environment Variables setzen** (siehe oben)

3. **Deploy**:
   - Vercel führt automatisch `npm install` aus
   - `postinstall` Script führt `prisma generate` aus
   - Build wird automatisch gestartet

### Wichtige Hinweise

- **File-Uploads**: Nutzen Vercel Blob Storage (automatisch konfiguriert)
- **Database**: PostgreSQL wird empfohlen (z.B. Vercel Postgres oder externe DB)
- **Prisma**: Migrations müssen manuell ausgeführt werden (`prisma migrate deploy`)

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
