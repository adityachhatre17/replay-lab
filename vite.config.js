import { defineConfig } from 'vite';

const proxy = { '/api': process.env.REPLAY_API_URL || 'http://127.0.0.1:8088' };
export default defineConfig({ server: { proxy }, preview: { proxy } });
