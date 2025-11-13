"use client";

import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker?url";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Download, Eye, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function Paperwork() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [showFieldsDialog, setShowFieldsDialog] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  async function renderPdfInCanvas(signedUrl: string) {
    try {
      const pdf = await pdfjsLib.getDocument(signedUrl).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const renderContext = {
        canvasContext: ctx!,
        viewport,
      };
      await page.render(renderContext).promise;
    } catch (err) {
      console.error("PDF render error:", err);
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("forms").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: insertedForm, error: insertError } = await supabase
        .from("forms")
        .insert({
          file_url: filePath,
          form_name: file.name,
          file_type: file.type,
          file_size: file.size,
          status: "processing",
        })
        .select()
        .maybeSingle();

      if (insertError) throw insertError;
      if (!insertedForm) throw new Error("Failed to create form record");

      setScanning(true);
      toast({ title: "Uploaded — scanning text fields..." });

      // Use pdfjs to extract text and detect fields
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let extractedText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map((it: any) => it.str).join(" ");
      }

      // Heuristically detect fields (simple pattern detection)
      const regex = /(Name|Date of Birth|Address|Email|Phone|City|State|Zip|SSN|DOB)/gi;
      const matches = [...new Set(extractedText.match(regex) || [])];
      const detectedFields = matches.map((m, i) => ({
        id: i,
        label: m,
        key: m.toLowerCase().replace(/\s+/g, "_"),
        type: "text",
        confidence: 0.8,
      }));

      const { error: updateError } = await supabase
        .from("forms")
        .update({ extracted_fields: detectedFields, status: "scanned" })
        .eq("id", insertedForm.id);
      if (updateError) console.warn(updateError);

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      if (detectedFields.length > 0) {
        setSelectedForm({ ...insertedForm, extracted_fields: detectedFields });
        setShowFieldsDialog(true);
        toast({ title: `Detected ${detectedFields.length} fields.` });
      } else {
        toast({
          variant: "destructive",
          title: "No text fields detected",
          description: "This may be a scanned image PDF. OCR processing may be needed.",
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Upload error", description: String(err?.message || err) });
    } finally {
      setUploading(false);
      setScanning(false);
      e.target.value = "";
    }
  };

  const handleViewForm = async (form: any) => {
    try {
      const { data: signed, error } = await supabase.storage.from("forms").createSignedUrl(form.file_url, 300);
      if (error) throw error;
      setPdfUrl(signed.signedUrl);
      await renderPdfInCanvas(signed.signedUrl);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error viewing PDF", description: String(err?.message || err) });
    }
  };

  const handleDownload = async (form: any) => {
    try {
      const { data, error } = await supabase.storage.from("forms").download(form.file_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = form.form_name || "form.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download error", description: String(err?.message || err) });
    }
  };

  const handleSaveFields = async () => {
    if (!selectedForm) return;
    try {
      const updated = selectedForm.extracted_fields.map((f: any) => ({
        ...f,
        value: fieldValues[f.key] || "",
      }));

      const { error: fErr } = await supabase.from("forms").update({
        extracted_fields: updated,
        status: "completed",
      }).eq("id", selectedForm.id);
      if (fErr) throw fErr;

      toast({ title: "Saved field responses" });
      setShowFieldsDialog(false);
      setSelectedForm(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save error", description: String(err?.message || err) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Paperwork Manager</h1>
        <p className="text-muted-foreground">
          Upload forms, detect fields, fill them in, and preview inline.
        </p>
      </div>

      <Card className="border-2 border-dashed">
        <CardContent className="py-12 text-center">
          <Upload className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">Upload Your Form (PDF)</h3>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || scanning}>
            {uploading ? "Uploading..." : scanning ? "Scanning..." : "Choose File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms.map((form) => (
          <Card key={form.id} className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium">{form.form_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Uploaded {format(new Date(form.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{form.status}</Badge>
              </div>
            </CardHeader>
            <div className="flex gap-2 p-4">
              <Button size="sm" variant="outline" onClick={() => handleViewForm(form)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDownload(form)}>
                <Download className="h-4 w-4" />
              </Button>
              {form.extracted_fields?.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedForm(form);
                    setShowFieldsDialog(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirm("Delete form?") &&
                  supabase.from("forms").delete().eq("id", form.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["forms"] }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {pdfUrl && (
        <Card className="shadow-md mt-6">
          <CardHeader>
            <h3 className="font-semibold text-lg">Preview</h3>
          </CardHeader>
          <CardContent>
            <canvas ref={pdfCanvasRef} className="w-full border rounded"></canvas>
          </CardContent>
        </Card>
      )}

      <Dialog open={showFieldsDialog} onOpenChange={setShowFieldsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill Detected Fields</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedForm?.extracted_fields?.map((f: any, i: number) => (
              <div key={i} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  value={fieldValues[f.key] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
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
