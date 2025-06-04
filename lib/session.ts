import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const {
      session_id,
      user_id,
      theme,
      date,
      notes,
      ...rest // Any other fields for your session schema
    } = await req.json();

    // Insert the new session
    const { data, error } = await supabase
      .from('mpbc_practice_session')
      .insert([{
        session_id,
        user_id,
        theme,
        date,
        notes,
        ...rest
      }]);
    if (error) return NextResponse.json({ error }, { status: 500 });

    // Optional: update blocks as confirmed, e.g.:
    // await supabase.from('mpbc_practice_session_blocks').update({ confirmed: true }).eq('session_id', session_id);

    return NextResponse.json({ message: 'Session confirmed', session: data[0] }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.toString() }, { status: 500 });
  }
}