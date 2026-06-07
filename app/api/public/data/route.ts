import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const [events, nodes, connections, mappings] = await Promise.all([
      prisma.event.findMany({
        orderBy: { start_date: 'asc' },
      }),
      prisma.node.findMany({
        orderBy: { date: 'asc' },
      }),
      prisma.nodeConnection.findMany(),
      prisma.eventNodeMapping.findMany(),
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
      events: formattedEvents,
      nodes: formattedNodes,
      connections,
      mappings
    });
  } catch (error) {
    console.error('Error fetching public data:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
