"use client";

import React, { useState, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Download, Trash2, Eye, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.394/pdf.worker.min.js`;

// --- Helpers ---
type TextItem = {
  str: string;
  transform: number[]; // matrix
  width: number;
  height: number;
  dir?: string;
};

type CandidateField = {
  id: string;
  page: number;
  label: string;         // what we detected, e.g., "Name"
  key: string;           // canonical key like "name"
  x: number;             // target x (page coordinate) where we'll place answer
  y: number;             // baseline y
  fontSize: number;
  type: string;          // "text"|"date"|"checkbox"
  confidence: number;    // heuristic confidence
};

function canonicalizeLabel(raw: string) {
  return raw.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
}

function guessTypeFromLabel(label: string) {
  const l = label.toLowerCase();
  if (/\b(date|dob|birth)\b/.test(l)) return "date";
  if (/\b(ssn|social)\b/.test(l)) return "text";
  if (/\b(phone|tel)\b/.test(l)) return "text";
  if (/\b(email|e-?mail)\b/.test(l)) return "text";
  return "text";
}

// --- Component ---
export default function Paperwork() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [showFieldsDialog, setShowFieldsDialog] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
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

  // Main upload + scan handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("forms").upload(filePath, file);
      if (uploadError) throw uploadError;

      // Create DB record
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
      toast({ title: "Uploaded — scraping PDF text & layout..." });

      // Render PDF pages and extract text items with coordinates
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const pagesTextItems: { page: number; items: TextItem[]; width: number; height: number }[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1 }); // use scale 1 for coordinates in PDF user space
        const textContent = await page.getTextContent({ disableCombineTextItems: false });
        const items = (textContent.items as any[]).map((it: any) => {
          // text item transform matrix: [a, b, c, d, e, f] — e=tx, f=ty baseline
          const t = it.transform as number[];
          // font size approx: magnitude of transform[0] or using it.height if available
          const fontSize = Math.hypot(t[0], t[1]) || 10;
          return {
            str: it.str,
            transform: t,
            width: it.width || 0,
            height: fontSize,
            dir: it.dir,
          } as TextItem;
        });

        pagesTextItems.push({ page: p, items, width: viewport.width, height: viewport.height });
      }

      // Heuristic detection of fields: labels ending with ":" OR words followed by underline character "_" in nearby token
      const candidateFields: CandidateField[] = [];
      const labelRegexColon = /[:]\s*$/;
      const underlineRegex = /_+$/;
      let idCounter = 0;

      for (const pageData of pagesTextItems) {
        const items = pageData.items;
        // Build lines by grouping items with similar baseline (transform[5])
        const lines: { y: number; items: TextItem[] }[] = [];
        for (const it of items) {
          const baseline = Math.round((it.transform[5] || 0) / 2) * 2; // bucket by 2 units
          let line = lines.find(l => Math.abs(l.y - baseline) < 3);
          if (!line) {
            line = { y: baseline, items: [] };
            lines.push(line);
          }
          line.items.push(it);
        }

        for (const line of lines) {
          // join tokens into a string to inspect patterns
          const joined = line.items.map(i => i.str).join(" ");
          // check for tokens ending with ":" or tokens that are just underscores
          for (let i = 0; i < line.items.length; i++) {
            const tok = line.items[i];
            const raw = tok.str.trim();
            const isColon = labelRegexColon.test(raw);
            const isUnderline = underlineRegex.test(raw) || /^_{3,}$/.test(raw);
            // If token ends with ":" treat it as label
            if (isColon || /^[A-Za-z ]{2,40}$/.test(raw) && raw.length > 1 && /[A-Za-z]/.test(raw) && i < line.items.length - 1 && line.items[i+1].str.trim().length === 0) {
              // compute target coord: to the right of this token
              const t = tok.transform;
              const tx = t[4] ?? 0; // x
              const ty = t[5] ?? 0; // y baseline
              const fontSize = tok.height || 10;
              const labelClean = raw.replace(/[:_]+$/g, "").trim();
              const key = canonicalizeLabel(labelClean || `field_${idCounter}`);
              candidateFields.push({
                id: `c${idCounter++}`,
                page: pageData.page,
                label: labelClean || "Field",
                key,
                x: (t[4] ?? 0) + (tok.width || labelClean.length * 6) + 6, // place a bit to the right
                y: (t[5] ?? 0) - (fontSize * 0.2), // adjust baseline
                fontSize,
                type: guessTypeFromLabel(labelClean),
                confidence: isColon ? 0.9 : 0.6,
              });
            } else if (isUnderline) {
              // find previous token on same line as label
              const prev = line.items[i-1];
              if (prev) {
                const t = prev.transform;
                const labelClean = prev.str.trim();
                const key = canonicalizeLabel(labelClean || `field_${idCounter}`);
                candidateFields.push({
                  id: `c${idCounter++}`,
                  page: pageData.page,
                  label: labelClean || "Field",
                  key,
                  x: (t[4] ?? 0) + (prev.width || labelClean.length * 6) + 6,
                  y: (t[5] ?? 0) - ((prev.height || 10) * 0.2),
                  fontSize: (prev.height || 10),
                  type: guessTypeFromLabel(labelClean),
                  confidence: 0.65,
                });
              }
            }
            // Also: match common label keywords in the line
            const common = /(Name|Full Name|Date of Birth|DOB|Address|City|State|Zip|SSN|Email|Phone)/i;
            if (common.test(joined)) {
              // try to extract each keyword
              const m = joined.match(common);
              if (m) {
                const labelClean = m[0];
                const key = canonicalizeLabel(labelClean);
                // compute approximate x,y from first occurrence token
                const foundTok = line.items.find(it => new RegExp(labelClean, "i").test(it.str));
                if (foundTok) {
                  const t = foundTok.transform;
                  candidateFields.push({
                    id: `c${idCounter++}`,
                    page: pageData.page,
                    label: labelClean,
                    key,
                    x: (t[4] ?? 0) + (foundTok.width || labelClean.length * 6) + 6,
                    y: (t[5] ?? 0) - ((foundTok.height || 10) * 0.2),
                    fontSize: foundTok.height || 10,
                    type: guessTypeFromLabel(labelClean),
                    confidence: 0.7,
                  });
                }
              }
            }
          }
        }
      }

      // Deduplicate fields by key + page (keep highest confidence)
      const deduped: CandidateField[] = [];
      const seen = new Map<string, CandidateField>();
      for (const f of candidateFields) {
        const mapKey = `${f.page}::${f.key}`;
        if (!seen.has(mapKey) || (seen.get(mapKey)!.confidence < f.confidence)) {
          seen.set(mapKey, f);
        }
      }
      for (const v of seen.values()) deduped.push(v);

      // Save extracted fields to DB
      const { error: updateError } = await supabase.from("forms").update({
        extracted_fields: deduped,
        status: deduped.length > 0 ? "scanned" : "uploaded",
      }).eq("id", insertedForm.id);
      if (updateError) console.warn("Could not update form with fields:", updateError);

      queryClient.invalidateQueries({ queryKey: ["forms"] });

      if (deduped.length > 0) {
        setSelectedForm({ ...insertedForm, extracted_fields: deduped });
        setFieldValues({});
        setShowFieldsDialog(true);
        toast({ title: `Detected ${deduped.length} fields` });
      } else {
        toast({ title: "No printable text fields found. If PDF is scanned image, use an OCR flow." });
      }

    } catch (err: any) {
      console.error("scan error:", err);
      toast({ variant: "destructive", title: "Scan error", description: String(err?.message || err) });
    } finally {
      setUploading(false);
      setScanning(false);
      e.target.value = "";
    }
  };

  // Save answers and upsert personal info
  const handleSaveFields = async () => {
    if (!selectedForm) return;
    try {
      const updated = selectedForm.extracted_fields.map((f: any) => ({
        ...f,
        value: fieldValues[f.key] || "",
      }));

      // Save extracted_fields and status
      const { error: fErr } = await supabase.from("forms").update({
        extracted_fields: updated,
        status: "completed",
      }).eq("id", selectedForm.id);
      if (fErr) throw fErr;

      // upsert user_personal_info for each value
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (user) {
        for (const field of updated) {
          const value = field.value || "";
          if (!value || !String(value).trim()) continue;
          // upsert
          const { error: upErr } = await supabase.from("user_personal_info").upsert({
            user_id: user.id,
            field_name: field.key,
            field_value: String(value),
          }, { onConflict: "user_id,field_name" });
          if (upErr) console.warn("upsert personal info err:", upErr);
        }
      }

      // Call edge function to place text on PDF
      // We pass page, x, y, fontSize, value
      const fieldsForFiller = updated
        .filter((f: any) => f.value && String(f.value).trim().length > 0)
        .map((f: any) => ({
          page: f.page,
          x: Math.round(f.x),
          y: Math.round(f.y),
          fontSize: Math.round(f.fontSize || 10),
          value: String(f.value),
        }));

      if (fieldsForFiller.length > 0 && selectedForm.file_type === "application/pdf") {
        const { data: fillRes, error: fillErr } = await supabase.functions.invoke("fill-document", {
          body: { fileUrl: selectedForm.file_url, fields: fieldsForFiller },
        });
        if (fillErr) {
          toast({ variant: "destructive", title: "Fill error", description: String(fillErr?.message || fillErr) });
        } else {
          const filledFile = fillRes?.filledFileUrl || fillRes?.data?.filledFileUrl;
          if (filledFile) {
            // update DB form file_url to filled file
            await supabase.from("forms").update({ file_url: filledFile }).eq("id", selectedForm.id);
            toast({ title: "Filled PDF generated" });
            queryClient.invalidateQueries({ queryKey: ["forms"] });
          }
        }
      } else {
        toast({ title: "Saved", description: "Field values stored" });
      }

      setShowFieldsDialog(false);
      setSelectedForm(null);
      setFieldValues({});
    } catch (err: any) {
      console.error("save fields error:", err);
      toast({ variant: "destructive", title: "Save error", description: String(err?.message || err) });
    }
  };

  // View/download helpers (keep simple)
  const handleViewForm = async (form: any) => {
    try {
      const { data: signed, error } = await supabase.storage.from("forms").createSignedUrl(form.file_url, 300);
      if (error) throw error;
      window.open(signed.signedUrl, "_blank");
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
      a.download = form.form_name || "form.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: String(err?.message || err) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Document Scanner</h1>
        <p className="text-muted-foreground">Uploads should be digital PDFs (selectable text). Scanned images require OCR.</p>
      </div>

      <Card className="shadow-card border-2 border-dashed">
        <CardContent className="pt-6 text-center py-12">
          <Upload className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">Upload Your Forms</h3>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || scanning}>
              {uploading ? "Uploading..." : scanning ? "Scanning..." : "Choose File"}
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms.map((form: any) => (
          <Card key={form.id} className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <FileText className="h-6 w-6 text-primary" />
                  <div>
                    <div className="font-medium">{form.form_name}</div>
                    <div className="text-xs text-muted-foreground">Uploaded {format(new Date(form.created_at), "MMM d, yyyy")}</div>
                  </div>
                </div>
                <Badge variant="outline">{form.status}</Badge>
              </div>
            </CardHeader>
            <div className="p-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleViewForm(form)}><Eye className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => handleDownload(form)}><Download className="h-4 w-4" /></Button>
              {form.extracted_fields?.length > 0 && <Button size="sm" variant="outline" onClick={() => { setSelectedForm(form); setShowFieldsDialog(true); setFieldValues({}); }}><Edit className="h-4 w-4" /></Button>}
              <Button size="sm" variant="outline" onClick={() => confirm("Delete?") && supabase.from("forms").delete().eq("id", form.id).then(() => queryClient.invalidateQueries({ queryKey: ["forms"] }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showFieldsDialog} onOpenChange={setShowFieldsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fill Form Fields</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {selectedForm?.extracted_fields?.map((f: any, i: number) => (
              <div key={f.id || i} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input id={f.key} value={fieldValues[f.key] || ""} onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })} />
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
