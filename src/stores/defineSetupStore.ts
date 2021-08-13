import { defineStore } from "pinia";

/**
 * Setup stores in Pinia 2.0.0-rc.4 make TypeScript 4.3 recurse until it gives up
 * on a large return type. The store still runs as a setup store; the public type
 * is the setup function's return value.
 */
export function defineSetupStore<T extends object>(id: string, setup: () => T) {
  // @ts-ignore TS2589 from Pinia's setup-store extraction on TypeScript 4.3
  return defineStore(id, setup) as unknown as () => T;
}
