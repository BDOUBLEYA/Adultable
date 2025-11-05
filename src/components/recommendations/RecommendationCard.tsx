import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, X } from "lucide-react";

interface RecommendationCardProps {
  recommendation: {
    id: string;
    title: string;
    description: string;
    category: string;
    completed: boolean;
    dismissed: boolean;
  };
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
  onAddToPlanner: (recommendation: any) => void;
}

export default function RecommendationCard({
  recommendation,
  onComplete,
  onDismiss,
  onAddToPlanner,
}: RecommendationCardProps) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Finance: "bg-success/10 text-success",
      Health: "bg-primary/10 text-primary",
      Organization: "bg-accent/10 text-accent-foreground",
      Personal: "bg-secondary/10 text-secondary-foreground",
      Productivity: "bg-primary/10 text-primary",
    };
    return colors[category] || "bg-muted";
  };

  return (
    <Card className="shadow-card hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={getCategoryColor(recommendation.category)}>
                {recommendation.category}
              </Badge>
            </div>
            <CardTitle className="text-lg">{recommendation.title}</CardTitle>
            <CardDescription className="mt-1">{recommendation.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAddToPlanner(recommendation)}
            className="flex-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add to Planner
          </Button>
          {!recommendation.completed && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onComplete(recommendation.id)}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          {!recommendation.dismissed && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(recommendation.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
