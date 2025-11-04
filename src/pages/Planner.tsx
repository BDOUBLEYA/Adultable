import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskDialog, TaskFormData } from "@/components/planner/TaskDialog";
import { TaskCard } from "@/components/planner/TaskCard";
import { useToast } from "@/hooks/use-toast";
import { isToday, isFuture, parseISO, startOfDay } from "date-fns";

interface Task {
  id: string;
  user_id: string;
  title: string;
  category: string;
  due_date: string;
  priority: string;
  completed: boolean;
}

export default function Planner() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data as Task[];
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: TaskFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        ...taskData,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task created successfully" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error creating task",
        description: error.message,
      });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const { error } = await supabase
        .from("tasks")
        .update(data)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error updating task",
        description: error.message,
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error deleting task",
        description: error.message,
      });
    },
  });

  const handleToggleComplete = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      updateTaskMutation.mutate({
        id,
        data: { completed: !task.completed },
      });
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteTaskMutation.mutate(id);
    }
  };

  const handleSubmit = (formData: TaskFormData) => {
    if (editingTask) {
      updateTaskMutation.mutate({
        id: editingTask.id,
        data: formData,
      });
      setEditingTask(null);
    } else {
      createTaskMutation.mutate(formData);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingTask(null);
    }
  };

  // Filter tasks
  const todayTasks = tasks.filter((task) => {
    const taskDate = startOfDay(parseISO(task.due_date));
    const today = startOfDay(new Date());
    return taskDate.getTime() === today.getTime() && !task.completed;
  });

  const upcomingTasks = tasks.filter((task) => {
    const taskDate = parseISO(task.due_date);
    return isFuture(taskDate) && !isToday(taskDate) && !task.completed;
  });

  const completedTasks = tasks.filter((task) => task.completed);

  const activeTasksCount = tasks.filter((t) => !t.completed).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Smart Planner</h1>
          <p className="text-muted-foreground">Organize your tasks and stay on top of your goals</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shadow-soft">
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardDescription>Active Tasks</CardDescription>
            <CardTitle className="text-3xl">{activeTasksCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardDescription>Due Today</CardDescription>
            <CardTitle className="text-3xl">{todayTasks.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{completedTasks.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardDescription>Upcoming</CardDescription>
            <CardTitle className="text-3xl">{upcomingTasks.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tasks Tabs */}
      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Today ({todayTasks.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcomingTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 mt-6">
          {todayTasks.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <p className="text-muted-foreground">No tasks due today. Great job!</p>
              </CardContent>
            </Card>
          ) : (
            todayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4 mt-6">
          {upcomingTasks.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <p className="text-muted-foreground">No upcoming tasks</p>
              </CardContent>
            </Card>
          ) : (
            upcomingTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 mt-6">
          {completedTasks.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center py-12">
                <p className="text-muted-foreground">No completed tasks yet</p>
              </CardContent>
            </Card>
          ) : (
            completedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSubmit={handleSubmit}
        initialData={editingTask ? {
          title: editingTask.title,
          category: editingTask.category,
          due_date: editingTask.due_date,
          priority: editingTask.priority as "low" | "medium" | "high",
        } : undefined}
        title={editingTask ? "Edit Task" : "Create New Task"}
        description={editingTask ? "Update your task details" : "Add a new task to your planner"}
      />
    </div>
  );
}
