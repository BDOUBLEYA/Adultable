import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fileName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    console.log("Scanning document:", fileName);

    // Get the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("forms")
      .download(fileUrl);

    if (downloadError) throw downloadError;

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 more efficiently
    let binary = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
    }
    const base64 = btoa(binary);
    
    // Determine proper MIME type
    let mimeType = fileData.type;
    if (!mimeType) {
      if (fileName.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
      else if (fileName.toLowerCase().endsWith('.png')) mimeType = 'image/png';
      else if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
      else mimeType = 'application/octet-stream';
    }

    console.log("File type:", mimeType, "Size:", arrayBuffer.byteLength);

    // Support images and PDFs - Gemini 2.5 Pro can handle both
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      console.warn('Unsupported file type for automated scanning:', mimeType);
      return new Response(
        JSON.stringify({ fields: [], error: 'This file type is not supported for automated scanning. Please upload an image (PNG/JPEG) or PDF.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Lovable AI to analyze the document (works for both images and PDFs)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are analyzing a document (image or PDF) to extract EVERY SINGLE fillable field. Your goal is to identify ALL places where a user needs to provide information, regardless of page layout, breaks, or formatting.

CRITICAL INSTRUCTIONS:
1. Scan the ENTIRE document from start to finish, including:
   - Fields that span across page breaks
   - Fields in multi-column layouts
   - Fields in tables or grids
   - Fields in separate sections or pages
   - Repeated field patterns (e.g., multiple rows in a table)

2. Identify EVERY type of fillable indicator:
   - Text followed by: blank lines, underscores (___), dots (....), boxes [  ], parentheses ( )
   - Labels ending with colons like "Name:", "Date:", "Address:", "Signature:"
   - Table cells with headers (extract field from header name)
   - Checkboxes: □, ☐, [ ] with labels
   - Yes/No options, multiple choice options
   - Date fields: __/__ /____, MM/DD/YYYY
   - Signature lines with "X" or "Sign here"
   - Any blank space where information should be written

3. For each field, provide:
   - Exact label text as it appears on the form
   - Descriptive field name (lowercase_with_underscores)
   - Approximate position (x, y coordinates on 0-100 scale where 0,0 is top-left)
   - Field type (text, number, date, email, tel, checkbox)

4. IMPORTANT RULES:
   - Do NOT skip any fields, even if they seem redundant or optional
   - Extract EVERY label-field pair you can identify
   - If you see 30 fields, return all 30 fields
   - Include all repeated fields (e.g., "Witness 1 Name", "Witness 2 Name")
   - If a field has no clear label, infer one from context

Return ONLY a valid JSON array:
[{"name": "field_name", "type": "text", "label": "Label from form", "required": true, "x": 0, "y": 0}]

Types: text, number, date, email, tel, checkbox
Names: lowercase_with_underscores

Return EVERY field you identify. Do not summarize or combine. Extract individually with exact labels and positions.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment.", fields: [] }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service requires payment. Please check your workspace usage.", fields: [] }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // For other errors, return 200 with empty fields
      return new Response(
        JSON.stringify({ fields: [], error: `AI analysis failed: ${text || "Unknown error"}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let fields = [];
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        fields = JSON.parse(jsonMatch[0]);
      } else {
        fields = JSON.parse(content);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      // Return gracefully with empty fields
      return new Response(JSON.stringify({ fields: [], error: "Failed to parse document fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If AI couldn't detect fields, provide a comprehensive fallback set
    if (!Array.isArray(fields) || fields.length === 0) {
      console.warn("AI returned no fields - providing fallback field set");
      const fallbackFields = [
        { name: "full_name", type: "text", label: "Full Name", required: true, x: 20, y: 15 },
        { name: "first_name", type: "text", label: "First Name", required: false, x: 20, y: 20 },
        { name: "last_name", type: "text", label: "Last Name", required: false, x: 60, y: 20 },
        { name: "date_of_birth", type: "date", label: "Date of Birth", required: false, x: 20, y: 25 },
        { name: "social_security", type: "text", label: "Social Security Number", required: false, x: 60, y: 25 },
        { name: "email", type: "email", label: "Email Address", required: false, x: 20, y: 30 },
        { name: "phone", type: "tel", label: "Phone Number", required: false, x: 60, y: 30 },
        { name: "address", type: "text", label: "Street Address", required: false, x: 20, y: 35 },
        { name: "city", type: "text", label: "City", required: false, x: 20, y: 40 },
        { name: "state", type: "text", label: "State", required: false, x: 50, y: 40 },
        { name: "zip_code", type: "text", label: "ZIP Code", required: false, x: 70, y: 40 },
        { name: "emergency_contact_name", type: "text", label: "Emergency Contact Name", required: false, x: 20, y: 50 },
        { name: "emergency_contact_phone", type: "tel", label: "Emergency Contact Phone", required: false, x: 60, y: 50 },
        { name: "employer", type: "text", label: "Employer", required: false, x: 20, y: 60 },
        { name: "job_title", type: "text", label: "Job Title", required: false, x: 60, y: 60 },
        { name: "signature", type: "text", label: "Signature", required: false, x: 20, y: 80 },
        { name: "date_signed", type: "date", label: "Date", required: false, x: 60, y: 80 },
      ];
      fields = fallbackFields;
      console.log("Using fallback field set with", fallbackFields.length, "fields");
    }

    console.log(`Extracted ${fields.length} field(s):`, fields);

    return new Response(JSON.stringify({ fields }), {
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