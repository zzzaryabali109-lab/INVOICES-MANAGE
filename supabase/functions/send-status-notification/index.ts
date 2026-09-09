import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  email: string;
  containerNumber: string;
  oldStatus: string;
  newStatus: string;
  vesselName?: string;
  eta?: string;
  destinationPort?: string;
}

// HTML escape function to prevent XSS
function escapeHtml(unsafe: string | undefined | null): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "CargoTrack <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend API error: ${error}`);
  }
  
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    const { email, containerNumber, oldStatus, newStatus, vesselName, eta, destinationPort }: NotificationRequest = await req.json();

    // Validate required fields
    if (!email || !containerNumber || !newStatus) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format and sanitize
    const sanitizedEmail = email.trim().toLowerCase().replace(/[\r\n]/g, '');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail) || sanitizedEmail.length > 254) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate other inputs length
    if (containerNumber.length > 50 || newStatus.length > 50) {
      return new Response(
        JSON.stringify({ error: "Input values too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the container belongs to the authenticated user
    const { data: container, error: containerError } = await supabase
      .from('tracked_containers')
      .select('user_id')
      .eq('container_number', containerNumber)
      .eq('user_id', userId)
      .maybeSingle();

    if (containerError) {
      console.error('Container lookup error:', containerError);
      return new Response(
        JSON.stringify({ error: "Failed to verify container ownership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!container) {
      return new Response(
        JSON.stringify({ error: "Container not found or not owned by user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending notification to ${sanitizedEmail} for container ${containerNumber}: ${oldStatus} -> ${newStatus}`);

    const statusEmoji: Record<string, string> = {
      'In Transit': '🚢',
      'Arrived': '⚓',
      'Discharged': '📦',
      'Loading': '🏗️',
      'Delivered': '✅',
      'Pending': '⏳',
      'Not Available': '❌'
    };
    const emoji = statusEmoji[newStatus] || '📍';

    // Escape all user-controlled values to prevent XSS
    const safeContainerNumber = escapeHtml(containerNumber);
    const safeOldStatus = escapeHtml(oldStatus) || 'Unknown';
    const safeNewStatus = escapeHtml(newStatus);
    const safeVesselName = escapeHtml(vesselName);
    const safeDestinationPort = escapeHtml(destinationPort);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin: 10px 0; }
          .status-old { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
          .status-new { background: #dcfce7; color: #166534; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
          .detail-label { color: #64748b; }
          .detail-value { font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
          .arrow { font-size: 24px; margin: 0 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">📦 Container Status Update</h1>
            <p style="margin: 10px 0 0; opacity: 0.9;">Your container status has changed</p>
          </div>
          <div class="content">
            <h2 style="margin-top: 0; color: #1e293b;">Container: ${safeContainerNumber}</h2>
            
            <div style="text-align: center; margin: 20px 0;">
              <span class="status-badge status-old">${safeOldStatus}</span>
              <span class="arrow">→</span>
              <span class="status-badge status-new">${emoji} ${safeNewStatus}</span>
            </div>
            
            <div class="details">
              ${safeVesselName ? `
              <div class="detail-row">
                <span class="detail-label">Vessel</span>
                <span class="detail-value">${safeVesselName}</span>
              </div>` : ''}
              ${safeDestinationPort ? `
              <div class="detail-row">
                <span class="detail-label">Destination</span>
                <span class="detail-value">${safeDestinationPort}</span>
              </div>` : ''}
              ${eta ? `
              <div class="detail-row">
                <span class="detail-label">ETA</span>
                <span class="detail-value">${escapeHtml(new Date(eta).toLocaleString())}</span>
              </div>` : ''}
              <div class="detail-row" style="border-bottom: none;">
                <span class="detail-label">Updated</span>
                <span class="detail-value">${new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div class="footer">
            <p>CargoTrack Pro — Real-time container tracking</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await sendEmail(
      sanitizedEmail,
      `${emoji} Container ${safeContainerNumber} - Status: ${safeNewStatus}`,
      html
    );

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
