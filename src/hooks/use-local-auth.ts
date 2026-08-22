import { createContext, createElement, useContext, useState, useEffect, type ReactNode } from "react";
import { getSession, clearSession, type Session } from "@/lib/auth.ts";

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
  login: (session: Session) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setIsLoading(false);
  }, []);

  const login = (s: Session) => {
    setSession(s);
  };

  const logout = () => {
    clearSession();
    setSession(null);
  };

  return createElement(
    AuthContext.Provider,
    { value: { session, isLoading, login, logout } },
    children,
  );
}

export function useLocalAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within LocalAuthProvider");
  return ctx;
}
