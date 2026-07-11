// Supabase Edge Function: send-push
// Deploy via Supabase Dashboard → Edge Functions → your "send-push" function → replace with this code → Deploy

import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function buildNotification(table: string, record: any) {
  if (table === "assignments") {
    return {
      title: "📝 New assignment",
      body: `${record.code} — ${record.title} (due ${record.due})`,
    };
  }
  if (table === "exams") {
    return {
      title: "🎯 New exam scheduled",
      body: `${record.code} — ${record.title} on ${record.exam_date}`,
    };
  }
  // default: announcements
  return {
    title: "📣 New announcement",
    body: record.title || "Check the Vortex.io board",
  };
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const table = payload.table || "announcements";
    const record = payload.record || {};
    const { title, body } = buildNotification(table, record);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const subs = await res.json();
    const notifPayload = JSON.stringify({ title, body, url: "/" });

    let sent = 0;
    await Promise.all(subs.map(async (s: any) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, notifPayload);
        sent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, {
            method: "DELETE",
            headers: {
              apikey: SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
          });
        }
      }
    }));

    return new Response(JSON.stringify({ sent, total: subs.length, table }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
