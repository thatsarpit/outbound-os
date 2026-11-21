import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function campaignLaunchReview(db, campaign) {
  const recipients = await db.campaignLead.findMany({
    where: { campaignId: campaign.id, status: 'pending' },
    orderBy: { id: 'asc' },
    select: { id: true, variant: true, lead: { select: {
      id: true, mobile: true, waUserId: true, email: true, name: true, product: true,
      company: true, country: true, quantity: true, status: true, emailOptOut: true,
      emailStatus: true, assignedAccount: true, assignedEmailAccountId: true, assignedIMessageAccountId: true,
    } } },
  });
  // Contact suppression and reply status can change while a schedule waits.
  // Those are still checked at dispatch. A changed destination or membership
  // needs a fresh approval because it changes who can receive the campaign.
  const audienceHash = hash(recipients.map(({ lead, ...recipient }) => {
    const { status, emailOptOut, emailStatus, ...identity } = lead;
    return [recipient, identity];
  }));
  return { token: hash([campaign, recipients]), recipientCount: recipients.length, audienceHash };
}

export async function requireCampaignLaunchReview(db, campaign, token) {
  const reviewConflict = message => Object.assign(new Error(message), { statusCode: 409 });
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw reviewConflict('Review the campaign and its current recipients before launching.');
  }
  const review = await campaignLaunchReview(db, campaign);
  if (!review.recipientCount || review.token !== token) {
    throw reviewConflict('The campaign or its audience changed. Review it again before launching.');
  }
  return review;
}
