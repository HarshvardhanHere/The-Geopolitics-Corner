# Geopolitical Knowledge Graph Platform

A curator-driven, self-hosted web application that visualizes real-world geopolitical events as an interactive knowledge graph. It renders the same manually curated dataset through two distinct visual lenses:
1. **Map View**: A geographic Leaflet.js canvas showing capital-to-capital connection lines between actor nations.
2. **Node View**: An abstract D3.js force-directed physics network showing node circles grouped by country cluster.

This project is built using Next.js (App Router), Tailwind CSS, Leaflet.js, D3.js, Prisma, and PostgreSQL.

---

## Curator Administration Guide

All database updates and manual ledger uploads are performed via the administrative console at `/admin`.

### Administrator Authentication
* Entry to `/admin` requires a password authentication key.
* The session persists in a secure cookie for **24 hours** or until the browser is closed.

### Password Reset Workflow
> [!IMPORTANT]
> There is no in-app password recovery or reset mechanism. 
> To reset or change the administrator password:
> 1. Log into your Vercel Dashboard.
> 2. Go to the project settings and locate the Environment Variables section.
> 3. Update the value of the `ADMIN_PASSWORD` variable.
> 4. Redeploy the application for the change to take effect.
>
> For local development, update the `ADMIN_PASSWORD` value inside the `.env` file in the root directory.

---

## Local Development Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root folder with:
   ```env
   DATABASE_URL="postgresql://<username>:<password>@<host>/<database>?sslmode=require"
   ADMIN_PASSWORD="your-secure-password"
   ```

3. **Database Migration**:
   Sync the database schema using Prisma:
   ```bash
   npx prisma db push
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Geopolitical Capital Coordinates Mapping

Latitude and longitude coordinates for country capitals are mapped statically in [capitals.ts](file:///C:/Users/Admin/.gemini/antigravity-ide/scratch/geopnodes/lib/capitals.ts).

To add a new country in the future, simply add a new key-value entry directly into the `CAPITALS` object in [capitals.ts](file:///C:/Users/Admin/.gemini/antigravity-ide/scratch/geopnodes/lib/capitals.ts):

```typescript
export const CAPITALS: { [countryName: string]: { lat: number; lng: number } } = {
  // ... existing countries ...
  "Your New Country": { lat: 12.3456, lng: 78.9012 }
};
```
Ensure the key string matches exactly the actor or parent country name used in your Excel ledger workbook.

