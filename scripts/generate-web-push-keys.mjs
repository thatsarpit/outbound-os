import webpush from 'web-push';
// Redirect this output to a private file. Never commit the generated keys.
const keys = webpush.generateVAPIDKeys();
process.stdout.write(`WEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\n`);
