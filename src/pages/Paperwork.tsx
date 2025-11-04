import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Download, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Paperwork() {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteFormMutation = useMutation({
    mutationFn: async (id: string) => {
      const form = forms.find(f => f.id === id);
      if (form) {
        const { error: storageError } = await supabase.storage
          .from("forms")
          .remove([form.file_url]);
        
        if (storageError) throw storageError;
      }

      const { error } = await supabase.from("forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Form deleted successfully" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("forms")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("forms").insert({
        user_id: user.id,
        file_url: fileName,
        form_name: file.name,
        file_type: file.type,
        file_size: file.size,
      });

      if (dbError) throw dbError;

      toast({ title: "Form uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Paperwork Assistant</h1>
        <p className="text-muted-foreground">Upload and manage your forms</p>
      </div>

      <Card className="shadow-card border-2 border-dashed">
        <CardContent className="pt-6 text-center py-12">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Upload Your Forms</h3>
          <p className="text-muted-foreground mb-4">Upload PDFs, images, and documents</p>
          <label>
            <Button className="shadow-soft" disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading..." : "Choose Files"}
            </Button>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </CardContent>
      </Card>

      {forms.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id} className="shadow-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <FileText className="h-8 w-8 text-primary" />
                  <Badge variant="outline">{form.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2 truncate">{form.form_name}</h3>
                <p className="text-xs text-muted-foreground mb-4">Uploaded {format(new Date(form.created_at), "MMM d, yyyy")}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1"><Download className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => confirm("Delete?") && deleteFormMutation.mutate(form.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
