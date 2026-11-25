import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useCoreServices } from '../../core/CoreServicesContext';
import { isAppChromeReady } from './AppShell';
import { EVENTS } from '../../core/EventBus';
import type { StreakDay, StreakRisk } from '../../types';

const NO_RISK: StreakRisk = { atRisk: false, streak: 0, missedDay: null, unfinishedDays: 0 };

/**
 * Whether to show the "Don't lose your streak" prompt, and a way to close it.
 *
 * Asked once the app's loading chrome has gone, and again whenever the app comes back to the
 * foreground — that is what "opens the app" means for a process the OS keeps alive, and checking only
 * on mount would show it once and then never again for a participant who never fully quits.
 *
 * Waiting for the chrome matters: `AppShell` mounts the shell *underneath* its loading screen, so a
 * prompt raised on mount opens behind it and is already sitting there, unannounced, when the screen
 * fades. The claim is spent when the prompt is shown, so this has to gate the check itself rather
 * than merely hide the result — otherwise the day is used up on a prompt nobody saw.
 *
 * Shown at most once a day, via `claimStreakPrompt`. A participant who dismisses it has been told;
 * repeating the warning every time they switch back from another app would be nagging rather than
 * encouragement. The day is spent on being shown, not on being acted upon.
 */
export function useStreakRisk() {
  const { schedule, eventBus } = useCoreServices();
  /**
   * Whether the app's loading screens have gone.
   *
   * Read, not subscribed to through context: `AppShell` announces it on the bus, and a provider
   * wrapping the whole app to deliver one boolean coupled the shell to this feature. `EventBus` has
   * no replay, so the value is read here as well as listened for below — this hook can mount either
   * side of the announcement, and waiting for an edge that has already passed would mean the prompt
   * never shows.
   */
  const [chromeReady, setChromeReady] = useState(isAppChromeReady());
  const [risk, setRisk] = useState<StreakRisk>(NO_RISK);
  /** The days themselves, not just how many — the prompt names them. */
  const [unfinished, setUnfinished] = useState<StreakDay[]>([]);
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    if (!chromeReady) return;
    const current = schedule.getStreakRisk();
    setRisk(current);
    setUnfinished(schedule.getUnfinishedDays());
    if (!current.atRisk) {
      setVisible(false);
      return;
    }
    // The schedule owns the once-a-day gate: it already persists day-keyed facts, and a claim that
    // records as it answers can't be checked and then forgotten.
    if (await schedule.claimStreakPrompt()) setVisible(true);
  }, [schedule, chromeReady]);

  // The chrome going is the other thing that can unblock a check — see `chromeReady`.
  useEffect(() => {
    if (chromeReady) return;
    const onReady = () => setChromeReady(true);
    eventBus.on(EVENTS.APP_CHROME_READY, onReady);
    return () => eventBus.off(EVENTS.APP_CHROME_READY, onReady);
  }, [chromeReady, eventBus]);

  // On mount, and again whenever the schedule settles a day — the risk only appears once yesterday
  // has a verdict, which can land after this first runs.
  useEffect(() => {
    void check();
    const handler = () => void check();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [check, eventBus]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void check();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [check]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss, streak: risk.streak, unfinished };
}
