import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';


export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { nodes, events, connections, deletedNodeIds, deletedEventIds, deletedConnectionIds } = await request.json();

    // Run everything in a single transaction
    await prisma.$transaction(async (tx) => {
      // 1. Deletions (Connections first to avoid FK errors)
      if (deletedConnectionIds && deletedConnectionIds.length > 0) {
        await tx.nodeConnection.deleteMany({
          where: { connection_id: { in: deletedConnectionIds } },
        });
      }
      if (deletedNodeIds && deletedNodeIds.length > 0) {
        await tx.node.deleteMany({
          where: { node_id: { in: deletedNodeIds } },
        });
      }
      if (deletedEventIds && deletedEventIds.length > 0) {
        await tx.event.deleteMany({
          where: { event_id: { in: deletedEventIds } },
        });
      }

      // 2. Upsert Events
      if (events && events.length > 0) {
        for (const event of events) {
          await tx.event.upsert({
            where: { event_id: event.event_id },
            update: {
              title: event.title,
              start_date: new Date(event.start_date),
              actors: event.actors || [],
              tags: event.tags || [],
            },
            create: {
              event_id: event.event_id,
              title: event.title,
              start_date: new Date(event.start_date),
              actors: event.actors || [],
              tags: event.tags || [],
            },
          });
        }
      }

      // 3. Upsert Nodes
      if (nodes && nodes.length > 0) {
        for (const node of nodes) {
          const node_id = parseInt(node.node_id, 10);
          if (isNaN(node_id)) continue;

          await tx.node.upsert({
            where: { node_id },
            update: {
              title: node.title,
              date: new Date(node.date),
              actors: node.actors || [],
              parent_country: node.parent_country || null,
              tags: node.tags || [],
              remarks: node.remarks || '',
            },
            create: {
              node_id,
              title: node.title,
              date: new Date(node.date),
              actors: node.actors || [],
              parent_country: node.parent_country || null,
              tags: node.tags || [],
              remarks: node.remarks || '',
            },
          });

          // Update parent events mapping
          if (node.parent_events !== undefined) {
            await tx.eventNodeMapping.deleteMany({
              where: { node_id },
            });

            if (node.parent_events && node.parent_events.length > 0) {
              const uniqueEvents = [...new Set<string>(node.parent_events)];
              const existingEvents = await tx.event.findMany({
                where: { event_id: { in: uniqueEvents } },
                select: { event_id: true },
              });
              const existingEventIds = existingEvents.map(e => e.event_id);

              await tx.eventNodeMapping.createMany({
                data: existingEventIds.map(eId => ({
                  node_id,
                  event_id: eId,
                })),
              });
            }
          }
        }
      }

      // 4. Upsert Connections
      if (connections && connections.length > 0) {
        for (const conn of connections) {
          const node_a = parseInt(conn.node_a, 10);
          const node_b = parseInt(conn.node_b, 10);
          if (isNaN(node_a) || isNaN(node_b)) continue;

          // Check if nodes exist
          const nodesExist = await tx.node.findMany({
            where: { node_id: { in: [node_a, node_b] } },
          });

          if (nodesExist.length !== 2) {
            throw new Error(`Nodes ${node_a} and/or ${node_b} do not exist for connection ${conn.connection_id}`);
          }

          await tx.nodeConnection.upsert({
            where: { connection_id: conn.connection_id },
            update: {
              node_a,
              node_b,
            },
            create: {
              connection_id: conn.connection_id,
              node_a,
              node_b,
            },
          });
        }
      }
    });

    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving admin changes:', error);
    return NextResponse.json({ error: error.message || 'Database transaction error' }, { status: 500 });
  }
}
