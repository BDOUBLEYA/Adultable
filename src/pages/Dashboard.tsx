import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, UtensilsCrossed, ListTodo, Sparkles, Plus, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-primary rounded-2xl p-8 text-white shadow-hover">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold mb-3">Welcome to LifeUp! 👋</h1>
          <p className="text-lg opacity-95 mb-6">
            Your all-in-one adulting assistant. Manage paperwork, plan meals, organize tasks, and get smart recommendations.
          </p>
          <Button variant="secondary" size="lg" className="shadow-lg">
            <Plus className="mr-2 h-5 w-5" />
            Quick Add Task
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card hover:shadow-hover transition-smooth">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasks Today</p>
                <p className="text-3xl font-bold text-primary">8</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ListTodo className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-hover transition-smooth">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Forms Pending</p>
                <p className="text-3xl font-bold text-primary">3</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-hover transition-smooth">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold text-success">85%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Smart Planner */}
        <Card className="shadow-card hover:shadow-hover transition-smooth overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-primary" />
                  Smart Planner
                </CardTitle>
                <CardDescription>Today's tasks and upcoming deadlines</CardDescription>
              </div>
              <Badge variant="secondary">5 Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm flex-1">Complete project proposal</p>
                <span className="text-xs text-muted-foreground">2pm</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm flex-1">Review monthly budget</p>
                <span className="text-xs text-muted-foreground">4pm</span>
              </div>
            </div>
            <Link to="/planner">
              <Button variant="outline" className="w-full">View All Tasks</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Paperwork Assistant */}
        <Card className="shadow-card hover:shadow-hover transition-smooth overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Paperwork Assistant
                </CardTitle>
                <CardDescription>Manage and auto-fill your forms</CardDescription>
              </div>
              <Badge variant="secondary">3 Pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm flex-1">Tax Return Form</p>
                <Badge variant="outline" className="text-xs">Draft</Badge>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm flex-1">Insurance Application</p>
                <Badge variant="outline" className="text-xs">Review</Badge>
              </div>
            </div>
            <Link to="/paperwork">
              <Button variant="outline" className="w-full">Manage Forms</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Meal Designer */}
        <Card className="shadow-card hover:shadow-hover transition-smooth overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-success/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-success" />
                  Meal Designer
                </CardTitle>
                <CardDescription>Budget-friendly meal planning</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                Active Plan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="p-4 rounded-lg bg-success/5 border border-success/20 mb-4">
              <div className="flex justify-between items-center mb-2">
                <p className="font-medium">5-Day Plan</p>
                <p className="text-success font-semibold">$75.00</p>
              </div>
              <p className="text-sm text-muted-foreground">12 meals planned • 3 days remaining</p>
            </div>
            <Link to="/meals">
              <Button variant="outline" className="w-full">View Meal Plan</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Smart Recommendations */}
        <Card className="shadow-card hover:shadow-hover transition-smooth overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Smart Recommendations
                </CardTitle>
                <CardDescription>AI-powered adulting suggestions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm flex-1 font-medium">Consider filing tax extension</p>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm flex-1">Schedule annual health checkup</p>
              </div>
            </div>
            <Link to="/recommendations">
              <Button variant="outline" className="w-full">View All Suggestions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
