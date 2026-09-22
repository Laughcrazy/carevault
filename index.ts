// Supabase Edge Function: process-record
// Deno runtime. Deploy with: supabase functions deploy process-record
//
// Triggered by a Postgres webhook (Database Webhooks -> records table, on
// INSERT/UPDATE where status = 'uploaded') OR called directly by the client
// right after upload. Either way it:
//   1. loads the record + a short-lived signed URL for the file
//   2. sends the image/PDF to Gemini with a strict JSON schema
//   3. writes an `extractions` row (+ medications + vitals) as a DRAFT
//   4. never marks anything "completed" until the patient confirms it
//
// Uses Gemini because it's cheaper than GPT-4o at this volume and its
// structured-output mode (responseSchema) removes most JSON-parsing failures.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = "gemini-2.5-flash"; // swap to -pro if extraction quality needs it

// Server-side client using the service role key. This function is the ONLY
// place that key is ever used — never ship it to the mobile app.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// What we force Gemini to return. Nothing free-form reaches the database.
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: ["prescription", "lab_result", "discharge_summary", "imaging_report", "clinical_note", "other"],
    },
    visit_date: { type: "string", description: "ISO 8601 date, or null if illegible", nullable: true },
    facility_name: { type: "string", nullable: true },
    physician_name: { type: "string", nullable: true },
    summary: { type: "string", description: "One or two plain-language sentences, no diagnosis, no advice" },
    tags: { type: "array", items: { type: "string" } },
    confidence: { type: "number", description: "0 to 1, your overall confidence reading this page" },
    low_confidence_fields: {
      type: "array",
      items: { type: "string" },
      description: "Names of fields above that you are genuinely unsure about",
    },
    medications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dose: { type: "string", nullable: true },
          route: { type: "string", nullable: true },
          frequency: { type: "string", nullable: true },
          duration: { type: "string", nullable: true },
          confidence: { type: "number" },
        },
        required: ["name", "confidence"],
      },
    },
    vitals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string", description: "short snake_case id, e.g. bp_systolic, hba1c, weight_kg" },
          value_num: { type: "number", nullable: true },
          value_text: { type: "string", nullable: true },
          unit: { type: "string", nullable: true },
          reference_low: { type: "number", nullable: true },
          reference_high: { type: "number", nullable: true },
          confidence: { type: "number" },
        },
        required: ["code", "confidence"],
      },
    },
  },
  required: ["document_type", "summary", "tags", "confidence", "low_confidence_fields", "medications", "vitals"],
};

const SYSTEM_INSTRUCTION = `You are a document-structuring assistant for a personal health record app.
You transcribe and structure what is written on the page. You are NOT a clinician.

Rules:
- Extract only what is visibly written. Never infer a diagnosis, never fill in a
  plausible-looking value that is not on the page.
- If handwriting is ambiguous, give your best reading and list that field in
  low_confidence_fields rather than guessing silently.
- summary must describe the document, not interpret the patient's health. Do not
  say whether a result is good, bad, normal or concerning.
- confidence is your genuine estimate for the whole document, not a fixed number.
- Output must match the given schema exactly. No prose outside the JSON.`;

Deno.serve(async (req) => {
  try {
    const { record_id } = await req.json();
    if (!record_id) return json({ error: "record_id is required" }, 400);

    const { data: record, error: recErr } = await admin
      .from("records")
      .select("id, subject_id, storage_path, mime_type, client_uuid")
      .eq("id", record_id)
      .single();
    if (recErr || !record) return json({ error: "record not found" }, 404);

    // Consent gate — the whole point of the ai_processing_consent_at column.
    const { data: subject } = await admin
      .from("subjects")
      .select("user_id")
      .eq("id", record.subject_id)
      .single();
    const { data: settings } = await admin
      .from("account_settings")
      .select("ai_processing_consent_at, ai_processing_revoked_at")
      .eq("user_id", subject!.user_id)
      .single();
    if (!settings?.ai_processing_consent_at || settings.ai_processing_revoked_at) {
      await admin.from("records").update({ status: "needs_review", failure_reason: "ai_consent_not_granted" })
        .eq("id", record_id);
      return json({ status: "skipped", reason: "consent not granted" });
    }

    await admin.from("records").update({ status: "processing" }).eq("id", record_id);

    const { data: signed, error: urlErr } = await admin.storage
      .from("records")
      .createSignedUrl(record.storage_path, 300); // 5 minutes, just enough to fetch
    if (urlErr || !signed) throw new Error("could not sign file url: " + urlErr?.message);

    const fileRes = await fetch(signed.signedUrl);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const base64 = encodeBase64(bytes);

    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: "user",
            parts: [
              { inline_data: { mime_type: record.mime_type ?? "image/jpeg", data: base64 } },
              { text: "Structure this medical document per the schema." },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: EXTRACTION_SCHEMA,
            temperature: 0.1,
          },
        }),
      },
    );

    if (!gRes.ok) {
      const errText = await gRes.text();
      await admin.from("records").update({
        status: "failed",
        failure_reason: `gemini_error: ${gRes.status} ${errText.slice(0, 300)}`,
      }).eq("id", record_id);
      return json({ error: "extraction failed" }, 502);
    }

    const gJson = await gRes.json();
    const text = gJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("empty response from Gemini");
    const parsed = JSON.parse(text);

    // Clamp confidence server-side — never trust the model's arithmetic blindly.
    const clamp = (n: unknown) => Math.max(0, Math.min(1, typeof n === "number" ? n : 0));

    const { data: extraction, error: exErr } = await admin
      .from("extractions")
      .insert({
        record_id,
        model: GEMINI_MODEL,
        prompt_version: "2026-09-1",
        document_type: parsed.document_type,
        visit_date: parsed.visit_date,
        facility_name: parsed.facility_name,
        physician_name: parsed.physician_name,
        summary: parsed.summary,
        tags: parsed.tags ?? [],
        confidence: clamp(parsed.confidence),
        low_confidence_fields: parsed.low_confidence_fields ?? [],
        raw_response: parsed,
      })
      .select("id")
      .single();
    if (exErr) throw exErr;

    if (parsed.medications?.length) {
      await admin.from("extracted_medications").insert(
        parsed.medications.map((m: any) => ({
          extraction_id: extraction.id,
          name: m.name,
          dose: m.dose ?? null,
          route: m.route ?? null,
          frequency: m.frequency ?? null,
          duration: m.duration ?? null,
          confidence: clamp(m.confidence),
        })),
      );
    }
    if (parsed.vitals?.length) {
      await admin.from("extracted_vitals").insert(
        parsed.vitals.map((v: any) => ({
          extraction_id: extraction.id,
          code: v.code,
          value_num: v.value_num ?? null,
          value_text: v.value_text ?? null,
          unit: v.unit ?? null,
          reference_low: v.reference_low ?? null,
          reference_high: v.reference_high ?? null,
          confidence: clamp(v.confidence),
        })),
      );
    }

    // Low overall confidence, or any low-confidence field -> needs the
    // patient's eyes before it's trusted. Never auto-"completed".
    const needsReview = clamp(parsed.confidence) < 0.75 || (parsed.low_confidence_fields?.length ?? 0) > 0;
    await admin.from("records")
      .update({ status: needsReview ? "needs_review" : "completed" })
      .eq("id", record_id);

    return json({ status: "ok", extraction_id: extraction.id, needs_review: needsReview });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
