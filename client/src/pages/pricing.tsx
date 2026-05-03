import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PricingSection } from "@/components/PricingSection";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Profile } from "@shared/schema";

export default function PricingPage() {
  const { isAuthenticated } = useAuth();

  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-12">
        {isAuthenticated && (
          <div className="mb-10">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2 -ml-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        )}
        <PricingSection profile={profile} showHeader />
      </div>
    </div>
  );
}
