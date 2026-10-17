import { isMobileApp } from './platform';

/** Short vibration when a piece lands (mobile app only). */
export async function tapFeedback(strong = false): Promise<void> {
  if (!isMobileApp) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: strong ? ImpactStyle.Heavy : ImpactStyle.Light });
  } catch {
    /* no vibration motor */
  }
}

interface LifecycleHandlers {
  onResume: () => void;
  /** Return true when the back press was handled by the app. */
  onBack: () => boolean;
}

/** Wires Android/iOS app lifecycle events. Returns a cleanup function. */
export function registerAppLifecycle(handlers: LifecycleHandlers): () => void {
  if (!isMobileApp) return () => undefined;
  let removed = false;
  const subs: { remove: () => Promise<void> }[] = [];
  import('@capacitor/app').then(({ App }) => {
    if (removed) return;
    App.addListener('resume', handlers.onResume).then((s) => subs.push(s));
    App.addListener('backButton', () => {
      if (!handlers.onBack()) App.minimizeApp();
    }).then((s) => subs.push(s));
  });
  return () => {
    removed = true;
    subs.forEach((s) => s.remove());
  };
}
