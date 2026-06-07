import { prisma } from '../lib/db';

async function testConnection() {
  console.log('Testing connection to PostgreSQL database...');
  try {
    // Attempt queries on each of our 4 tables
    const eventCount = await prisma.event.count();
    const nodeCount = await prisma.node.count();
    const mappingCount = await prisma.eventNodeMapping.count();
    const connectionCount = await prisma.nodeConnection.count();

    console.log('Database connectivity: SUCCESS');
    console.log(`- Events count: ${eventCount}`);
    console.log(`- Nodes count: ${nodeCount}`);
    console.log(`- Mappings count: ${mappingCount}`);
    console.log(`- Connections count: ${connectionCount}`);
  } catch (error) {
    console.error('Database connectivity: FAILED');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
