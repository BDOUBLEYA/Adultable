import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import RecommendationCard from "@/components/recommendations/RecommendationCard";
import { useNavigate } from "react-router-dom";

export default function Recommendations() {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ["recommendations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("generate-recommendations");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      toast({
        title: "Success",
        description: "New recommendations generated!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate recommendations",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("recommendations")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateMutation.mutateAsync();
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToPlanner = (recommendation: any) => {
    navigate("/planner", { 
      state: { 
        newTask: {
          title: recommendation.title,
          category: recommendation.category.toLowerCase(),
          priority: "medium",
          due_date: new Date().toISOString().split("T")[0],
          all_day: true,
        }
      }
    });
  };

  const activeRecs = recommendations?.filter(r => !r.completed && !r.dismissed) || [];
  const completedRecs = recommendations?.filter(r => r.completed) || [];
  const dismissedRecs = recommendations?.filter(r => r.dismissed) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Smart Recommendations</h1>
          <p className="text-muted-foreground">AI-powered suggestions to simplify your life</p>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={generating}
          className="shadow-soft"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Generate Insights
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading recommendations...</div>
      ) : recommendations && recommendations.length > 0 ? (
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">Active ({activeRecs.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedRecs.length})</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed ({dismissedRecs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeRecs.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {activeRecs.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onComplete={(id) => updateMutation.mutate({ id, updates: { completed: true } })}
                    onDismiss={(id) => updateMutation.mutate({ id, updates: { dismissed: true } })}
                    onAddToPlanner={handleAddToPlanner}
                  />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No active recommendations</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedRecs.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {completedRecs.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onComplete={(id) => updateMutation.mutate({ id, updates: { completed: false } })}
                    onDismiss={(id) => updateMutation.mutate({ id, updates: { dismissed: true } })}
                    onAddToPlanner={handleAddToPlanner}
                  />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No completed recommendations</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dismissed" className="space-y-4">
            {dismissedRecs.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {dismissedRecs.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onComplete={(id) => updateMutation.mutate({ id, updates: { completed: true } })}
                    onDismiss={(id) => updateMutation.mutate({ id, updates: { dismissed: false } })}
                    onAddToPlanner={handleAddToPlanner}
                  />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No dismissed recommendations</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="shadow-card border-2 border-dashed">
          <CardContent className="pt-6 text-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Generate Your First Recommendations</h3>
            <p className="text-muted-foreground mb-4">
              Let AI analyze your activity and suggest helpful actions
            </p>
            <Button onClick={handleGenerate} disabled={generating} className="shadow-soft">
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate Insights
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
