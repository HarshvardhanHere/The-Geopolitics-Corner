import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Must be authenticated (full edit session) to clear database
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Cascade order: dependent tables first to satisfy FK constraints
    await prisma.$transaction([
      prisma.$executeRaw`TRUNCATE TABLE node_connections RESTART IDENTITY CASCADE`,
      prisma.$executeRaw`TRUNCATE TABLE event_node_mapping RESTART IDENTITY CASCADE`,
      prisma.$executeRaw`TRUNCATE TABLE nodes RESTART IDENTITY CASCADE`,
      prisma.$executeRaw`TRUNCATE TABLE events RESTART IDENTITY CASCADE`,
    ]);

    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Clear database error:', err);
    return NextResponse.json({ error: err.message || 'Database error' }, { status: 500 });
  }
}
