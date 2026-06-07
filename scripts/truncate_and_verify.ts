import { prisma } from '../lib/db';

async function truncateAndVerify() {
  console.log('Step 1: Running SQL TRUNCATE commands...');
  try {
    // Execute SQL Truncate directly
    await prisma.$executeRawUnsafe('TRUNCATE TABLE node_connections CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE event_node_mapping CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE nodes CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE events CASCADE;');
    
    console.log('SQL TRUNCATE commands completed.');

    console.log('\nStep 2: Verifying table row counts...');
    
    const nodeConnectionsCount = await prisma.nodeConnection.count();
    const eventNodeMappingCount = await prisma.eventNodeMapping.count();
    const nodesCount = await prisma.node.count();
    const eventsCount = await prisma.event.count();

    console.log('\nVerification Results:');
    console.log(`- node_connections row count: ${nodeConnectionsCount}`);
    console.log(`- event_node_mapping row count: ${eventNodeMappingCount}`);
    console.log(`- nodes row count: ${nodesCount}`);
    console.log(`- events row count: ${eventsCount}`);

    if (
      nodeConnectionsCount === 0 &&
      eventNodeMappingCount === 0 &&
      nodesCount === 0 &&
      eventsCount === 0
    ) {
      console.log('\nCONFIRMATION: All 4 tables are completely empty.');
    } else {
      console.warn('\nWARNING: Some tables are not empty!');
    }
  } catch (error) {
    console.error('Error executing truncate/verify:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

truncateAndVerify();
