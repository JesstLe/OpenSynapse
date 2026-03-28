import { useEffect, useState } from "react";
import { authClient } from "../auth/client";

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await authClient.getSession();
      setSession(data);
      setIsLoading(false);
    };
    checkSession();
  }, []);

  return {
    user: session?.user,
    isLoggedIn: !!session,
    isLoading,
  };
}

export function useRequireAuth() {
  const { user, isLoggedIn, isLoading } = useAuth();

  return {
    user,
    isLoggedIn,
    isLoading,
    isAuthenticated: !isLoading && isLoggedIn,
  };
}
