import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/** 클라이언트 planday-security.js 와 동일 */
const DAILY_API_LIMIT = 100;

function kstTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: { message: "Method not allowed" } }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: { message: "Server configuration error" } }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: { message: "LOGIN_REQUIRED" } }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const {
    data: { user },
    error: authError
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: { message: "LOGIN_REQUIRED" } }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const today = kstTodayStr();
  const { data: dailyRow, error: dailyErr } = await adminClient
    .from("api_usage_daily")
    .select("api_call_count")
    .eq("user_id", user.id)
    .eq("usage_date", today)
    .maybeSingle();

  if (dailyErr) {
    console.warn("daily usage check failed", dailyErr.message);
  } else if ((dailyRow?.api_call_count ?? 0) >= DAILY_API_LIMIT) {
    return jsonResponse({ error: { message: "DAILY_LIMIT_EXCEEDED" } }, 429);
  }

  try {
    const { apiKey, model, body } = await req.json();

    if (!apiKey || typeof apiKey !== "string") {
      return jsonResponse({ error: { message: "apiKey is required" } }, 400);
    }

    if (!body || typeof body !== "object") {
      return jsonResponse({ error: { message: "body is required" } }, 400);
    }

    const modelId = typeof model === "string" && model.trim() ? model.trim() : "gemini-3.6-flash";

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await geminiRes.json().catch(() => ({
      error: { message: `Gemini response parse failed (HTTP ${geminiRes.status})` }
    }));

    if (!geminiRes.ok && !data.error) {
      data.error = { message: `Gemini HTTP ${geminiRes.status}` };
    }

    return jsonResponse(data, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("gemini-chat error", message);
    return jsonResponse({ error: { message: "Internal server error" } }, 500);
  }
});
