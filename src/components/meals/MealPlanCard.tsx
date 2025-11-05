import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface MealPlanCardProps {
  plan: {
    id: string;
    plan_name: string;
    budget: number;
    days: number;
    created_at: string;
    recipes?: any;
    grocery_list?: any;
  };
  onDelete: (id: string) => void;
}

export default function MealPlanCard({ plan, onDelete }: MealPlanCardProps) {
  return (
    <Card className="shadow-card hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{plan.plan_name}</CardTitle>
            <CardDescription>
              Created {format(new Date(plan.created_at), "MMM d, yyyy")}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(plan.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-success" />
            <span>${plan.budget}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{plan.days} days</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
