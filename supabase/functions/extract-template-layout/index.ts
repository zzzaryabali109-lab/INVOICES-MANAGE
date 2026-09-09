import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fieldKeys = [
  'invoice_number',
  'date',
  'shipper',
  'consignee',
  'notify_party',
  'container_info',
  'vessel',
  'hs_code',
  'port_of_loading',
  'port_of_discharge',
  'goods_description',
  'shipping_marks',
  'packages',
  'gross_weight',
  'unit_price',
  'amount',
  'reference',
  'company_name',
] as const;

const boxSchema = {
  type: 'object',
  properties: {
    x: { type: 'number', description: 'Left position normalized from 0 to 1.' },
    y: { type: 'number', description: 'Top position normalized from 0 to 1.' },
    w: { type: 'number', description: 'Width normalized from 0 to 1.' },
    h: { type: 'number', description: 'Height normalized from 0 to 1.' },
    align: { type: 'string', enum: ['left', 'center', 'right'] },
    font_size: { type: 'number', description: 'Approximate printed font size in points.' },
    max_lines: { type: 'number', description: 'Maximum visible lines for the text block.' },
    bold: { type: 'boolean', description: 'Whether the text appears bold.' },
  },
  required: ['x', 'y', 'w', 'h'],
  additionalProperties: false,
};

const layoutTool = {
  type: 'function',
  function: {
    name: 'extract_template_blueprint',
    description: 'Return an exact invoice template blueprint with normalized text blocks and graphic regions.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Main invoice title exactly as printed.' },
        has_shipper_section: { type: 'boolean' },
        has_consignee_section: { type: 'boolean' },
        has_notify_party: { type: 'boolean' },
        has_container_info: { type: 'boolean' },
        has_vessel_section: { type: 'boolean' },
        has_port_section: { type: 'boolean' },
        has_hs_code: { type: 'boolean' },
        has_goods_description: { type: 'boolean' },
        has_shipping_marks: { type: 'boolean' },
        has_weight_pricing: { type: 'boolean' },
        has_bales_packages: { type: 'boolean' },
        has_stamp_area: { type: 'boolean' },
        company_name_position: { type: 'string', enum: ['bottom', 'top'] },
        layout_style: { type: 'string', enum: ['two-column', 'single-column'] },
        sections_order: {
          type: 'array',
          items: { type: 'string' },
        },
        show_lines: { type: 'boolean', description: 'Whether custom vector lines should be drawn. Prefer false.' },
        use_exact_positions: { type: 'boolean', description: 'Must be true when exact positioning data is provided.' },
        static_texts: {
          type: 'array',
          description: 'Fixed printed texts that should be redrawn as text, excluding dynamic field labels already captured in fields.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              box: boxSchema,
            },
            required: ['text', 'box'],
            additionalProperties: false,
          },
        },
        fields: {
          type: 'array',
          description: 'Dynamic invoice fields with their printed label blocks and value blocks.',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: [...fieldKeys] },
              label: { type: 'string' },
              label_box: boxSchema,
              value_box: boxSchema,
            },
            required: ['key'],
            additionalProperties: false,
          },
        },
        image_regions: {
          type: 'array',
          description: 'Graphic regions to crop from the original template, for example logo or stamp.',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['logo', 'stamp'] },
              box: boxSchema,
            },
            required: ['key', 'box'],
            additionalProperties: false,
          },
        },
      },
      required: ['show_lines', 'use_exact_positions'],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'No file data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `You are an invoice template layout mapper.

Analyze the uploaded blank invoice / packing template and return an exact rendering blueprint so the frontend can recreate the invoice WITHOUT using the full page as a background image and WITHOUT adding generic table lines.

Rules:
- Use normalized coordinates from 0 to 1 relative to the full page.
- Be precise. We need same-to-same placement.
- fields must only use these keys: invoice_number, date, shipper, consignee, notify_party, container_info, vessel, hs_code, port_of_loading, port_of_discharge, goods_description, shipping_marks, packages, gross_weight, unit_price, amount, reference, company_name.
- Use label_box for printed field labels and value_box for the user-filled values.
- Put fixed printed headings or title in static_texts only if they are not already included as field labels.
- image_regions should only include visible graphics to crop from the template, such as a logo or stamp.
- If no logo or stamp is visible, omit the region.
- show_lines should be false unless the template absolutely requires extra vector lines. Prefer false.
- use_exact_positions must be true.
- Estimate font sizes conservatively and keep max_lines realistic.
- Return the title exactly as it appears on the template.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${fileBase64}`,
            },
          },
          {
            type: 'text',
            text: 'Map this invoice template for exact AI-based PDF recreation with no background image and no extra lines.',
          },
        ],
      },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages,
        temperature: 0.1,
        tools: [layoutTool],
        tool_choice: {
          type: 'function',
          function: { name: 'extract_template_blueprint' },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'AI rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits required. Please top up workspace usage and try again.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.find((call: any) => call.function?.name === 'extract_template_blueprint');

    let parsed = null;
    try {
      if (toolCall?.function?.arguments) {
        parsed = JSON.parse(toolCall.function.arguments);
      } else {
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, JSON.stringify(data));
      parsed = null;
    }

    const normalized = parsed
      ? {
          ...parsed,
          show_lines: false,
          use_exact_positions: true,
        }
      : {
          show_lines: false,
          use_exact_positions: true,
          fields: [],
          static_texts: [],
          image_regions: [],
        };

    return new Response(JSON.stringify(normalized), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in extract-template-layout:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
