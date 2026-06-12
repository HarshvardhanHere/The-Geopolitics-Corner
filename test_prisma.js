import { prisma } from './app/lib/db'; // Wait, let's just use Prisma client

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const events = [
    { event_id: 'EVENT 07', title: 'New Event', start_date: '2026-06-11', tags: [] }
  ];
  
  const eventsToInsert = events.map((e) => ({
    event_id: e.event_id,
    title: e.title,
    start_date: new Date(e.start_date),
    actors: [],
    tags: e.tags,
  }));
  
  try {
    const res = await prisma.event.createMany({ data: eventsToInsert, skipDuplicates: true });
    console.log("Insert result:", res);
    
    const count = await prisma.event.count();
    console.log("Total events:", count);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
