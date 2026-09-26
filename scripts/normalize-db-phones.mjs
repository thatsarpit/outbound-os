import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting normalization of existing mobile numbers...');

  const leads = await prisma.lead.findMany({
    select: { id: true, mobile: true },
  });

  console.log(`Found ${leads.length} leads to check.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const lead of leads) {
    if (!lead.mobile) {
      skippedCount++;
      continue;
    }

    // Strip everything except digits
    let cleanMobile = String(lead.mobile).replace(/[^0-9]/g, '');

    // Common sanitization logic matching our ingestion rules
    if (cleanMobile.startsWith('00') && cleanMobile.length > 4) {
      cleanMobile = cleanMobile.slice(2); // Remove exactly "00", not all leading zeros
    } else if (cleanMobile.startsWith('0') && cleanMobile.length === 11) {
      cleanMobile = cleanMobile.slice(1); // Remove exactly one leading zero
    }

    if (cleanMobile.length === 10) {
      cleanMobile = '91' + cleanMobile; // Assume India if 10 digits
    }

    if (cleanMobile !== lead.mobile) {
      try {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { mobile: cleanMobile },
        });
        updatedCount++;
        console.log(`✅ Normalized Lead ${lead.id}: "${lead.mobile}" -> "${cleanMobile}"`);
      } catch (error) {
        if (error.code === 'P2002') {
          console.error(`❌ Duplicate collision for Lead ${lead.id} normalized as "${cleanMobile}". Moving to manual review.`);
          // Appending a distinct marker so it doesn't break constraints, allowing admin to merge
          try {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { mobile: `${cleanMobile}_DUP_${lead.id}` },
            });
          } catch (fallbackError) {
            console.error(`❌ Failed to mark duplicate for Lead ${lead.id}: ${fallbackError.message}`);
          }
        } else {
          console.error(`❌ Failed to update Lead ${lead.id}: ${error.message}`);
        }
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n✅ Normalization complete.');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already clean): ${skippedCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
