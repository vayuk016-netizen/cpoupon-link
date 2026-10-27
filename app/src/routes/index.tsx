import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AMFLogin } from "../components/AMFLogin";
import { ToolsDashboard } from "../components/dashboard/ToolsDashboard";
import { getActiveSession, clearActiveSession, type AuthUser } from "../lib/auth-storage";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    return getActiveSession();
  });

  useEffect(() => {
    const session = getActiveSession();
    if (session) {
      setCurrentUser(session);
    }
  }, []);

  if (!currentUser) {
    return (
      <AMFLogin
        onLoginSuccess={() => {
          const session = getActiveSession();
          setCurrentUser(
            session || {
              id: "usr_active",
              email: "amf.express99@gmail.com",
              name: "Sok Sopha",
              password: "",
              role: "admin",
              createdAt: new Date().toISOString(),
            }
          );
        }}
      />
    );
  }

  return (
    <ToolsDashboard
      currentUser={currentUser}
      onSignOut={() => {
        clearActiveSession();
        setCurrentUser(null);
      }}
    />
  );
}

