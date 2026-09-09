import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PreloaderScreen } from "@/components/PreloaderScreen";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Tracking from "./pages/Tracking";
import InvoiceGenerator from "./pages/InvoiceGenerator";
import InvoiceHome from "./pages/InvoiceHome";
import MultiBlInvoice from "./pages/MultiBlInvoice";
import NocTracker from "./pages/NocTracker";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [showPreloader, setShowPreloader] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {showPreloader && (
            <PreloaderScreen onComplete={() => setShowPreloader(false)} />
          )}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/tracking" element={<Tracking />} />
              <Route path="/invoice-home" element={<InvoiceHome />} />
              <Route path="/invoice-generator" element={<InvoiceGenerator />} />
              <Route path="/multi-bl-invoice" element={<MultiBlInvoice />} />
              <Route path="/noc-tracker" element={<NocTracker />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <MobileBottomNav />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
