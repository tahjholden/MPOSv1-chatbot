import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { theme, user_id } = await req.json();

    // OpenAI API call for practice blocks
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You generate modular basketball practice blocks for a session. Output JSON, no explanation.' },
          { role: 'user', content: `Create practice session blocks for theme: "${theme}".` }
        ],
        temperature: 0.6,
      }),
    });

    const { choices } = await openaiRes.json();
    const blocks = JSON.parse(choices?.[0]?.message?.content || '[]');

    // Generate new session_id (uuid)
    const session_id = crypto.randomUUID();

    // Log blocks to Supabase
    const { data, error } = await supabase
      .from('mpbc_practice_session_blocks')
      .insert(
        blocks.map((block: any, i: number) => ({
          session_id,
          block_id: crypto.randomUUID(),
          block_order: i + 1,
          ...block
        }))
      );
    if (error) return NextResponse.json({ error }, { status: 500 });

    return NextResponse.json({ session_id, blocks: data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.toString() }, { status: 500 });
  }
}