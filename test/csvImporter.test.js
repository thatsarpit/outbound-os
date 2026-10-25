import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSVImporter } from '../src/services/csvImporter.js';

const importer = new CSVImporter();
test('CSV parsing preserves quoted newlines, escaped quotes, commas, CRLF and a UTF-8 BOM', () => {
  const text = '\uFEFFName,Mobile,Remarks\r\n"Ada, Buyer",15557770001,"first line\r\nsecond line"\r\n\r\nGrace,15557770002,"said ""hello"""\r\n';
  const { headers, rows } = importer.parseCSV(text);
  assert.deepEqual(headers, ['name', 'mobile', 'remarks']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Ada, Buyer');
  assert.equal(rows[0].remarks, 'first line\r\nsecond line');
  assert.equal(rows[1].remarks, 'said "hello"');
  assert.equal(Object.getPrototypeOf(rows[0]), null);
});

test('blank records do not become unintended leads and blank fields retain column alignment', () => {
  const { rows } = importer.parseCSV('name,mobile,email\n,,\nAda,15557770001,\nGrace,,grace@example.test\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].email, '');
  assert.equal(rows[1].mobile, '');
  assert.equal(rows[1].email, 'grace@example.test');
});

test('malformed CSV is rejected before an import batch or any lead is written', async () => {
  const noWrites = new CSVImporter({ db: new Proxy({}, { get() { throw new Error('Database must not be touched'); } }) });
  for (const [text, pattern] of [
    ['name,mobile\nAda,15557770001\n"Unclosed,15557770002', /Invalid CSV at line 3/],
    ['name,mobile\nAda,15557770001,extra', /Invalid CSV at line 2/],
    ['name, Name\nAda,Grace', /headers must be unique/],
    ['name,\nAda,15557770001', /headers must not be empty/],
  ]) {
    const result = await noWrites.importCSV(text, 'fixture.csv');
    assert.equal(result.success, false);
    assert.match(result.error, pattern);
    assert.deepEqual(result.errors, [result.error]);
  }
});

test('prototype-shaped CSV headers remain data properties', () => {
  const { rows } = importer.parseCSV('__proto__,constructor,name\nvalue,plain,Ada');
  assert.equal(Object.getPrototypeOf(rows[0]), null);
  assert.equal(rows[0].__proto__, 'value');
  assert.equal(rows[0].constructor, 'plain');
  assert.throws(() => importer.parseCSV(null), /must be text/);
});
