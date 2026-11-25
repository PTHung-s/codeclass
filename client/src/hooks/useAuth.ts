import { useState, useEffect } from "react";
import api, { onUnauthorized } from "../lib/api";

interface User {
  id: string;
  fullName: string;
  nickname?: string | null;
  email: string;
  role: string;
  avatarUrl?: string;
  unlockedEmojis?: string;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem("token"),
    loading: true,
  });

  useEffect(() => {
    if (state.token) {
      api
        .get("/auth/me")
        .then((res) => {
          setState((prev) => ({ ...prev, user: res.data, loading: false }));
        })
        .catch(() => {
          localStorage.removeItem("token");
          setState({ user: null, token: null, loading: false });
        });
    } else {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  // Any API call returning 401 (expired/revoked token) clears the session in
  // the UI too — ProtectedRoute then redirects to /login automatically.
  useEffect(() => {
    return onUnauthorized(() => {
      setState({ user: null, token: null, loading: false });
    });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { user, token } = res.data;
    localStorage.setItem("token", token);
    setState({ user, token, loading: false });
    return user;
  };

  const register = async (fullName: string, email: string, password: string) => {
    const res = await api.post("/auth/register", { fullName, email, password });
    const { user, token } = res.data;
    localStorage.setItem("token", token);
    setState({ user, token, loading: false });
    return user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setState({ user: null, token: null, loading: false });
  };

  return { ...state, login, register, logout };
}
