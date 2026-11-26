// Load .env before resolving the instance keys used by authentication and
// credential encryption. Startup cannot proceed without durable keys.
import dotenv from 'dotenv';
import { ensureInstanceSecrets } from './utils/instanceSecrets.js';

dotenv.config();
ensureInstanceSecrets();
