import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Status = "loading" | "signed-in" | "signed-out" | "error";
type SessionContextValue = {
  status: Status;
  refresh: () => Promise<void>;
  logout: () => Promise<boolean>;
  loggingOut: boolean;
  logoutError: string;
};
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const generation = useRef(0);
  const logoutInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setStatus("loading");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Session lookup failed");
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("authenticated" in result) ||
          typeof result.authenticated !== "boolean") throw new Error("Invalid session response");
      if (request === generation.current) setStatus(result.authenticated ? "signed-in" : "signed-out");
    } catch {
      if (request === generation.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);

  const logout = useCallback(async () => {
    if (logoutInFlight.current) return false;
    logoutInFlight.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/logout", {
        method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!response.ok) throw new Error("Logout failed");
      generation.current++;
      setStatus("signed-out");
      return true;
    } catch {
      setLogoutError("Could not log out. Please try again.");
      return false;
    } finally {
      logoutInFlight.current = false;
      setLoggingOut(false);
    }
  }, []);

  return <SessionContext.Provider value={{ status, refresh, logout, loggingOut, logoutError }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
