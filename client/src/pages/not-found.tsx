import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Page Not Found</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/dashboard">
        <Button>
          <Home className="w-4 h-4 mr-2" />
          Go to Dashboard
        </Button>
      </Link>
    </div>
  );
}
