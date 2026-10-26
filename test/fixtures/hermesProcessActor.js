import { openDatabase, storeOptions, scope, completeContext, signedBatch } from '../helpers/hermesHarness.js';
import { HermesShadowInbox } from '../../src/services/hermesShadowInbox.js';
import { HermesEventStore } from '../../src/services/hermesEventBridge.js';

const [mode, senderFile, receiverFile, journal] = process.argv.slice(2);
const receiverMode = ['run', 'paused-draft', 'receive-run'].includes(mode);
const db = openDatabase(receiverMode ? receiverFile : senderFile, journal);
const inbox = receiverMode ? new HermesShadowInbox(db, scope) : null;
let release, time;
const send = (type, value) => process.send({ type, value, pid: process.pid });
process.on('message', async command => {
  try {
    if (command.action === 'release' && release) {
      time = command.now; release('Synthetic draft'); release = null; return;
    }
    if (command.action !== 'go') throw new Error('Unknown harness command');
    time = command.now;
    if (receiverMode) {
      if (mode === 'receive-run') send('received', inbox.receive(signedBatch(command.batch, time)));
      send('result', await inbox.runNext({ clock: () => time, readContext: completeContext,
        draftReply: ({ scope: current }) => {
          if (mode === 'paused-draft') return new Promise(resolve => {
            release = resolve; send('draft-started', current);
          });
          send('draft-started', current); return 'Synthetic draft';
        },
      }));
    } else if (mode === 'uncommitted-ingress') {
      db.exec('BEGIN IMMEDIATE');
      db.prepare(`INSERT INTO Message(leadId,content,channel,direction,status,waAccount)
        VALUES (1,'Synthetic uncommitted content','whatsapp','inbound','delivered',1)`).run();
      send('transaction-open', {
        messages: db.prepare('SELECT count(*) n FROM Message').get().n,
        events: db.prepare('SELECT count(*) n FROM HermesInboundEvent').get().n,
      });
    } else if (mode === 'claim') {
      send('result', new HermesEventStore(db, storeOptions).claim(command.now));
    } else throw new Error('Unknown actor mode');
  } catch (error) { process.send({ type: 'fatal', error: error.stack }); }
});
send('ready');
