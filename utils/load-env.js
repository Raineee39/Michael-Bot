import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Always prefer this repo's .env over inherited shell/pm2/OpenClaw variables.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
dotenv.config({ path: envPath, override: true });
