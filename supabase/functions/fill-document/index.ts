import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fields } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    console.log("Filling document:", fileUrl, "with", fields?.length, "fields");

    // Get the original file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("forms")
      .download(fileUrl);

    if (downloadError) throw downloadError;

    // Check if it's a PDF
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Load the PDF
    const pdfDoc = await PDFDocument.load(uint8Array);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;

    // Get page dimensions
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    console.log("PDF dimensions:", width, "x", height);

    // Draw text on the PDF based on field positions
    for (const field of fields) {
      if (!field.value || !field.x || !field.y) continue;

      // Convert from 0-100 scale to actual PDF coordinates
      // PDF coordinate system: (0,0) is bottom-left, so we need to invert Y
      const xPos = (field.x / 100) * width;
      const yPos = height - ((field.y / 100) * height); // Invert Y axis

      const text = String(field.value);

      // Draw on first page (for now - can be extended to support multi-page)
      firstPage.drawText(text, {
        x: xPos,
        y: yPos,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });

      console.log(`Drew "${text}" at (${xPos}, ${yPos})`);
    }

    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();

    // Upload the filled PDF back to storage
    const filledFileName = fileUrl.replace(/(\.[^.]+)$/, "_filled$1");
    const { error: uploadError } = await supabase.storage
      .from("forms")
      .upload(filledFileName, filledPdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    console.log("Filled PDF uploaded:", filledFileName);

    return new Response(
      JSON.stringify({ filledFileUrl: filledFileName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fill-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
