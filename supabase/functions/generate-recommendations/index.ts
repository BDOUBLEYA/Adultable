import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log("Generating recommendations for user:", user.id);

    // Fetch user context from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [tasksResult, formsResult, mealPlansResult] = await Promise.all([
      supabaseClient.from('tasks').select('*').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()),
      supabaseClient.from('forms').select('*').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()),
      supabaseClient.from('meal_plans').select('*').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()),
    ]);

    const tasks = tasksResult.data || [];
    const forms = formsResult.data || [];
    const mealPlans = mealPlansResult.data || [];

    // Build context for AI
    const incompleteTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);
    const tasksByCategory = tasks.reduce((acc: any, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {});

    const contextPrompt = `Analyze this user's recent activity and generate 3-5 personalized recommendations to help them with adulting tasks.

User Activity Summary:
- Total tasks: ${tasks.length} (${completedTasks.length} completed, ${incompleteTasks.length} incomplete)
- Task categories: ${Object.entries(tasksByCategory).map(([cat, count]) => `${cat}: ${count}`).join(', ')}
- Uploaded documents: ${forms.length}
- Meal plans created: ${mealPlans.length}

Incomplete tasks: ${incompleteTasks.slice(0, 5).map(t => `${t.title} (${t.category}, priority: ${t.priority})`).join('; ')}

Generate actionable recommendations that:
1. Help complete pending tasks or suggest follow-ups
2. Encourage good habits based on their activity patterns
3. Suggest organization or planning improvements
4. Are specific and practical
5. Cover diverse categories: Finance, Health, Organization, Personal Development

Each recommendation should have:
- title: Short, action-oriented (max 60 chars)
- description: Helpful details explaining why and how (max 200 chars)
- category: One of [Finance, Health, Organization, Personal, Productivity]`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful life assistant providing actionable adulting recommendations." },
          { role: "user", content: contextPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_recommendations",
              description: "Generate personalized recommendations for the user",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short action-oriented title" },
                        description: { type: "string", description: "Helpful explanation" },
                        category: { 
                          type: "string", 
                          enum: ["Finance", "Health", "Organization", "Personal", "Productivity"],
                          description: "Category of recommendation"
                        }
                      },
                      required: ["title", "description", "category"],
                      additionalProperties: false
                    },
                    minItems: 3,
                    maxItems: 5
                  }
                },
                required: ["recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_recommendations" } }
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI error:", aiResponse.status, await aiResponse.text());
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData));

    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const recommendations = JSON.parse(toolCall.function.arguments).recommendations;

    // Insert recommendations into database
    const insertData = recommendations.map((rec: any) => ({
      user_id: user.id,
      title: rec.title,
      description: rec.description,
      category: rec.category,
      completed: false,
      dismissed: false
    }));

    const { error: insertError } = await supabaseClient
      .from('recommendations')
      .insert(insertData);

    if (insertError) throw insertError;

    console.log(`Created ${recommendations.length} recommendations`);

    return new Response(
      JSON.stringify({ success: true, count: recommendations.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("generate-recommendations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
