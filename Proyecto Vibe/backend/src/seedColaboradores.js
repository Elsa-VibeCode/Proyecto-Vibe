import 'dotenv/config';
import { connectDB } from './config/db.js';
import { sembrarColaboradores } from './services/colaboradorSync.js';

await connectDB();
const resultado = await sembrarColaboradores();
console.log('✓ Seed colaboradores (upsert):', resultado);
process.exit(0);
