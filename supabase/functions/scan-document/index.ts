import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type BBox = { x: number; y: number; width?: number; height?: number };

type Field = {
  name: string;
  type: "text" | "number" | "date" | "email" | "tel" | "checkbox";
  label: string;
  required?: boolean;
  page?: number;
  bbox?: BBox;
  x?: number; // legacy support
  y?: number; // legacy support
  confidence?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { fileUrl, fileName, images } = body as { fileUrl?: string; fileName?: string; images?: string[] };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log("Scanning document:", fileName || fileUrl);

    // Optional: resolve the related form (to persist fields)
    let formRow: any = null;
    if (fileUrl) {
      const { data: formsLookup, error: formsErr } = await supabase
        .from("forms")
        .select("id,user_id")
        .eq("file_url", fileUrl)
        .limit(1)
        .maybeSingle();
      if (formsErr) console.warn("forms lookup error:", formsErr.message);
      formRow = formsLookup || null;
    }

    // Collect page images (preferred for PDFs), else fall back to single file
    const pageImages: { dataUrl: string; page: number }[] = [];

    if (Array.isArray(images) && images.length > 0) {
      let p = 1;
      for (const img of images) {
        if (!img) continue;
        const dataUrl = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
        pageImages.push({ dataUrl, page: p++ });
      }
    } else if (fileUrl) {
      // Download the file and send as-is (image or PDF) to the AI
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("forms")
        .download(fileUrl);
      if (downloadError) throw downloadError;

      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert to base64 efficiently
      let binary = '';
      const chunkSize = 0x8000; // 32KB
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);

      let mimeType = (fileData as any).type as string | undefined;
      if (!mimeType) {
        const lower = (fileName || '').toLowerCase();
        if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (lower.endsWith('.png')) mimeType = 'image/png';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else mimeType = 'application/octet-stream';
      }

      // Push as a single item; Gemini can read PDFs directly
      pageImages.push({ dataUrl: `data:${mimeType};base64,${base64}`, page: 1 });
      console.log("File type:", mimeType, "Size:", arrayBuffer.byteLength);

      if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
        console.warn('Unsupported file type for automated scanning:', mimeType);
        return new Response(
          JSON.stringify({ fields: [], error: 'This file type is not supported for automated scanning. Please upload an image (PNG/JPEG) or PDF.' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build multimodal prompt with all pages
    const content: any[] = [
      {
        type: "text",
        text: `You are extracting EVERY SINGLE fillable field across a multi-page form. Be exhaustive and page-aware.

DETECTION:
- Labels with colons, blanks/underscores/dots, boxes/checkboxes, parentheses options, signature lines (X/Sign here)
- Fields inside tables/grids, multi-column layouts, and across page breaks
- Repeated rows must produce separate fields

RETURN STRICT JSON ARRAY ONLY. EACH OBJECT:
{
  "name": "lowercase_with_underscores",
  "type": "text|number|date|email|tel|checkbox",
  "label": "Exact or best inferred label",
  "required": true,
  "page": 1,
  "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "confidence": 0.0
}
COORDINATES:
- bbox uses top-left origin in percent (0-100) of page image size
- x,y should point to BEGINNING of the writable area (blank/box), not the label
- width/height should cover the writable region for text
QUALITY:
- Do not summarize/combine; output each field individually (40-200+ if present)
- If label missing, infer; set required=false unless clearly required`
      }
    ];

    for (const p of pageImages) {
      content.push({ type: "image_url", image_url: { url: p.dataUrl } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: [{ role: "user", content }] }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, text);
      const status = aiResp.status;
      if (status === 429 || status === 402) {
        const msg = status === 429 ? "Rate limit exceeded. Please try again in a moment." : "AI service requires payment. Please check your workspace usage.";
        return new Response(JSON.stringify({ error: msg, fields: [] }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ fields: [], error: `AI analysis failed: ${text || 'Unknown error'}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const contentText = data.choices?.[0]?.message?.content ?? "";

    let fields: Field[] = [];
    try {
      const jsonMatch = contentText.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : contentText);
      if (Array.isArray(parsed)) fields = parsed as Field[];
    } catch (e) {
      console.error("Failed to parse AI response:", contentText);
      return new Response(JSON.stringify({ fields: [], error: "Failed to parse document fields" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Normalize fields
    const normalized: Field[] = [];
    for (const f of fields) {
      if (!f) continue;
      const name = (f.name || f.label || "").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      if (!name) continue;
      let type: Field["type"] = (f.type as any) || "text";
      if (!(["text","number","date","email","tel","checkbox"] as const).includes(type)) type = "text";
      const page = Math.max(1, Number((f as any).page || 1) || 1);

      let bbox: BBox | undefined = (f as any).bbox;
      if (!bbox && typeof (f as any).x === 'number' && typeof (f as any).y === 'number') {
        bbox = { x: (f as any).x, y: (f as any).y, width: 20, height: 5 };
      }
      if (bbox) {
        bbox = {
          x: Math.min(100, Math.max(0, Number(bbox.x))),
          y: Math.min(100, Math.max(0, Number(bbox.y))),
          width: bbox.width !== undefined ? Math.min(100, Math.max(0.5, Number(bbox.width))) : 20,
          height: bbox.height !== undefined ? Math.min(100, Math.max(1, Number(bbox.height))) : 5,
        };
      }

      normalized.push({
        name,
        type,
        label: String(f.label || name),
        required: Boolean((f as any).required),
        page,
        bbox,
        confidence: typeof f.confidence === 'number' ? f.confidence : undefined,
      });
    }

    console.log(`Extracted ${normalized.length} field(s)`);

    // Persist to DB if we have a matching form
    if (formRow?.id && normalized.length > 0) {
      const formId = formRow.id as string;
      const userId = formRow.user_id as string;

      // Replace existing detected fields for this form
      const { error: delErr } = await supabase.from('form_fields').delete().eq('form_id', formId);
      if (delErr) console.warn('Failed to clear existing form_fields:', delErr.message);

      // Bulk insert
      const payload = normalized.map((f) => ({
        form_id: formId,
        user_id: userId,
        field_key: f.name,
        field_label: f.label,
        bbox: f.bbox ? f.bbox : null,
        page: f.page || 1,
        value: null,
        confidence: f.confidence ?? null,
        source: 'ai',
      }));
      const { error: insErr } = await supabase.from('form_fields').insert(payload);
      if (insErr) console.warn('Failed to insert form_fields:', insErr.message);

      // Also update forms.extracted_fields and status for convenience
      const { error: updErr } = await supabase
        .from('forms')
        .update({ extracted_fields: normalized, status: 'scanned' })
        .eq('id', formId);
      if (updErr) console.warn('Failed to update forms with fields:', updErr.message);
    }

    return new Response(JSON.stringify({ fields: normalized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});