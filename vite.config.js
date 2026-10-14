import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/firebase')||id.includes('node_modules/@firebase')||id.includes('node_modules/@grpc'))return 'firebase';if(id.includes('node_modules/react'))return 'react';}}}}});
