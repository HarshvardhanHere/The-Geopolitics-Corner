import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [nodes, events, connections] = await Promise.all([
      prisma.node.findMany({ orderBy: { node_id: 'asc' } }),
      prisma.event.findMany({ orderBy: { event_id: 'asc' } }),
      prisma.nodeConnection.findMany({ orderBy: { connection_id: 'asc' } }),
    ]);

    // Format dates to simple ISO strings
    const formattedNodes = nodes.map(n => ({
      ...n,
      date: n.date.toISOString().split('T')[0]
    }));

    const formattedEvents = events.map(e => ({
      ...e,
      start_date: e.start_date.toISOString().split('T')[0]
    }));

    return NextResponse.json({
      nodes: formattedNodes,
      events: formattedEvents,
      connections
    });
  } catch (error) {
    console.error('Error fetching admin data:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
