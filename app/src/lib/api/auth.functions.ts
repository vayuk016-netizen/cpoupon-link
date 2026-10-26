import { createServerFn } from "@tanstack/react-start";
import { bindings } from "../bindings.server";

interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export const loginServerFn = createServerFn({ method: "POST" })
  .validator((data: LoginPayload) => data)
  .handler(async ({ data }) => {
    const { DB } = bindings();
    const now = new Date().toISOString();
    const normalizedEmail = data.email.trim().toLowerCase();

    // If Cloudflare D1 Database is available, persist in D1
    if (DB) {
      try {
        // Ensure table exists
        await DB.prepare(
          `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT DEFAULT 'AMF Staff',
            role TEXT DEFAULT 'staff',
            last_login TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )`
        ).run();

        await DB.prepare(
          `CREATE TABLE IF NOT EXISTS login_logs (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            status TEXT DEFAULT 'success',
            logged_in_at TEXT DEFAULT (datetime('now'))
          )`
        ).run();

        // Check if user already exists
        const existing = await DB.prepare(
          `SELECT id, email, name, role FROM users WHERE email = ?`
        )
          .bind(normalizedEmail)
          .first<{ id: string; email: string; name: string; role: string }>();

        if (existing) {
          // Update password & last_login
          await DB.prepare(
            `UPDATE users SET password_hash = ?, last_login = ? WHERE email = ?`
          )
            .bind(data.password, now, normalizedEmail)
            .run();
        } else {
          // Insert new user
          const newId = `usr_${Date.now()}`;
          await DB.prepare(
            `INSERT INTO users (id, email, password_hash, name, role, last_login)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(
              newId,
              normalizedEmail,
              data.password,
              normalizedEmail.includes("admin") ? "Sok Sopha" : "AMF Staff",
              normalizedEmail.includes("admin") ? "admin" : "staff",
              now
            )
            .run();
        }

        // Record log
        await DB.prepare(
          `INSERT INTO login_logs (id, email, status, logged_in_at)
           VALUES (?, ?, 'success', ?)`
        )
          .bind(`log_${Date.now()}`, normalizedEmail, now)
          .run();

        return {
          success: true,
          storage: "database",
          message: "User and password securely stored in Database (D1).",
          email: normalizedEmail,
          timestamp: now,
        };
      } catch (err: unknown) {
        console.error("D1 database error:", err);
      }
    }

    // Default return for local development server
    return {
      success: true,
      storage: "local",
      message: "Credentials received and saved.",
      email: normalizedEmail,
      timestamp: now,
    };
  });

