import React, { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Download, Trash2, Eye, Edit } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Paperwork() {
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [showFieldsDialog, setShowFieldsDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const { data: personalInfo = [] } = useQuery({
    queryKey: ["personal-info"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_personal_info")
        .select("*");
      
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

      const { data: insertedForm, error: dbError } = await supabase
        .from("forms")
        .insert({
          user_id: user.id,
          file_url: fileName,
          form_name: file.name,
          file_type: file.type,
          file_size: file.size,
          status: "processing",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({ title: "Form uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["forms"] });

      // Scan the document
      setScanning(true);
      const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-document", {
        body: { fileUrl: fileName, fileName: file.name },
      });

      // Handle invoke/network errors
      if (scanError) {
        console.error('scan-document invoke error:', scanError);
        await supabase.from("forms").update({ status: "uploaded" }).eq("id", insertedForm.id);
        throw scanError;
      }

      const fields = Array.isArray(scanResult?.fields) ? scanResult.fields : [];
      const analysisError = scanResult?.error as string | undefined;

      // Update form with extracted fields (or empty) and status
      const nextStatus = fields.length > 0 ? "scanned" : "uploaded";
      const { error: updateError } = await supabase
        .from("forms")
        .update({
          extracted_fields: fields,
          status: nextStatus,
        })
        .eq("id", insertedForm.id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      if (analysisError) {
        toast({ variant: "destructive", title: "Scan issue", description: analysisError });
      }

      // Auto-fill from stored personal info
      const autoFilledValues: Record<string, any> = {};
      if (fields.length > 0) {
        personalInfo.forEach((info: any) => {
          const matchingField = fields.find((f: any) => f.name === info.field_name);
          if (matchingField) {
            autoFilledValues[info.field_name] = info.field_value;
          }
        });
      }

      // Show fields dialog if we have fields
      if (fields.length > 0) {
        const formWithFields = { ...insertedForm, extracted_fields: fields, status: nextStatus };
        setSelectedForm(formWithFields);
        setFieldValues(autoFilledValues);
        setShowFieldsDialog(true);
        toast({ 
          title: "Fields detected!", 
          description: `Found ${fields.length} field(s) to fill in. ${Object.keys(autoFilledValues).length > 0 ? 'Some fields auto-filled!' : ''}` 
        });
      } else {
        toast({ title: "Upload complete", description: "No fillable fields detected in this document." });
      }

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
      setScanning(false);
      e.target.value = "";
    }
  };

  const handleSaveFields = async () => {
    if (!selectedForm) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const updatedFields = selectedForm.extracted_fields.map((field: any) => ({
        ...field,
        value: fieldValues[field.name] || "",
      }));

      // Save to forms table
      const { error: formError } = await supabase
        .from("forms")
        .update({
          extracted_fields: updatedFields,
          status: "completed",
        })
        .eq("id", selectedForm.id);

      if (formError) throw formError;

      // Save/update personal info for future auto-fill
      for (const [fieldName, fieldValue] of Object.entries(fieldValues)) {
        if (fieldValue && String(fieldValue).trim()) {
          const { error: infoError } = await supabase
            .from("user_personal_info")
            .upsert({
              user_id: user.id,
              field_name: fieldName,
              field_value: String(fieldValue),
            }, {
              onConflict: 'user_id,field_name'
            });
          
          if (infoError) console.error('Error saving personal info:', infoError);
        }
      }

      // If it's a PDF, fill it with the values
      if (selectedForm.file_type === "application/pdf") {
        toast({ title: "Generating filled PDF...", description: "Please wait while we place your answers on the document." });
        
        const { data: fillResult, error: fillError } = await supabase.functions.invoke("fill-document", {
          body: { fileUrl: selectedForm.file_url, fields: updatedFields },
        });

        if (fillError) {
          console.error("Error filling document:", fillError);
          toast({ variant: "destructive", title: "Could not generate filled PDF", description: "Your data was saved but the filled PDF could not be generated." });
        } else if (fillResult?.filledFileUrl) {
          // Update the form with the filled file URL
          await supabase
            .from("forms")
            .update({ file_url: fillResult.filledFileUrl })
            .eq("id", selectedForm.id);
          
          toast({ title: "Form completed!", description: "Your answers have been placed on the document. Download to view the filled form." });
        }
      } else {
        toast({ title: "Form completed!", description: "Your information has been saved for future forms." });
      }

      queryClient.invalidateQueries({ queryKey: ["forms"] });
      queryClient.invalidateQueries({ queryKey: ["personal-info"] });
      setShowFieldsDialog(false);
      setSelectedForm(null);
      setFieldValues({});
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleViewForm = async (form: any) => {
    try {
      setSelectedForm(form);
      const { data: signed, error } = await supabase.storage
        .from("forms")
        .createSignedUrl(form.file_url, 300);
      if (error) throw error;
      setViewUrl(signed?.signedUrl || null);
      setShowViewDialog(true);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDownload = async (form: any) => {
    try {
      const { data, error } = await supabase.storage.from("forms").download(form.file_url);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = form.form_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
          <p className="text-muted-foreground mb-4">Upload PDFs and images</p>
          <Button 
            className="shadow-soft" 
            disabled={uploading || scanning}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : scanning ? "Scanning..." : "Choose Files"}
          </Button>
          <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            accept=".pdf,.jpg,.jpeg,.png" 
            onChange={handleFileUpload} 
            disabled={uploading} 
          />
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
                  <Button variant="outline" size="sm" onClick={() => handleViewForm(form)}><Eye className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(form)}><Download className="h-4 w-4" /></Button>
                  {form.status !== "completed" && Array.isArray(form.extracted_fields) && form.extracted_fields.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setSelectedForm(form); setFieldValues({}); setShowFieldsDialog(true); }}><Edit className="h-4 w-4" /></Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => confirm("Delete?") && deleteFormMutation.mutate(form.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showFieldsDialog} onOpenChange={setShowFieldsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill Form Fields</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedForm?.extracted_fields?.map((field: any, index: number) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.name}
                  type={field.type}
                  value={fieldValues[field.name] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [field.name]: e.target.value })}
                  required={field.required}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFieldsDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveFields}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{selectedForm?.form_name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {viewUrl ? (
              selectedForm?.file_type?.startsWith("image/") ? (
                <img
                  src={viewUrl}
                  alt={`Preview of ${selectedForm?.form_name}`}
                  className="w-full h-auto rounded-md"
                  loading="lazy"
                />
              ) : (
                <iframe
                  src={viewUrl}
                  className="w-full h-[70vh] rounded-md border"
                  title={selectedForm?.form_name}
                />
              )
            ) : (
              <p className="text-muted-foreground text-center py-8">Loading preview...</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
            <Button onClick={() => handleDownload(selectedForm)}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
