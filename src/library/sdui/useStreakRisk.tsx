import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useCoreServices } from '../../core/CoreServicesContext';
import { EVENTS } from '../../core/EventBus';
import type { StreakRisk } from '../../types';

const NO_RISK: StreakRisk = { atRisk: false, streak: 0, missedDay: null };

/**
 * Whether to show the "Don't lose your streak" prompt, and a way to close it.
 *
 * Asked on mount and whenever the app comes back to the foreground, since that is what "opens the
 * app" means for a process the OS keeps alive — checking only on mount would show it once and then
 * never again for a participant who never fully quits.
 *
 * Shown at most once a day, via `claimStreakPrompt`. A participant who dismisses it has been told;
 * repeating the warning every time they switch back from another app would be nagging rather than
 * encouragement. The day is spent on being shown, not on being acted upon.
 */
export function useStreakRisk() {
  const { schedule, eventBus } = useCoreServices();
  const [risk, setRisk] = useState<StreakRisk>(NO_RISK);
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    const current = schedule.getStreakRisk();
    setRisk(current);
    if (!current.atRisk) {
      setVisible(false);
      return;
    }
    // The schedule owns the once-a-day gate: it already persists day-keyed facts, and a claim that
    // records as it answers can't be checked and then forgotten.
    if (await schedule.claimStreakPrompt()) setVisible(true);
  }, [schedule]);

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

  return { visible, dismiss, streak: risk.streak };
}
