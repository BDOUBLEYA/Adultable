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
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.394/pdf.worker.min.js`;

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
      return data || [];
    },
  });

  const deleteFormMutation = useMutation({
    mutationFn: async (id: string) => {
      const form = forms.find(f => f.id === id);
      if (form) {
        await supabase.storage.from("forms").remove([form.file_url]);
      }
      await supabase.from("forms").delete().eq("id", id);
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
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("forms").upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: insertedForm, error: dbError } = await supabase
        .from("forms")
        .insert({
          file_url: fileName,
          form_name: file.name,
          file_type: file.type,
          file_size: file.size,
          status: "processing",
        })
        .select()
        .maybeSingle();

      if (dbError) throw dbError;

      toast({ title: "Form uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      setScanning(true);

      const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-document", {
        body: { fileUrl: fileName },
      });

      if (scanError) throw scanError;

      const fields = Array.isArray(scanResult?.fields) ? scanResult.fields : [];

      await supabase
        .from("forms")
        .update({
          extracted_fields: fields,
          status: fields.length > 0 ? "scanned" : "uploaded",
        })
        .eq("id", insertedForm.id);

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      if (fields.length > 0) {
        setSelectedForm({ ...insertedForm, extracted_fields: fields });
        setFieldValues({});
        setShowFieldsDialog(true);
        toast({ title: `Detected ${fields.length} fillable fields` });
      } else {
        toast({ title: "Upload complete", description: "No fields found in this document." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setUploading(false);
      setScanning(false);
      e.target.value = "";
    }
  };

  const handleSaveFields = async () => {
    if (!selectedForm) return;

    const updatedFields = selectedForm.extracted_fields.map((f: any) => ({
      ...f,
      value: fieldValues[f.name] || "",
    }));

    await supabase.from("forms")
      .update({ extracted_fields: updatedFields, status: "completed" })
      .eq("id", selectedForm.id);

    const { data: fillResult, error: fillError } = await supabase.functions.invoke("fill-document", {
      body: { fileUrl: selectedForm.file_url, fields: updatedFields },
    });

    if (fillError) {
      toast({ variant: "destructive", title: "Error filling PDF", description: fillError.message });
    } else if (fillResult?.filledFileUrl) {
      await supabase
        .from("forms")
        .update({ file_url: fillResult.filledFileUrl })
        .eq("id", selectedForm.id);
      toast({ title: "Form filled successfully!" });
    }

    queryClient.invalidateQueries({ queryKey: ["forms"] });
    setShowFieldsDialog(false);
    setSelectedForm(null);
    setFieldValues({});
  };

  const handleViewForm = async (form: any) => {
    const { data: signed } = await supabase.storage.from("forms").createSignedUrl(form.file_url, 300);
    setViewUrl(signed?.signedUrl || null);
    setShowViewDialog(true);
    setSelectedForm(form);
  };

  const handleDownload = async (form: any) => {
    const { data } = await supabase.storage.from("forms").download(form.file_url);
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = form.form_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading)
    return <div className="flex justify-center p-20">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-2">Document Scanner</h1>

      <Card className="border-2 border-dashed shadow-sm">
        <CardContent className="py-12 text-center">
          <Upload className="mx-auto h-8 w-8 mb-3 text-primary" />
          <h3 className="font-semibold mb-2">Upload Your Forms</h3>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || scanning}>
            {uploading ? "Uploading..." : scanning ? "Scanning..." : "Choose File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileUpload}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms.map((form) => (
          <Card key={form.id} className="shadow-sm">
            <CardHeader className="flex justify-between items-center">
              <FileText className="h-6 w-6 text-primary" />
              <Badge>{form.status}</Badge>
            </CardHeader>
            <CardContent>
              <h3 className="font-medium mb-2">{form.form_name}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {format(new Date(form.created_at), "MMM d, yyyy")}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleViewForm(form)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDownload(form)}>
                  <Download className="h-4 w-4" />
                </Button>
                {form.status !== "completed" &&
                  form.extracted_fields?.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedForm(form);
                        setFieldValues({});
                        setShowFieldsDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => confirm("Delete?") && deleteFormMutation.mutate(form.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showFieldsDialog} onOpenChange={setShowFieldsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill Form Fields</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedForm?.extracted_fields?.map((f: any, i: number) => (
              <div key={i}>
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input
                  id={f.name}
                  value={fieldValues[f.name] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [f.name]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFieldsDialog(false)}>
              Cancel
            </Button>
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
              <iframe src={viewUrl} className="w-full h-[70vh] rounded-md border" />
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Loading preview...
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              Close
            </Button>
            <Button onClick={() => handleDownload(selectedForm)}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
