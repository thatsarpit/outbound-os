import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

export async function readLocalPassword(prompt) {
  const terminal = Boolean(process.stdin.isTTY);
  // Readline manages raw terminal input. Its own echo goes to a private sink.
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const lines = createInterface({ input: process.stdin, output, terminal, crlfDelay: Infinity });
  if (terminal) process.stderr.write(prompt);
  try {
    for await (const line of lines) return line;
    throw new Error('No password was entered.');
  } finally {
    lines.close();
    if (terminal) process.stderr.write('\n');
  }
}
