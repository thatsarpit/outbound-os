/**
 * Reply classification: opt-outs must pause a lead in any language a buyer
 * writes in, without catching ordinary replies that contain the same letters.
 * Run: node --test test/replyClassifier.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReply } from '../src/services/replyClassifier.js';

const stops = (text) => classifyReply(null, text)?.nextAction === 'stop_contact';

describe('Additional language opt-outs', () => {
  const cases = [
    ['Bengali', 'আমাকে আর মেসেজ পাঠাবেন না', 'আমাকে পণ্যের দাম পাঠাবেন'],
    ['Marathi', 'मला संदेश पाठवू नका', 'मला किंमत आणि नमुना पाठवा'],
    ['Tamil', 'எனக்கு செய்தி அனுப்ப வேண்டாம்', 'எனக்கு விலை பட்டியல் அனுப்புங்கள்'],
    ['Telugu', 'నాకు సందేశాలు పంపవద్దు', 'నాకు ధరల జాబితా పంపండి'],
    ['Urdu', 'مجھے پیغامات مت بھیجیں', 'مجھے قیمت بتائیں'],
    ['Vietnamese', 'Đừng gửi tin nhắn cho tôi', 'Gửi cho tôi bảng giá'],
    ['Swahili', 'Usinitumie ujumbe', 'Nitumie bei ya bidhaa'],
    ['Dutch', 'Stuur mij geen berichten meer', 'Stuur mij de prijslijst'],
    ['Polish', 'Nie wysyłaj mi wiadomości', 'Wyślij mi cennik'],
    ['Thai', 'กรุณาหยุดส่งข้อความ', 'กรุณาส่งราคา'],
  ];
  for (const [language, refusal, ordinary] of cases) {
    test(`${language}: explicit opt-out stops contact, buying reply does not`, () => {
      assert.equal(stops(refusal), true);
      assert.equal(stops(ordinary), false);
      assert.equal(stops(refusal.normalize('NFD')), true);
    });
  }
  test('ambiguous single words and soft refusals stay scoped', () => {
    assert.equal(stops('AFMELDEN!'), true);
    assert.equal(stops('Kun je het oude account afmelden en de nieuwe offerte sturen?'), false);
    assert.equal(stops('Wypisz mnie.'), true);
    assert.equal(classifyReply(null, 'Geen interesse')?.confidence, 'medium');
    assert.equal(classifyReply(null, 'Nie jestem zainteresowana')?.confidence, 'medium');
  });
});

describe('Opt-outs', () => {
  test('English', () => {
    for (const text of ['STOP', 'Please stop', 'Unsubscribe me', 'remove me from your list', "Don't contact me again"]) {
      assert.equal(stops(text), true, text);
    }
  });

  test('other languages, anywhere in the message', () => {
    for (const text of [
      'बंद करो', 'कृपया मैसेज मत भेजो', 'bhai band karo ye', 'mat bhejo',
      'Quiero darme de baja', 'no me escriban más', 'por favor, no más mensajes',
      'Quero sair da lista', 'descadastrar', 'Merci de me désinscrire', 'Bitte abmelden',
      'cancellami', 'Tolong jangan hubungi saya', 'Lütfen mesaj atmayın', 'Больше не пишите',
      'إلغاء الاشتراك من فضلك',
    ]) {
      assert.equal(stops(text), true, text);
    }
  });

  test('one-word opt-outs count only as the whole reply', () => {
    for (const text of ['PARAR', 'Sair.', 'baja', 'stopp', 'berhenti', 'iptal', 'Стоп!', 'توقف', 'बंद']) {
      assert.equal(stops(text), true, text);
    }
  });

  test('ordinary replies that contain those letters are not opt-outs', () => {
    for (const text of [
      'We are a stockist in Lagos', 'nonstop delivery please', 'Trabajamos sem parar',
      'basta con 500 unidades', 'Can you cancelar the old quote and send a new one?',
      'Please send the price for bandages', 'dura 2 semanas?',
    ]) {
      assert.equal(stops(text), false, text);
    }
  });

  test('complaints still win, and soft refusals stop too', () => {
    assert.equal(classifyReply(null, 'This is spam')?.intent, 'complaint');
    assert.equal(classifyReply(null, 'nahi chahiye')?.nextAction, 'stop_contact');
    assert.equal(classifyReply(null, 'No me interesa, gracias')?.nextAction, 'stop_contact');
  });

  test('buying signals are not mistaken for opt-outs', () => {
    assert.equal(classifyReply(null, 'Yes, send me the price list')?.intent, 'positive');
    assert.equal(classifyReply(null, 'Out of office until Monday')?.intent, 'out_of_office');
  });
});
