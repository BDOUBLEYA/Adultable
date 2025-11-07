import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getDocument, GlobalWorkerOptions } from "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configure PDF.js worker (required in non-browser environments)
GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.mjs";

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

    // Support images and PDFs
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      console.warn('Unsupported file type for automated scanning:', mimeType);
      return new Response(
        JSON.stringify({ fields: [], error: 'This file type is not supported for automated scanning. Please upload an image (PNG/JPEG) or PDF.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI request body depending on file type
    let aiBody: any;

    if (mimeType === 'application/pdf') {
      // Extract text from PDF using pdf.js (first 3 pages)
      let extractedText = '';
      try {
        const loadingTask = getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const maxPages = Math.min(pdf.numPages, 3);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = (textContent.items as any[])
            .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
            .join(' ');
          extractedText += pageText + "\n";
        }
      } catch (err) {
        console.error('PDF text extraction failed:', err);
        return new Response(
          JSON.stringify({ fields: [], error: 'Failed to read PDF for scanning.' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const trimmed = extractedText.slice(0, 20000);
      aiBody = {
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze the following text extracted from a PDF and detect fields a user must fill. Look for labels with colons (Name:, Date of Birth:), underlines, boxes, and common form prompts.\n\nReturn ONLY a valid JSON array with this exact structure:\n[{"name": "field_name", "type": "text", "label": "Human readable label", "required": true}]\n\nAvailable types: text, number, date, email, tel, checkbox. Use lowercase snake_case for names. If unsure, required=false. If no fields, return [].\n\nExtracted PDF text (partial):\n---\n${trimmed}\n---`
              }
            ]
          }
        ]
      };
    } else {
      // Image path: send image directly
      aiBody = {
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this document (image) carefully and extract all form fields that need to be filled out. Look for:\n- Labels followed by blank spaces, underlines, or boxes\n- Text ending with colons (e.g., "Name:", "Date of Birth:", "Address:")\n- Checkboxes and radio buttons\n- Any areas where information should be entered\n\nReturn ONLY a valid JSON array with this exact structure:\n[{"name": "field_name", "type": "text", "label": "Human readable label", "required": true}]\n\nAvailable types: text, number, date, email, tel, checkbox\nMake field names lowercase with underscores (e.g., "first_name", "date_of_birth").\n\nIf you cannot identify any fields, return an empty array: []`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ]
      };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
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