import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CompetitorList } from "@/components/dashboard/competitor-list";
import { CompetitorCard } from "@/components/dashboard/competitor-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Users } from "lucide-react";
import type { Profile, Competitor, FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function CompetitorsPage() {
  useEffect(() => { document.title = "Competitors - ReachInsta"; }, []);

  const { data: profile } = useQuery<Profile>({ queryKey: ["/api/profile"] });
  const { data: competitors = [] } = useQuery<Competitor[]>({ queryKey: ["/api/competitors"] });
  const { data: latestFetch } = useQuery<{ fetchRun: FetchRun; reels: Reel[]; stats: CompetitorStats[] } | null>({
    queryKey: ["/api/fetch/latest"],
  });

  const addCompetitorsMutation = useMutation({
    mutationFn: async (usernames: string[]) => {
      if (usernames.length === 1) {
        await apiRequest("POST", "/api/competitors", { username: usernames[0] });
      } else {
        await apiRequest("POST", "/api/competitors/bulk", { usernames });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/competitors"] }); },
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/competitors/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/competitors"] }); },
  });

  const clearAllCompetitorsMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", "/api/competitors"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/competitors"] }); },
  });

  const stats = latestFetch?.stats || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-6 h-6 text-text-secondary" strokeWidth={1.5} />
          <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary">
            Competitors
          </h1>
        </div>
        <p className="text-[15px] text-text-secondary">
          Manage your tracked Instagram competitors
          <span className="font-mono text-text-muted ml-1.5">
            ({competitors.length}/{profile?.maxCompetitors || 5})
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 lg:gap-6">
        {/* Left: add panel */}
        <div className="order-1">
          <CompetitorList
            competitors={competitors}
            maxCompetitors={profile?.maxCompetitors || 5}
            onAdd={async (usernames) => { await addCompetitorsMutation.mutateAsync(usernames); }}
            onRemove={async (id) => { await removeCompetitorMutation.mutateAsync(id); }}
            onClearAll={async () => { await clearAllCompetitorsMutation.mutateAsync(); }}
          />
        </div>

        {/* Right: analytics grid */}
        <div className="order-2">
          <h2 className="font-tight font-semibold text-[20px] lg:text-[22px] tracking-tighter-2 text-text-primary mb-4 lg:mb-6">
            Competitor Analytics
          </h2>

          {stats.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No analytics yet."
              description="Fetch data from the dashboard to see competitor analytics here."
              className="py-8"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {stats.map((stat) => (
                <CompetitorCard key={stat.id} stats={stat} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
