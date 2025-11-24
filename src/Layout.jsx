import { Link } from "wasp/client/router";
import { useAuth, logout } from "wasp/client/auth";
import { Outlet } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Separator } from "./components/ui/separator";
import { LogOut, User, Store, Settings } from "lucide-react";
import { ErrorBoundary } from "./components/errors/ErrorBoundary";
import "./Main.css";

export const Layout = () => {
  const { data: user } = useAuth();

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link to="/" className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <Store className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h1 className="text-xl font-bold text-foreground">RetailAnalytics</h1>
                </Link>
                {user && (
                  <nav className="hidden md:flex items-center space-x-6">
                    <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Dashboard
                    </Link>
                    <Link to="/upload" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Upload
                    </Link>
                    <Link to="/ordering" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Ordering
                    </Link>
                    <Link to="/actions" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Actions
                    </Link>
                    <Link to="/brand-mapping" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Brand Mapping
                    </Link>
                    <Link to="/product-catalog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Product Catalog
                    </Link>
                    <Link to="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Categories
                    </Link>
                    <Link to="/stores" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Stores
                    </Link>
                  </nav>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {user ? (
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {user.identities.username?.id}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    </div>
                    <Separator orientation="vertical" className="h-6" />
                    <Link to="/settings">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={logout}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                ) : (
                  <Link to="/login">
                    <Button variant="outline" size="sm">
                      Log in
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="border-t bg-muted/50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                RetailAnalytics ~ Powered by Wasp
              </p>
              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                <span>Version 1.0.0</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Cannabis Retail Analytics</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
};
