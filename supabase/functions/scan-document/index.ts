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
                text: `Analyze this document (image or PDF) carefully and extract all form fields that need to be filled out. Look for:
- Labels followed by blank spaces, underlines, or boxes
- Text ending with colons (e.g., "Name:", "Date of Birth:", "Address:")
- Checkboxes and radio buttons
- Any areas where information should be entered

Return ONLY a valid JSON array with this exact structure:
[{"name": "field_name", "type": "text", "label": "Human readable label", "required": true}]

Available types: text, number, date, email, tel, checkbox
Make field names lowercase with underscores (e.g., "first_name", "date_of_birth").

If you cannot identify any fields, return an empty array: []`
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment.", fields: [] }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service requires payment. Please check your workspace usage.", fields: [] }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // For other errors, return 200 with empty fields to avoid breaking the UI
      return new Response(JSON.stringify({ fields: [], error: `AI analysis failed: ${text || 'Unknown error'}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    console.log("Extracted fields:", fields);

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