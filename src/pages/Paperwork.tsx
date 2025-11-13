// src/pages/Paperwork.tsx
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Download, Trash2, Edit, Eye } from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { format } from "date-fns";

GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.394/pdf.worker.min.js`;

export default function Paperwork() {
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [showFieldsDialog, setShowFieldsDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
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

      const { data: formRecord, error: insertError } = await supabase
        .from("forms")
        .insert({
          form_name: file.name,
          file_url: fileName,
          file_type: file.type,
          file_size: file.size,
          status: "processing",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setScanning(true);

      // Convert PDF to images for OCR
      let images: string[] = [];
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx as any, viewport }).promise;
          images.push(canvas.toDataURL("image/png"));
        }
      } else if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        images = [await new Promise<string>((res, rej) => {
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        })];
      }

      // Invoke OCR function
      const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-document", {
        body: { fileUrl: fileName, images },
      });

      if (scanError) throw scanError;

      const fields = Array.isArray(scanResult?.fields) ? scanResult.fields : [];

      await supabase.from("forms").update({
        extracted_fields: fields,
        status: fields.length > 0 ? "scanned" : "uploaded",
      }).eq("id", formRecord.id);

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      if (fields.length > 0) {
        setSelectedForm({ ...formRecord, extracted_fields: fields });
        setShowFieldsDialog(true);
        toast({ title: "Fields detected", description: `Found ${fields.length} fields.` });
      } else {
        toast({ title: "No fields detected", description: "You can manually enter data if needed." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error uploading form", description: err.message });
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
    await supabase.from("forms").update({ extracted_fields: updatedFields, status: "completed" }).eq("id", selectedForm.id);
    toast({ title: "Form saved", description: "Your field data has been saved for future forms." });
    setShowFieldsDialog(false);
    setSelectedForm(null);
    queryClient.invalidateQueries({ queryKey: ["forms"] });
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Paperwork Assistant</h1>

      <Card className="border-dashed border-2">
        <CardContent className="text-center py-8">
          <Upload className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h2 className="font-semibold mb-2">Upload a PDF or Image</h2>
          <Button disabled={uploading || scanning} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "Uploading..." : scanning ? "Scanning..." : "Choose File"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} hidden />
        </CardContent>
      </Card>

      {forms.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Card key={f.id}>
              <CardHeader className="flex justify-between">
                <FileText className="h-6 w-6 text-primary" />
                <Badge variant="outline">{f.status}</Badge>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium">{f.form_name}</h3>
                <p className="text-xs text-muted-foreground">Uploaded {format(new Date(f.created_at), "MMM d, yyyy")}</p>
                <Button size="sm" variant="outline" onClick={() => { setSelectedForm(f); setShowFieldsDialog(true); }}>
                  <Edit className="h-4 w-4 mr-2" /> Fill Fields
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showFieldsDialog} onOpenChange={setShowFieldsDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill Form Fields</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedForm?.extracted_fields?.map((field: any, i: number) => (
              <div key={i}>
                <Label>{field.label}</Label>
                <Input
                  type={field.type || "text"}
                  value={fieldValues[field.name] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [field.name]: e.target.value })}
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
    </div>
  );
}
