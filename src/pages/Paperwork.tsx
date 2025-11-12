"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.entry";
import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";
import { v4 as uuidv4 } from "uuid";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Field {
  field_name: string;
  field_type: string;
  field_value?: string;
  field_position?: string;
}

interface FormRecord {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  fields: Field[];
  created_at: string;
}

const PaperworkAssistant: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [scannedFields, setScannedFields] = useState<Field[]>([]);
  const [knownData, setKnownData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load stored forms + known data on mount
  useEffect(() => {
    (async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data: formData } = await supabase
        .from("forms")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const { data: userInfo } = await supabase
        .from("user_personal_info")
        .select("field_name, field_value")
        .eq("user_id", user.id);

      const stored = userInfo?.reduce((acc, curr) => {
        acc[curr.field_name] = curr.field_value;
        return acc;
      }, {} as Record<string, string>);

      setKnownData(stored || {});
      setForms(formData || []);
    })();
  }, []);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    setFile(event.target.files[0]);
  };

  // Parse PDF text or image with OCR
  const processFile = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("No authenticated user found");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${uuidv4()}.${fileExt}`;

      // Upload file to Supabase storage
      const { error: uploadErr } = await supabase.storage
        .from("forms")
        .upload(fileName, file);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("forms")
        .getPublicUrl(fileName);

      const fileUrl = urlData.publicUrl;

      let textContent = "";

      if (file.type === "application/pdf") {
        // Extract text from PDF pages
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let allText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          allText += content.items.map((item: any) => item.str).join(" ");
        }

        textContent = allText;
      } else if (file.type.startsWith("image/")) {
        // OCR for images
        const result = await Tesseract.recognize(file, "eng");
        textContent = result.data.text;
      } else {
        throw new Error("Unsupported file type");
      }

      // Send text to Supabase Edge Function for field detection
      const { data: scanResult, error: scanErr } = await supabase.functions.invoke(
        "scan-document",
        {
          body: { text: textContent },
        }
      );

      if (scanErr) throw scanErr;

      const detectedFields: Field[] =
        scanResult?.data?.fields ||
        scanResult?.fields ||
        extractFallbackFields(textContent);

      // Fill known data where available
      const autofilledFields = detectedFields.map((f) => ({
        ...f,
        field_value: knownData[f.field_name] || "",
      }));

      setScannedFields(autofilledFields);

      // Insert record in forms table
      const { data: insertData, error: insertErr } = await supabase
        .from("forms")
        .insert([
          {
            id: uuidv4(),
            user_id: user.id,
            file_name: file.name,
            file_url: fileUrl,
            fields: autofilledFields,
          },
        ])
        .select()
        .single();

      if (insertErr) throw insertErr;
      if (insertData) setForms((prev) => [insertData, ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [file, knownData]);

  // Fallback field extraction (regex-based)
  const extractFallbackFields = (text: string): Field[] => {
    const matches = text.match(/([A-Z][A-Za-z ]{2,20}):/g) || [];
    return matches.map((m) => ({
      field_name: m.replace(":", "").trim(),
      field_type: "text",
    }));
  };

  // Save updated fields + user info
  const saveFields = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    await Promise.all(
      scannedFields.map(async (field) => {
        if (!field.field_value) return;
        await supabase
          .from("user_personal_info")
          .upsert(
            {
              user_id: user.id,
              field_name: field.field_name,
              field_value: field.field_value,
            },
            { onConflict: "user_id,field_name" }
          )
          .select();
      })
    );

    alert("Saved successfully!");
  };

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-xl font-semibold mb-4">📄 Paperwork Assistant</h2>

      <input
        type="file"
        accept=".pdf, image/*"
        onChange={handleFileUpload}
        className="mb-2"
      />

      <button
        onClick={processFile}
        disabled={!file || loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? "Processing..." : "Scan Document"}
      </button>

      {error && <p className="text-red-500 mt-2">{error}</p>}

      {scannedFields.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-2">Detected Fields</h3>
          <div className="space-y-2">
            {scannedFields.map((field, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="w-40">{field.field_name}</label>
                <input
                  className="border px-2 py-1 flex-1"
                  value={field.field_value || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setScannedFields((prev) =>
                      prev.map((f, idx) =>
                        idx === i ? { ...f, field_value: val } : f
                      )
                    );
                  }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={saveFields}
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded"
          >
            Save Info
          </button>
        </div>
      )}

      {forms.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium mb-2">Your Uploaded Forms</h3>
          <ul className="space-y-1">
            {forms.map((f) => (
              <li key={f.id}>
                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {f.file_name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PaperworkAssistant;
