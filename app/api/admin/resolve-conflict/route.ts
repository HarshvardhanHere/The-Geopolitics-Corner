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
    const { type, id, action, excelRecord } = await request.json();

    if (action === 'keep') {
      // Nothing to write to DB, existing record is correct.
      return NextResponse.json({ success: true });
    }

    if (action === 'accept') {
      // Overwrite DB record with the Excel record
      await prisma.$transaction(async (tx) => {
        if (type === 'node') {
          const node_id = parseInt(id, 10);
          await tx.node.upsert({
            where: { node_id },
            update: {
              title: excelRecord.title,
              date: new Date(excelRecord.date),
              actors: excelRecord.actors || [],
              parent_country: excelRecord.parent_country || null,
              tags: excelRecord.tags || [],
              remarks: excelRecord.remarks || '',
            },
            create: {
              node_id,
              title: excelRecord.title,
              date: new Date(excelRecord.date),
              actors: excelRecord.actors || [],
              parent_country: excelRecord.parent_country || null,
              tags: excelRecord.tags || [],
              remarks: excelRecord.remarks || '',
            }
          });

          // Update parent events
          if (excelRecord.parent_events !== undefined) {
            await tx.eventNodeMapping.deleteMany({ where: { node_id } });
            
            const uniqueEvents = [...new Set<string>(excelRecord.parent_events)];
            const existingEvents = await tx.event.findMany({
              where: { event_id: { in: uniqueEvents } },
              select: { event_id: true }
            });
            const existingEventIds = existingEvents.map(e => e.event_id);

            await tx.eventNodeMapping.createMany({
              data: existingEventIds.map(eId => ({
                node_id,
                event_id: eId
              }))
            });
          }

        } else if (type === 'event') {
          await tx.event.upsert({
            where: { event_id: id },
            update: {
              title: excelRecord.title,
              start_date: new Date(excelRecord.start_date),
              actors: [],
              tags: excelRecord.tags || [],
            },
            create: {
              event_id: id,
              title: excelRecord.title,
              start_date: new Date(excelRecord.start_date),
              actors: [],
              tags: excelRecord.tags || [],
            }
          });
        } else if (type === 'connection') {
          const node_a = parseInt(excelRecord.node_a, 10);
          const node_b = parseInt(excelRecord.node_b, 10);

          const nodesExist = await tx.node.findMany({
            where: { node_id: { in: [node_a, node_b] } }
          });
          if (nodesExist.length !== 2) {
            throw new Error(`Nodes ${node_a} and/or ${node_b} do not exist for connection ${id}`);
          }

          await tx.nodeConnection.upsert({
            where: { connection_id: id },
            update: { node_a, node_b },
            create: { connection_id: id, node_a, node_b }
          });
        }
      }, { timeout: 30000 });

      revalidatePath('/');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in resolve-conflict:', error);
    return NextResponse.json({ error: error.message || 'Error resolving conflict' }, { status: 500 });
  }
}
