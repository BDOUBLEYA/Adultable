import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib?dts";

serve(async (req) => {
  try {
    const { fileUrl, fields } = await req.json();

    if (!fileUrl || !fields) {
      return new Response(JSON.stringify({ error: "Missing fileUrl or fields" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch the PDF from Supabase Storage
    const fileRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${fileUrl}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      }
    );

    if (!fileRes.ok) {
      throw new Error(`Unable to fetch PDF from storage (${fileRes.status})`);
    }

    const pdfBytes = new Uint8Array(await fileRes.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    // Fill form fields
    for (const f of fields) {
      const field = form.getFieldMaybe(f.name);
      if (!field) continue;
      try {
        if (f.type === "checkbox") {
          if (f.value === true || f.value === "true" || f.value === "on") {
            (field as any).check?.();
          } else {
            (field as any).uncheck?.();
          }
        } else {
          (field as any).setText?.(f.value?.toString() || "");
        }
      } catch (err) {
        console.warn(`Could not fill field "${f.name}":`, err);
      }
    }

    form.flatten(); // Prevent further editing

    const filledBytes = await pdfDoc.save();
    const filledFileName = `filled_${Date.now()}.pdf`;

    // Upload the filled PDF to Supabase Storage
    const uploadRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${filledFileName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/pdf",
        },
        body: filledBytes,
      }
    );

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload filled PDF (${uploadRes.status})`);
    }

    return new Response(
      JSON.stringify({ filledFileUrl: filledFileName }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("Fill error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
