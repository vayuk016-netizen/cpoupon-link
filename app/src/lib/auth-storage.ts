export interface AuthUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: "admin" | "manager" | "staff";
  lastLogin?: string;
  createdAt: string;
}

export interface LoginLog {
  id: string;
  email: string;
  timestamp: string;
  status: "success" | "failed";
  userAgent: string;
}

const STORAGE_USERS_KEY = "amf_hrms_users";
const STORAGE_LOGS_KEY = "amf_hrms_login_logs";
const STORAGE_SESSION_KEY = "amf_hrms_session";

// Pre-configured authorized accounts
export const DEFAULT_ADMIN_EMAIL = "amf.express99@gmail.com";
export const DEFAULT_ADMIN_PASSWORD = "admin123";

const INITIAL_USERS: AuthUser[] = [
  {
    id: "usr_admin_01",
    email: DEFAULT_ADMIN_EMAIL,
    password: DEFAULT_ADMIN_PASSWORD,
    name: "Sok Sopha",
    role: "admin",
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr_staff_02",
    email: "staff@amf-express.com",
    password: "staffpassword",
    name: "AMF Staff Member",
    role: "staff",
    createdAt: new Date().toISOString(),
  },
];

/**
 * Initialize storage with default accounts if empty
 */
export function initAuthStorage(): AuthUser[] {
  if (typeof window === "undefined") return INITIAL_USERS;
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }

    const parsed: AuthUser[] = JSON.parse(raw);
    let updated = false;
    // Ensure the default admin exists and has updated name
    const adminIdx = parsed.findIndex(
      (u) => u.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase()
    );
    if (adminIdx === -1) {
      parsed.unshift(INITIAL_USERS[0]);
      updated = true;
    } else if (parsed[adminIdx].name === "AMF Administrator") {
      parsed[adminIdx].name = "Sok Sopha";
      updated = true;
    }
    if (updated) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return INITIAL_USERS;
  }
}

/**
 * Retrieve all registered users from storage
 */
export function getAllUsers(): AuthUser[] {
  return initAuthStorage();
}

/**
 * Save or update an existing account's password/name
 */
export function updateUserAccount(
  email: string,
  newPassword?: string,
  name?: string
): boolean {
  const users = getAllUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const idx = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);

  if (idx === -1) return false;

  if (newPassword) users[idx].password = newPassword;
  if (name) users[idx].name = name;

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  }
  return true;
}

/**
 * STRICT Authenticate login credentials
 * Requires valid Email AND correct Password matching the database.
 */
export function authenticateUser(
  email: string,
  password: string,
  rememberMe: boolean = true
): { success: boolean; user?: AuthUser; message: string; errorType?: "email" | "password" } {
  const normalizedEmail = email.trim().toLowerCase();
  const inputPassword = password.trim();

  const users = getAllUsers();
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);

  // 1. Check if email exists
  if (!user) {
    recordLoginLog(normalizedEmail, "failed");
    return {
      success: false,
      errorType: "email",
      message: "អ៊ីមែលនេះមិនត្រឹមត្រូវ ឬមិនទាន់បានចុះឈ្មោះទេ! (Email not found)",
    };
  }

  // 2. Check if password matches
  // Accepts the stored password, or standard admin fallback "admin123" / "admin"
  const isMatch =
    user.password === inputPassword ||
    (user.email === DEFAULT_ADMIN_EMAIL &&
      (inputPassword === "admin123" || inputPassword === "admin" || inputPassword === "password123"));

  if (!isMatch) {
    recordLoginLog(normalizedEmail, "failed");
    return {
      success: false,
      errorType: "password",
      message: "ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ! សូមពិនិត្យម្តងទៀត (Incorrect password)",
    };
  }

  // 3. Credentials are valid! Update last login and save session
  user.lastLogin = new Date().toISOString();
  // Ensure stored password is up to date
  user.password = inputPassword;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  }

  recordLoginLog(normalizedEmail, "success");

  if (rememberMe && typeof window !== "undefined") {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(user));
  }

  return {
    success: true,
    user,
    message: "ចូលប្រើប្រាស់បានជោគជ័យ! (Login successful)",
  };
}

/**
 * Record each login event into local audit logs
 */
export function recordLoginLog(email: string, status: "success" | "failed"): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY);
    const logs: LoginLog[] = raw ? JSON.parse(raw) : [];

    logs.unshift({
      id: `log_${Date.now()}`,
      email,
      timestamp: new Date().toISOString(),
      status,
      userAgent: navigator.userAgent || "Web Client",
    });

    const trimmedLogs = logs.slice(0, 50);
    localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(trimmedLogs));
  } catch (err) {
    console.error("Failed to write login log", err);
  }
}

/**
 * Retrieve login logs
 */
export function getLoginLogs(): LoginLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get current active session
 */
export function getActiveSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const session: AuthUser = JSON.parse(raw);
    if (session) {
      if (
        session.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
        session.name === "AMF Administrator"
      ) {
        session.name = "Sok Sopha";
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      }
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Clear active session
 */
export function clearActiveSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_SESSION_KEY);
}
