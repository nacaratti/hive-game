// Development entry for the bot worker: lets the worker thread load TypeScript sources.
import { register } from 'tsx/esm/api';

register();
await import('./bot-worker.ts');
