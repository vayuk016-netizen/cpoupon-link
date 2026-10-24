# Coupon Link Vault 🎟️

A private, modern web dashboard for tracking and organizing coupon links, redemption vouchers, and subscription offers (such as **Gemini Pro** 18-month promos and **Canva Pro** passes).

Built with **React 19**, **Vite**, **TailwindCSS**, and **TypeScript**, styled in a **Premium Dark Slate** aesthetic.

---

## ✨ Features

- **📂 Service Categories:** Filter and manage vouchers by service (**Gemini Pro**, **Canva Pro**, **ChatGPT Plus**, or custom services).
- **📊 Real-time Dashboard:** Track active links, items expiring soon (within 7 days), expired vouchers, and activated records.
- **🧭 Collapsible Sidebar & Search:** Fast navigation with keyboard shortcuts (`⌘K` to search, `⌘B` to collapse sidebar).
- **🔒 Privacy by Design:** 100% device-local storage via browser **IndexedDB** — your secret links never leave your machine without permission.
- **☁️ Supabase PostgreSQL Ready:** Complete database schema and index migration files provided in `app/migrations/`.
- **💾 JSON Backup & Restore:** One-click export and import of your entire archive.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) package manager (v1.2+) or Node.js (v20+)

### Installation & Run

1. Navigate to the `app` folder:
   ```bash
   cd app
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Launch development server:
   ```bash
   bun run dev
   ```

4. Open your browser at:
   ```
   http://localhost:5173
   ```

---

## 🗄️ Database Setup (Supabase)

If you wish to sync with Supabase PostgreSQL:
1. Copy `app/.env.example` to `app/.env`.
2. Add your Supabase PostgreSQL connection string to `DATABASE_URL`.
3. Run the migration script in `app/migrations/0002_supabase_schema.sql`.

---

## 📜 License

MIT License.
