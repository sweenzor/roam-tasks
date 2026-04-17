import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerTasksRoute } from './routes/tasks.js';
import { registerToggleRoute } from './routes/toggle.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await registerTasksRoute(app);
await registerToggleRoute(app);

app.get('/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
app
  .listen({ port, host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
