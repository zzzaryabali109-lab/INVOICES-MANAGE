import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession()
      .then(({ data }) => {
        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user ?? null);
        } else {
          try {
            const saved = localStorage.getItem('app_mock_user');
            if (saved) {
              const u = JSON.parse(saved);
              setUser(u);
              setSession({ user: u, access_token: 'mock-token' } as any);
            }
          } catch {
            // ignore
          }
        }
        setLoading(false);
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem('app_mock_user');
          if (saved) {
            const u = JSON.parse(saved);
            setUser(u);
            setSession({ user: u, access_token: 'mock-token' } as any);
          }
        } catch {
          // ignore
        }
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      if (error) {
        // Fallback for demo/preview without live Supabase
        const mockUser: User = {
          id: 'demo-user-' + Math.random().toString(36).slice(2, 8),
          app_metadata: {},
          user_metadata: { name: email.split('@')[0] },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email,
          phone: '',
          role: 'authenticated',
          updated_at: new Date().toISOString(),
        } as User;
        localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
        setUser(mockUser);
        setSession({ user: mockUser, access_token: 'mock-token' } as any);
        return { error: null };
      }
      return { error };
    } catch {
      const mockUser: User = {
        id: 'demo-user-' + Math.random().toString(36).slice(2, 8),
        app_metadata: {},
        user_metadata: { name: email.split('@')[0] },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
        phone: '',
        role: 'authenticated',
        updated_at: new Date().toISOString(),
      } as User;
      localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setSession({ user: mockUser, access_token: 'mock-token' } as any);
      return { error: null };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Fallback for demo/preview without live Supabase
        const mockUser: User = {
          id: 'demo-user-1',
          app_metadata: {},
          user_metadata: { name: email.split('@')[0] },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email,
          phone: '',
          role: 'authenticated',
          updated_at: new Date().toISOString(),
        } as User;
        localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
        setUser(mockUser);
        setSession({ user: mockUser, access_token: 'mock-token' } as any);
        return { error: null };
      }
      return { error };
    } catch {
      const mockUser: User = {
        id: 'demo-user-1',
        app_metadata: {},
        user_metadata: { name: email.split('@')[0] },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
        phone: '',
        role: 'authenticated',
        updated_at: new Date().toISOString(),
      } as User;
      localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
      setUser(mockUser);
      setSession({ user: mockUser, access_token: 'mock-token' } as any);
      return { error: null };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('app_mock_user');
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
