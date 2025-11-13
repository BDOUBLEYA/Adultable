// supabase/functions/fill-document/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://cdn.skypack.dev/pdf-lib?dts";

serve(async (req) => {
  try {
    const { fileUrl, fields } = await req.json();
    if (!fileUrl || !fields) {
      return new Response(JSON.stringify({ error: "Missing fileUrl or fields" }), { status: 400 });
    }

    // Fetch original PDF from Supabase storage (using service role key)
    const storageUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${fileUrl}`;
    const res = await fetch(storageUrl, {
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch PDF from storage (${res.status})`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(bytes);

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // fields: [{ page: number, x: number, y: number, fontSize: number, value: string }]
    for (const f of fields) {
      const pageIndex = Math.max(0, Math.min(pdfDoc.getPageCount() - 1, f.page - 1));
      const page = pdfDoc.getPage(pageIndex);
      // PDF coordinate system origin (0,0) is bottom-left. pdf.js transform uses same user space baseline.
      // Ensure y is measured from bottom. If your frontend gave y from pdfjs transform (which is baseline),
      // you may need to invert depending on how you computed it. We'll assume y is in PDF user space already.
      const { width, height } = page.getSize();
      const text = String(f.value || "");
      const fontSize = f.fontSize || 10;

      // safety clamp x,y
      let x = Math.max(5, Math.min(width - 5, f.x || 20));
      let y = Math.max(5, Math.min(height - 5, f.y || (height - fontSize - 5)));

      // Draw text
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }

    // Optionally flatten? pdf-lib doesn't have a built-in flatten, but since we draw text onto pages, that's effectively "flattened".

    const filledBytes = await pdfDoc.save();
    const filledFileName = `filled_${Date.now()}.pdf`;

    // Upload back to Supabase storage (PUT)
    const uploadRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${filledFileName}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/pdf",
      },
      body: filledBytes,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed with status ${uploadRes.status}`);
    }

    return new Response(JSON.stringify({ filledFileUrl: filledFileName }), { status: 200 });
  } catch (err: any) {
    console.error("fill-document error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
});
