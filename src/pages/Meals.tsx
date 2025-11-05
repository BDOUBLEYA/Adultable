import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import MealPlannerChat from "@/components/meals/MealPlannerChat";
import MealPlanCard from "@/components/meals/MealPlanCard";

export default function Meals() {
  const [chatOpen, setChatOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mealPlans, isLoading } = useQuery({
    queryKey: ["meal-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const savePlanMutation = useMutation({
    mutationFn: async (planData: { name: string; budget: number; days: number; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("meal_plans").insert({
        user_id: user.id,
        plan_name: planData.name,
        budget: planData.budget,
        days: planData.days,
        recipes: { content: planData.content },
        grocery_list: [],
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      toast({
        title: "Success",
        description: "Meal plan saved successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save meal plan",
        variant: "destructive",
      });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meal_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      toast({
        title: "Deleted",
        description: "Meal plan deleted successfully",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Meal Designer</h1>
          <p className="text-muted-foreground">Budget-friendly meal planning made simple</p>
        </div>
        <Button onClick={() => setChatOpen(true)} className="shadow-soft">
          <Plus className="mr-2 h-4 w-4" />
          Start Planning
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading meal plans...</div>
      ) : mealPlans && mealPlans.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mealPlans.map((plan) => (
            <MealPlanCard
              key={plan.id}
              plan={plan}
              onDelete={(id) => deletePlanMutation.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <Card className="shadow-card border-2 border-dashed">
          <CardContent className="pt-6 text-center py-12">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <UtensilsCrossed className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Create Your First Meal Plan</h3>
            <p className="text-muted-foreground mb-4">
              Chat with our AI assistant to plan delicious, affordable meals
            </p>
            <Button onClick={() => setChatOpen(true)} className="shadow-soft">
              <Plus className="mr-2 h-4 w-4" />
              Start Planning
            </Button>
          </CardContent>
        </Card>
      )}

      <MealPlannerChat
        open={chatOpen}
        onOpenChange={setChatOpen}
        onSavePlan={(planData) => savePlanMutation.mutate(planData)}
      />
    </div>
  );
}
