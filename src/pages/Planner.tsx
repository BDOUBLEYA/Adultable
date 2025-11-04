import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Calendar, Clock, CheckCircle2, Circle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Task = {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
};

export default function Planner() {
  const [tasks] = useState<Task[]>([
    {
      id: "1",
      title: "Complete project proposal",
      category: "Work",
      dueDate: "Today, 2:00 PM",
      priority: "high",
      completed: false,
    },
    {
      id: "2",
      title: "Review monthly budget",
      category: "Finance",
      dueDate: "Today, 4:00 PM",
      priority: "medium",
      completed: false,
    },
    {
      id: "3",
      title: "Grocery shopping",
      category: "Personal",
      dueDate: "Tomorrow",
      priority: "medium",
      completed: false,
    },
    {
      id: "4",
      title: "Call insurance company",
      category: "Finance",
      dueDate: "This Week",
      priority: "low",
      completed: false,
    },
    {
      id: "5",
      title: "Submit expense report",
      category: "Work",
      dueDate: "Yesterday",
      priority: "high",
      completed: true,
    },
  ]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-primary/10 text-primary border-primary/20";
      case "low":
        return "bg-success/10 text-success border-success/20";
      default:
        return "";
    }
  };

  const renderTaskList = (filteredTasks: Task[]) => (
    <div className="space-y-3">
      {filteredTasks.map((task) => (
        <Card
          key={task.id}
          className={`shadow-soft hover:shadow-card transition-smooth ${
            task.completed ? "opacity-60" : ""
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Checkbox
                checked={task.completed}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3
                    className={`font-medium ${
                      task.completed ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`${getPriorityColor(task.priority)} text-xs shrink-0`}
                  >
                    {task.priority}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {task.dueDate}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {task.category}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate.includes("Today"));
  const upcomingTasks = tasks.filter(
    (t) => !t.completed && !t.dueDate.includes("Today") && !t.dueDate.includes("Yesterday")
  );
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Smart Planner</h1>
          <p className="text-muted-foreground">Organize your tasks and stay on top of deadlines</p>
        </div>
        <Button className="shadow-soft">
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Circle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tasks.filter((t) => !t.completed).length}</p>
                <p className="text-sm text-muted-foreground">Active Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayTasks.length}</p>
                <p className="text-sm text-muted-foreground">Due Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedTasks.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingTasks.length}</p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Tabs */}
      <Tabs defaultValue="today" className="space-y-6">
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-3">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          {todayTasks.length > 0 ? (
            renderTaskList(todayTasks)
          ) : (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                <p className="text-muted-foreground">No tasks due today. Great work!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4">
          {upcomingTasks.length > 0 ? (
            renderTaskList(upcomingTasks)
          ) : (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No upcoming tasks</h3>
                <p className="text-muted-foreground">You're all set for the future!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedTasks.length > 0 ? (
            renderTaskList(completedTasks)
          ) : (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <Circle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No completed tasks</h3>
                <p className="text-muted-foreground">Start checking off your to-dos!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
