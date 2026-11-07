import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { Store } from './store.ts';

const store = new Store(resolve(process.env.BETTER_DATA_DIR || 'data'));
const app = createApp(store);
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Better harness listening on http://127.0.0.1:${typeof address === 'object' ? address?.port : port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
