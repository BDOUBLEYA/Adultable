import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed, DollarSign, Calendar } from "lucide-react";

export default function Meals() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Meal Designer</h1>
        <p className="text-muted-foreground">Budget-friendly meal planning made simple</p>
      </div>

      <Card className="shadow-card border-2 border-dashed">
        <CardContent className="pt-6 text-center py-12">
          <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <UtensilsCrossed className="h-8 w-8 text-success" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Create Your Meal Plan</h3>
          <p className="text-muted-foreground mb-4">
            Set your budget and let us plan delicious, affordable meals
          </p>
          <Button className="shadow-soft">
            <DollarSign className="mr-2 h-4 w-4" />
            Start Planning
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Feature coming soon!</p>
      </div>
    </div>
  );
}
