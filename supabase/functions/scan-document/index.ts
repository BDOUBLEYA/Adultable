// supabase/functions/scan-document/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import Tesseract from "npm:tesseract.js";

serve(async (req) => {
  try {
    const { fileUrl, images } = await req.json();

    if (!fileUrl || !images || !Array.isArray(images)) {
      return new Response(
        JSON.stringify({ error: "Missing fileUrl or images array" }),
        { status: 400 }
      );
    }

    console.log("Scanning document:", fileUrl);

    // Perform OCR on all pages
    let allText = "";
    for (const img of images) {
      const result = await Tesseract.recognize(img, "eng");
      allText += "\n" + result.data.text;
    }

    // Simple field detection logic
    const possibleFields = [
      "name",
      "first name",
      "last name",
      "date of birth",
      "dob",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "zip",
      "ssn",
      "signature",
      "date",
    ];

    const detectedFields: any[] = [];

    for (const keyword of possibleFields) {
      const regex = new RegExp(`${keyword}\\s*[:\\-]?`, "i");
      if (regex.test(allText)) {
        detectedFields.push({
          name: keyword.replace(/\s+/g, "_").toLowerCase(),
          label: keyword.replace(/\b\w/g, (l) => l.toUpperCase()),
          type: keyword.includes("date") ? "date" : "text",
          required: true,
        });
      }
    }

    // If no fields detected, still respond gracefully
    return new Response(
      JSON.stringify({
        fields: detectedFields,
        rawText: allText,
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in scan-document function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
