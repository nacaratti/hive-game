import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Provisional: the store identity (name + appId) is decided before the first Play upload and cannot change afterwards.
  appId: 'dev.hivepro.app',
  appName: 'Hive Pro',
  webDir: '../client/dist',
  server: {
    // Hosts are reached over plain http/ws on the local network (http://192.168.x.x:4242).
    // An http://localhost page avoids mixed-content blocking and is still a secure context.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    backgroundColor: '#2a211b',
  },
};

export default config;
