import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Learn from "./pages/Learn";
import Roadmap from "./pages/Roadmap";
import Flashcards from "./pages/Flashcards";
import Quiz from "./pages/Quiz";
import Mindmap from "./pages/Mindmap";
import MyMindmaps from "./pages/MyMindmaps";
import MyFlashcards from "./pages/MyFlashcards";
import MyQuizzes from "./pages/MyQuizzes";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/auth" element={<Auth />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/learn" element={<ProtectedRoute><Learn /></ProtectedRoute>} />
    <Route path="/roadmap/:topicId" element={<ProtectedRoute><Roadmap /></ProtectedRoute>} />
    <Route path="/flashcards/:topicId" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
    <Route path="/quiz/:topicId" element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
    <Route path="/mindmap/:mindmapId" element={<ProtectedRoute><Mindmap /></ProtectedRoute>} />
    <Route path="/my-mindmaps" element={<ProtectedRoute><MyMindmaps /></ProtectedRoute>} />
    <Route path="/my-flashcards" element={<ProtectedRoute><MyFlashcards /></ProtectedRoute>} />
    <Route path="/my-quizzes" element={<ProtectedRoute><MyQuizzes /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
