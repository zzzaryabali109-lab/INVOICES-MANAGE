import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, FileQuestion } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center p-8 rounded-3xl bg-card border border-white/80 dark:border-white/10 shadow-neu">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-primary">
          <FileQuestion className="w-8 h-8" />
        </div>
        <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-sm text-muted-foreground">Oops! The page you are looking for does not exist.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-neu hover:shadow-neu-hover active:scale-[0.98] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
