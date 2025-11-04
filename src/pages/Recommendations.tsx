import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Brain } from "lucide-react";

export default function Recommendations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Smart Recommendations</h1>
        <p className="text-muted-foreground">AI-powered suggestions to simplify your life</p>
      </div>

      <Card className="shadow-card border-2 border-dashed">
        <CardContent className="pt-6 text-center py-12">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">AI Learning Your Habits</h3>
          <p className="text-muted-foreground mb-4">
            Complete tasks and forms to receive personalized recommendations
          </p>
          <Button className="shadow-soft">
            <Brain className="mr-2 h-4 w-4" />
            View Insights
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-muted-foreground">
        <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Feature coming soon!</p>
      </div>
    </div>
  );
}
