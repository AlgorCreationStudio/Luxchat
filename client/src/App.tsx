import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/use-auth-store";
import { InstallPrompt } from "@/components/install-prompt";
import { UpdateBanner } from "@/components/update-banner";

// Pages
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

function Router() {
  const user = useAuthStore(state => state.user);

  return (
    <Switch>
      <Route path="/">
        {user ? <Redirect to="/app" /> : <AuthPage />}
      </Route>
      <Route path="/app" component={DashboardPage} />
      <Route path="/chat/:id" component={DashboardPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <UpdateBanner />
        <InstallPrompt />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
