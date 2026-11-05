/**
 * TV only: while Lantern is on screen outside the player, it answers the TV's screen saver
 * requests with "not now", so the TV doesn't dim or switch to its own saver after a couple
 * of minutes. Lantern's own screen saver (moving artwork, safe for OLED) takes over instead.
 * If Lantern's saver is turned off, the TV's own saver is left alone.
 */
import { isTV } from '../platform';
import { route } from '../router';
import { saverMinutes } from '../state/settings';

const CLIENT = 'app.lantern.tv';
const URI = 'luna://com.webos.service.tvpower/power/';
export let powerSubscription: unknown = null;

export function initTvPower() {
  const Bridge = (window as any).PalmServiceBridge;
  if (!isTV || !Bridge) return;
  const sub = new Bridge();
  sub.onservicecallback = (msg: string) => {
    let r: { state?: string; timestamp?: string | number };
    try {
      r = JSON.parse(msg);
    } catch {
      return;
    }
    if (r.state !== 'Active' || r.timestamp == null) return;
    const block = saverMinutes.value > 0 && route.value.parts[0] !== 'play';
    const reply = new Bridge();
    reply.call(`${URI}responseScreenSaverRequest`, JSON.stringify({ clientName: CLIENT, ack: !block, timestamp: r.timestamp }));
  };
  sub.call(`${URI}registerScreenSaverRequest`, JSON.stringify({ subscribe: true, clientName: CLIENT }));
  powerSubscription = sub; // the subscription lives as long as the bridge object
}
