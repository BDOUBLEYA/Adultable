"use client";

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
import Tesseract from "tesseract.js";

// PDF.js worker (CDN approach used previously)
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

  /* Load forms list */
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

  /* Delete mutation */
  const deleteFormMutation = useMutation({
    mutationFn: async (id: string) => {
      const form = forms.find((f: any) => f.id === id);
      if (form) {
        // Expecting file_url to be the path (e.g., "168...pdf"), not a signed URL
        await supabase.storage.from("forms").remove([form.file_url]);
      }
      await supabase.from("forms").delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Form deleted successfully" });
    },
  });

  /* Helper: extract label-like fields from OCR text */
  const detectFieldsFromOcrText = (text: string) => {
    // Look for patterns like "Name:", "Date of Birth:", "SSN", "Phone:", etc.
    const patterns = [
      /\b(Name|Full Name)\b[:\s-]*/i,
      /\b(Date of Birth|DOB|Birth Date)\b[:\s-]*/i,
      /\b(Address|Street Address)\b[:\s-]*/i,
      /\b(City|State|Zip|Postal Code)\b[:\s-]*/i,
      /\b(SSN|Social Security Number)\b[:\s-]*/i,
      /\b(Phone|Phone Number|Tel)\b[:\s-]*/i,
      /\b(Email|E-mail)\b[:\s-]*/i,
      /\b(Signature)\b[:\s-]*/i,
      /\b(Date)\b[:\s-]*/i,
    ];

    const found = new Map<string, string>();

    // Simple generic label capture: words followed by colon
    const colonMatches = Array.from(text.matchAll(/([A-Za-z0-9 &\/\-\(\)]+)\s*[:]\s*/g));
    colonMatches.forEach((m) => {
      const raw = (m[1] || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
      if (!found.has(key)) {
        found.set(key, raw);
      }
    });

    // Also look for the targeted patterns
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const raw = (m[1] || m[0]).trim();
        const key = raw.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
        if (!found.has(key)) found.set(key, raw);
      }
    }

    // Normalize to array of objects
    const fields = Array.from(found.entries()).map(([k, label]) => ({
      name: k, // canonical key
      label: label,
      type: "text",
      required: false,
    }));

    return fields;
  };

  /* OCR each image (base64) and return combined detected fields (unique) */
  const performClientOcrOnImages = async (images: string[]) => {
    const combinedFields: Record<string, any> = {};
    for (let i = 0; i < images.length; i++) {
      try {
        // Tesseract accepts dataURL as input
        const res = await Tesseract.recognize(images[i], "eng", {
          logger: (m) => {
            /* optional: console.log("tesseract", m); */
          },
        });
        const text = res?.data?.text || "";
        const fields = detectFieldsFromOcrText(text);
        fields.forEach((f: any) => {
          if (!combinedFields[f.name]) combinedFields[f.name] = f;
        });
      } catch (err: any) {
        console.warn("Tesseract OCR error for page", i, err?.message || err);
      }
    }
    return Object.values(combinedFields);
  };

  /* Main upload handler with robust fallback */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // 1) Upload file to Supabase storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`; // store path only
      const { error: uploadError } = await supabase.storage.from("forms").upload(fileName, file);
      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw uploadError;
      }

      // Insert record in DB (processing)
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
      if (!insertedForm) throw new Error("Failed to create form record");

      toast({ title: "Upload complete — scanning..." });
      setScanning(true);

      // 2) Render pages to images client-side (for robust OCR fallback)
      const images: string[] = [];
      try {
        if (file.type === "application/pdf") {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          const scale = 2.5; // reasonable quality vs size
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D not supported");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            // Note: page.render expects canvasContext and viewport (no 'canvas' prop)
            await page.render({ canvasContext: ctx as any, viewport }).promise;
            images.push(canvas.toDataURL("image/jpeg", 0.85));
          }
        } else if (file.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          images.push(dataUrl);
        }
      } catch (renderErr: any) {
        console.error("PDF rendering error:", renderErr);
      }

      // 3) Ask the Edge function to extract AcroForm fields (fast path)
      let acroFields: any[] = [];
      try {
        const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-document", {
          body: { fileUrl: fileName },
        });

        if (scanError) {
          console.warn("scan-document invoke error:", scanError);
        } else {
          // scanResult shape may be { fields: [...] } or { data: { fields: [...] } }
          acroFields = Array.isArray(scanResult?.fields)
            ? scanResult.fields
            : Array.isArray(scanResult?.data?.fields)
            ? scanResult.data.fields
            : [];
        }
      } catch (err: any) {
        console.warn("scan-document invocation failed:", err?.message || err);
      }

      // 4) If AcroForm fields found, use them. Otherwise, run client OCR fallback.
      let finalFields: any[] = [];
      if (acroFields.length > 0) {
        finalFields = acroFields.map((f: any) => ({
          name: f.name || (f.label || "").toLowerCase().replace(/[^\w]+/g, "_"),
          label: f.label || f.name || f,
          type: f.type || "text",
          required: !!f.required,
        }));
      } else {
        // Perform OCR fallback on images
        toast({ title: "No AcroForm fields found — running OCR fallback (may take a few seconds)..." });
        const ocrFields = await performClientOcrOnImages(images);
        finalFields = ocrFields;
      }

      // 5) Update form record with extracted_fields and status
      const nextStatus = finalFields.length > 0 ? "scanned" : "uploaded";
      const { error: updateError } = await supabase
        .from("forms")
        .update({
          extracted_fields: finalFields,
          status: nextStatus,
        })
        .eq("id", insertedForm.id);

      if (updateError) {
        console.error("Error updating form with fields:", updateError);
      }

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      // 6) Show results to user
      if (finalFields.length > 0) {
        setSelectedForm({ ...insertedForm, extracted_fields: finalFields });
        setFieldValues({});
        setShowFieldsDialog(true);
        toast({ title: `Detected ${finalFields.length} field(s)` });
      } else {
        toast({ title: "Upload complete", description: "No fillable fields detected (even after OCR)." });
      }

    } catch (error: any) {
      console.error("Handle upload error:", error);
      toast({ variant: "destructive", title: "Error", description: String(error?.message || error) });
    } finally {
      setUploading(false);
      setScanning(false);
      e.target.value = "";
    }
  };

  /* Save field values -> update DB -> call fill-document */
  const handleSaveFields = async () => {
    if (!selectedForm) return;
    try {
      const updatedFields = selectedForm.extracted_fields.map((f: any) => ({
        ...f,
        value: fieldValues[f.name] || "",
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

      // Call fill-document edge function to produce filled PDF (if PDF)
      if (selectedForm.file_type === "application/pdf") {
        toast({ title: "Generating filled PDF...", description: "Working on it..." });
        const { data: fillResult, error: fillError } = await supabase.functions.invoke("fill-document", {
          body: { fileUrl: selectedForm.file_url, fields: updatedFields },
        });

        if (fillError) {
          console.error("fill-document error:", fillError);
          toast({ variant: "destructive", title: "Could not generate filled PDF", description: String(fillError?.message || fillError) });
        } else if (fillResult?.filledFileUrl || fillResult?.data?.filledFileUrl) {
          const filledUrl = fillResult?.filledFileUrl || fillResult?.data?.filledFileUrl;
          // Update DB record to point to filled file
          await supabase.from("forms").update({ file_url: filledUrl }).eq("id", selectedForm.id);
          toast({ title: "Form completed", description: "Filled PDF has been generated." });
          queryClient.invalidateQueries({ queryKey: ["forms"] });
        } else {
          toast({ title: "Saved", description: "Field values saved but no filled PDF returned." });
        }
      } else {
        toast({ title: "Saved", description: "Field values saved for this document." });
      }

      setShowFieldsDialog(false);
      setSelectedForm(null);
      setFieldValues({});
    } catch (err: any) {
      console.error("handleSaveFields err:", err);
      toast({ variant: "destructive", title: "Error", description: String(err?.message || err) });
    }
  };

  /* View and download helpers (keep as before) */
  const handleViewForm = async (form: any) => {
    try {
      const { data: signed, error } = await supabase.storage.from("forms").createSignedUrl(form.file_url, 300);
      if (error) throw error;
      setViewUrl(signed?.signedUrl || null);
      setShowViewDialog(true);
      setSelectedForm(form);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: String(err?.message || err) });
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
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: String(err?.message || err) });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Document Scanner</h1>
        <p className="text-muted-foreground">Upload PDFs or images to extract text and detect form fields</p>
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
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <div className="font-medium">{form.form_name}</div>
                      <div className="text-xs text-muted-foreground">Uploaded {format(new Date(form.created_at), "MMM d, yyyy")}</div>
                    </div>
                  </div>
                  <Badge variant="outline">{form.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
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
                  type={field.type || "text"}
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
              <iframe
                src={viewUrl}
                className="w-full h-[70vh] rounded-md border"
                title={selectedForm?.form_name}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">Loading preview...</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
            <Button onClick={() => handleDownload(selectedForm)}><Download className="mr-2 h-4 w-4" />Download</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
