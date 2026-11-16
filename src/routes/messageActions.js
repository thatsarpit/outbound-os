import { Router } from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { requireLeadAccess } from '../auth/rbac.js';
import { REACTION_EMOJI, nativeMessageId, messageAccount, reactionKey } from '../utils/messageActions.js';
import { recordReaction } from '../services/messageReactions.js';
import { requireWhatsAppWindow } from '../services/manualWhatsApp.js';
import whatsappCloudApi from '../services/whatsappCloudApi.js';
import telegram from '../services/telegram.js';
import { whatsappAddress } from '../utils/whatsappAddress.js';

const router = Router();
router.post('/inbox/threads/:leadId/messages/:messageId/reaction', requireRole('agent'), requireLeadAccess('leadId'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.lead.id } });
    if (!lead) return res.status(404).json({ error: 'Conversation unavailable.' });
    const message = await prisma.message.findFirst({ where: { id: Number(req.params.messageId) || -1, leadId: req.lead.id } });
    const emoji = req.body?.emoji;
    if (emoji !== '' && !REACTION_EMOJI.includes(emoji)) return res.status(400).json({ error: 'Choose an available reaction.' });
    if (!message || !['whatsapp', 'telegram'].includes(message.channel) || !nativeMessageId(message)) return res.status(409).json({ error: 'Reactions are unavailable for this message.' });
    const accountId = messageAccount(message);
    if (message.channel === 'whatsapp') {
      if (Date.now() - new Date(message.sentAt || message.createdAt).getTime() > 30 * 86400000) return res.status(409).json({ error: 'This message is too old to react to.' });
      await requireWhatsAppWindow(lead, accountId);
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (!account?.enabled) return res.status(409).json({ error: 'This sending account is unavailable.' });
      const result = await whatsappCloudApi.sendReaction(whatsappAddress(lead), nativeMessageId(message), emoji, accountId);
      if (!result.success) return res.status(502).json({ error: 'The reaction could not be confirmed. Refresh the conversation before trying again.' });
    } else {
      await telegram.react({ accountId, peer: lead.telegramPeer, messageId: nativeMessageId(message), emoji });
    }
    await recordReaction({ ...reactionKey(message, 'business'), emoji });
    res.json({ success: true });
  } catch (error) { res.status(error.statusCode || 400).json({ error: error.statusCode ? error.message : 'Could not update the reaction. Check the channel connection and try again.' }); }
});
export default router;
