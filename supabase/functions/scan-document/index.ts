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

    // Call Lovable AI to analyze the document
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
                text: `Analyze this document image carefully and extract all form fields that need to be filled out. Look for labels, input boxes, checkboxes, and any areas where information should be entered.

Return ONLY a valid JSON array with this exact structure:
[{"name": "field_name", "type": "text", "label": "Human readable label", "required": true}]

Available types: text, number, date, email
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
      console.error("AI gateway error:", response.status, await response.text());
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service requires payment. Please check your workspace usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
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
      throw new Error("Failed to parse document fields");
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