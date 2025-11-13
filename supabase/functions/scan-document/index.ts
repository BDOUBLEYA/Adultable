import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib?dts";

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
    const storageRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/forms/${fileUrl}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      }
    );

    if (!storageRes.ok) {
      throw new Error(`Unable to fetch PDF from storage (${storageRes.status})`);
    }

    const pdfBytes = new Uint8Array(await storageRes.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const fields = form.getFields().map((f: any) => {
      const name = f.getName();
      const type = f.constructor.name;
      let fieldType = "text";
      if (type.includes("Button")) fieldType = "checkbox";
      if (type.includes("Dropdown")) fieldType = "select";
      if (type.includes("Option")) fieldType = "radio";

      return {
        name,
        label: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        type: fieldType,
        required: false,
      };
    });

    return new Response(
      JSON.stringify({ fields }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("Scan error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
