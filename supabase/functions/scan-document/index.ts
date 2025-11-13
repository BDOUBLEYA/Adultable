import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib?dts";

// Optional: for OCR fallback when no AcroForm fields found
const OCR_API = "https://api.ocr.space/parse/image";

serve(async (req) => {
  try {
    const { fileUrl } = await req.json();
    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "Missing fileUrl" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch the PDF from Supabase Storage
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${fileUrl}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      }
    );
    if (!res.ok) throw new Error(`Failed to fetch PDF from storage`);

    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const pdfFields = form.getFields();

    let fields = pdfFields.map((f: any) => ({
      name: f.getName(),
      label: f.getName().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      type: "text",
      required: false,
    }));

    // 👇 OCR Fallback if no fillable fields exist
    if (fields.length === 0) {
      console.log("No fillable fields found, running OCR fallback...");
      const ocrRes = await fetch(OCR_API, {
        method: "POST",
        headers: {
          apikey: Deno.env.get("OCR_SPACE_API_KEY") ?? "",
        },
        body: new URLSearchParams({
          url: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${fileUrl}`,
          isOverlayRequired: "false",
          OCREngine: "2",
        }),
      });

      const ocrJson = await ocrRes.json();
      const text = ocrJson?.ParsedResults?.[0]?.ParsedText ?? "";

      // crude extraction of likely field labels
      const lines = text.split("\n").filter((l: string) => l.trim().length > 2);
      fields = lines.slice(0, 10).map((line: string, i: number) => ({
        name: `field_${i + 1}`,
        label: line.trim(),
        type: "text",
        required: false,
      }));
    }

    return new Response(JSON.stringify({ fields }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
