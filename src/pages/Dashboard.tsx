import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, UtensilsCrossed, ListTodo, Sparkles, Plus, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isToday, parseISO, format } from "date-fns";

export default function Dashboard() {
  const navigate = useNavigate();

  // Fetch tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch forms
  const { data: forms = [] } = useQuery({
    queryKey: ["dashboard-forms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch recommendations
  const { data: recommendations = [] } = useQuery({
    queryKey: ["dashboard-recommendations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("*")
        .eq("dismissed", false)
        .eq("completed", false)
        .order("created_at", { ascending: false })
        .limit(2);
      
      if (error) throw error;
      return data;
    },
  });

  const todayTasks = tasks.filter(task => isToday(parseISO(task.due_date)) && !task.completed);
  const completedTasks = tasks.filter(task => task.completed);
  const totalTasks = tasks.filter(task => !task.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-primary rounded-2xl p-8 text-primary-foreground shadow-hover">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold mb-3">Welcome to Adultable! 👋</h1>
          <p className="text-lg opacity-95 mb-6">
            Your all-in-one adulting platform. Manage paperwork, plan meals, organize tasks, and get smart recommendations.
          </p>
          <Button 
            variant="secondary" 
            size="lg" 
            className="shadow-lg"
            onClick={() => navigate("/planner")}
          >
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
                <p className="text-3xl font-bold text-primary">{todayTasks.length}</p>
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
                <p className="text-sm text-muted-foreground">Forms Uploaded</p>
                <p className="text-3xl font-bold text-primary">{forms.length}</p>
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
                <p className="text-3xl font-bold text-success">{completionRate}%</p>
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
              <Badge variant="secondary">{totalTasks} Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {todayTasks.length > 0 ? (
              <div className="space-y-3 mb-4">
                {todayTasks.slice(0, 2).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <p className="text-sm flex-1">{task.title}</p>
                    <span className="text-xs text-muted-foreground">{task.category}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4 text-center py-4">
                No tasks for today. Add a task to get started!
              </p>
            )}
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
                <CardDescription>Manage and organize your forms</CardDescription>
              </div>
              <Badge variant="secondary">{forms.length} Files</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {forms.length > 0 ? (
              <div className="space-y-3 mb-4">
                {forms.map((form) => (
                  <div key={form.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <FileText className="h-4 w-4 text-primary" />
                    <p className="text-sm flex-1 truncate">{form.form_name}</p>
                    <Badge variant="outline" className="text-xs">{form.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4 text-center py-4">
                No forms uploaded yet. Upload your first form!
              </p>
            )}
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
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="p-4 rounded-lg bg-success/5 border border-success/20 mb-4">
              <p className="text-sm text-muted-foreground text-center">
                Create your first meal plan to get started
              </p>
            </div>
            <Link to="/meals">
              <Button variant="outline" className="w-full">Create Meal Plan</Button>
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
                <CardDescription>Personalized adulting suggestions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {recommendations.length > 0 ? (
              <div className="space-y-3 mb-4">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <p className="text-sm flex-1 font-medium">{rec.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4 text-center py-4">
                No recommendations yet. Complete tasks to get suggestions!
              </p>
            )}
            <Link to="/recommendations">
              <Button variant="outline" className="w-full">View All Suggestions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
