export const createEmitter = <T = void>() => {
  const listeners: ((value: T) => void)[] = [];
  return {
    subscribe: (listener: (value: T) => void): (() => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.lastIndexOf(listener);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },
    // Snapshot: a listener that unsubscribes from inside its own callback would
    // otherwise shift the array mid-iteration and skip the next one.
    trigger: (value: T): void => {
      [...listeners].forEach((listener) => listener(value));
    },
    hasListeners: (): boolean => listeners.length > 0,
  };
};
