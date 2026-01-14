import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CompetitorList } from "@/components/dashboard/competitor-list";
import { CompetitorCard } from "@/components/dashboard/competitor-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Users } from "lucide-react";
import type { Profile, Competitor, FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function CompetitorsPage() {
  const { toast } = useToast();

  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["/api/competitors"],
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });

  const stats = latestFetch?.stats || [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="w-6 h-6" />
          Competitors
        </h1>
        <p className="text-muted-foreground">
          Manage your tracked Instagram competitors ({competitors.length}/{profile?.maxCompetitors || 5})
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CompetitorList
            competitors={competitors}
            maxCompetitors={profile?.maxCompetitors || 5}
            onAdd={async (usernames) => {
              await addCompetitorsMutation.mutateAsync(usernames);
              toast({
                title: "Competitors added",
                description: `${usernames.length} competitor(s) added successfully.`,
              });
            }}
            onRemove={async (id) => {
              await removeCompetitorMutation.mutateAsync(id);
              toast({
                title: "Competitor removed",
                description: "The competitor has been removed from your list.",
              });
            }}
          />
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Competitor Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No Analytics Yet"
                  description="Fetch data from the dashboard to see competitor analytics here."
                  className="py-8"
                />
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {stats.map((stat) => (
                    <CompetitorCard key={stat.id} stats={stat} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
