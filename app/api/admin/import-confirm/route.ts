import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';

type VerificationResult = {
  id: string | number;
  status: 'valid' | 'error';
  message: string;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { events, nodes, connections, nodeMappings } = await request.json();

    // 1. Bulk Insert Events (skip duplicates)
    if (events && events.length > 0) {
      const eventsToInsert = events.map((e: any) => ({
        event_id: e.event_id,
        title: e.title,
        start_date: new Date(e.start_date),
        actors: [],
        tags: e.tags,
      }));
      await prisma.event.createMany({ data: eventsToInsert, skipDuplicates: true });
    }

    // 2. Bulk Insert Nodes (skip duplicates)
    if (nodes && nodes.length > 0) {
      const nodesToInsert = nodes.map((n: any) => ({
        node_id: n.node_id,
        title: n.title,
        date: new Date(n.date),
        actors: n.actors,
        parent_country: n.parent_country,
        tags: n.tags,
        remarks: n.remarks,
      }));
      await prisma.node.createMany({ data: nodesToInsert, skipDuplicates: true });
    }

    // 3. Bulk Insert Mappings (skip duplicates and filter by existing events/nodes)
    if (nodeMappings && nodeMappings.length > 0) {
      const allEventIds = new Set((await prisma.event.findMany({ select: { event_id: true } })).map(e => e.event_id));
      const allNodeIds = new Set((await prisma.node.findMany({ select: { node_id: true } })).map(n => n.node_id));
      
      const validMappings = nodeMappings.filter(
        (m: any) => allEventIds.has(m.event_id) && allNodeIds.has(m.node_id)
      );

      if (validMappings.length > 0) {
        await prisma.eventNodeMapping.createMany({ data: validMappings, skipDuplicates: true });
      }
    }

    // 4. Bulk Insert Connections (skip duplicates and filter by existing nodes)
    if (connections && connections.length > 0) {
      const allNodeIds = new Set((await prisma.node.findMany({ select: { node_id: true } })).map(n => n.node_id));
      
      const validConnections = connections.filter(
        (c: any) => allNodeIds.has(c.node_a) && allNodeIds.has(c.node_b)
      );

      if (validConnections.length > 0) {
        await prisma.nodeConnection.createMany({ data: validConnections, skipDuplicates: true });
      }
    }

    // POST-UPLOAD VERIFICATION
    const verificationReport = {
      events: [] as VerificationResult[],
      nodes: [] as VerificationResult[],
      connections: [] as VerificationResult[],
    };

    if (events && events.length > 0) {
      for (const e of events) {
        const mappingsCount = await prisma.eventNodeMapping.count({
          where: { event_id: e.event_id }
        });
        if (mappingsCount === 0) {
          verificationReport.events.push({
            id: e.event_id,
            status: 'error',
            message: `${e.event_id} was inserted but has no node mappings — it will not appear on the map or node view.`
          });
        } else {
          verificationReport.events.push({
            id: e.event_id,
            status: 'valid',
            message: `${e.event_id} verified (${mappingsCount} mappings found).`
          });
        }
      }
    }

    if (nodes && nodes.length > 0) {
      for (const n of nodes) {
        const mappingsCount = await prisma.eventNodeMapping.count({
          where: { node_id: n.node_id }
        });
        if (mappingsCount === 0) {
          verificationReport.nodes.push({
            id: n.node_id,
            status: 'error',
            message: `Node ${n.node_id} was inserted but is not mapped to any event — it will not appear in any view.`
          });
        } else {
          verificationReport.nodes.push({
            id: n.node_id,
            status: 'valid',
            message: `Node ${n.node_id} verified (${mappingsCount} mappings found).`
          });
        }
      }
    }

    if (connections && connections.length > 0) {
      const allNodeIds = new Set((await prisma.node.findMany({ select: { node_id: true } })).map(n => n.node_id));
      for (const c of connections) {
        if (!allNodeIds.has(c.node_a) || !allNodeIds.has(c.node_b)) {
          verificationReport.connections.push({
            id: c.connection_id,
            status: 'error',
            message: `Connection ${c.connection_id} missing valid nodes (Node A: ${c.node_a}, Node B: ${c.node_b}).`
          });
        } else {
          verificationReport.connections.push({
            id: c.connection_id,
            status: 'valid',
            message: `Connection ${c.connection_id} verified (Nodes A and B exist).`
          });
        }
      }
    }

    revalidatePath('/');
    return NextResponse.json({ success: true, verificationReport });
  } catch (error: any) {
    console.error('Error in import-confirm:', error);
    return NextResponse.json({ error: error.message || 'Database import error' }, { status: 500 });
  }
}
