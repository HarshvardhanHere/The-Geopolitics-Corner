import { prisma } from '../lib/db';

async function wipeDatabase() {
  console.log('Initiating database wipe...');
  try {
    // Delete in dependent order (connections first, then event node mapping, then nodes, then events)
    await prisma.$transaction([
      prisma.nodeConnection.deleteMany(),
      prisma.eventNodeMapping.deleteMany(),
      prisma.node.deleteMany(),
      prisma.event.deleteMany(),
    ]);
    console.log('Database wiped completely and successfully.');
  } catch (error) {
    console.error('Error wiping database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

wipeDatabase();
