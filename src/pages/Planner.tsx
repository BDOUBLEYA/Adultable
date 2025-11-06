import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CalendarDays, List } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useLocation } from "react-router-dom";
import { TaskDialog } from "@/components/planner/TaskDialog";
import { TaskCard } from "@/components/planner/TaskCard";
import CalendarView from "@/components/planner/CalendarView";
import { format, isToday, isFuture, parseISO } from "date-fns";

interface Task {
  id: string;
  title: string;
  category: string;
  due_date: string;
  priority: string;
  completed: boolean;
  user_id: string;
  start_time?: string;
  end_time?: string;
  all_day: boolean;
}

export default function Planner() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();

  const { data: tasks, isLoading } = useQuery({
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

  useEffect(() => {
    if (location.state?.newTask) {
      setEditingTask(location.state.newTask as Task);
      setDialogOpen(true);
    }
  }, [location]);

  const createTaskMutation = useMutation({
    mutationFn: async (newTask: Omit<Task, "id" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("tasks").insert({
        ...newTask,
        user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Success", description: "Task created successfully!" });
      setDialogOpen(false);
      setEditingTask(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create task",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Success", description: "Task updated successfully!" });
      setDialogOpen(false);
      setEditingTask(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update task",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Deleted", description: "Task deleted successfully" });
    },
  });

  const handleToggleComplete = (id: string) => {
    const task = tasks?.find(t => t.id === id);
    if (!task) return;
    
    updateTaskMutation.mutate({
      id: task.id,
      updates: { completed: !task.completed },
    });
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

  const handleSubmit = (taskData: any) => {
    if (editingTask?.id) {
      updateTaskMutation.mutate({ id: editingTask.id, updates: taskData });
    } else {
      createTaskMutation.mutate(taskData);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingTask(null);
    }
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    const newTask = {
      title: "",
      category: "personal",
      due_date: format(slotInfo.start, "yyyy-MM-dd"),
      priority: "medium" as "low" | "medium" | "high",
      completed: false,
      start_time: format(slotInfo.start, "HH:mm"),
      end_time: format(slotInfo.end, "HH:mm"),
      all_day: false,
    } as Task;
    
    setEditingTask(newTask);
    setDialogOpen(true);
  };

  const todayTasks = tasks?.filter((task) => isToday(parseISO(task.due_date)) && !task.completed) || [];
  const upcomingTasks = tasks?.filter((task) => isFuture(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && !task.completed) || [];
  const completedTasks = tasks?.filter((task) => task.completed) || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Smart Planner</h1>
          <p className="text-muted-foreground">Stay organized and on track</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("calendar")}
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{tasks?.filter(t => !t.completed).length || 0}</div>
            <p className="text-xs text-muted-foreground">Active Tasks</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{todayTasks.length}</div>
            <p className="text-xs text-muted-foreground">Due Today</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-success">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground">{upcomingTasks.length}</div>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {viewMode === "calendar" ? (
        <CalendarView
          tasks={tasks || []}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleEdit}
        />
      ) : (
        <Tabs defaultValue="today" className="space-y-4">
          <TabsList>
            <TabsTrigger value="today">Today ({todayTasks.length})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({upcomingTasks.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedTasks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            {todayTasks.length > 0 ? (
              todayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No tasks due today</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingTasks.length > 0 ? (
              upcomingTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No upcoming tasks</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedTasks.length > 0 ? (
              completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            ) : (
              <Card className="shadow-card">
                <CardContent className="pt-6 text-center py-12">
                  <p className="text-muted-foreground">No completed tasks</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSubmit={handleSubmit}
        initialData={editingTask ? {
          ...editingTask,
          priority: editingTask.priority as "low" | "medium" | "high"
        } : undefined}
        title={editingTask?.id ? "Edit Task" : "Create New Task"}
        description={editingTask?.id ? "Update task details" : "Add a new task to your planner"}
      />
    </div>
  );
}
