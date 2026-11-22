// Rebase pending changes over the last confirmed value. A failed request removes
// only its own projection, including when several water check-ins overlap.
export function createBackgroundSaves(onChange = () => {}) {
  const lanes = new Map();
  let count = 0;
  return {
    get pending() { return count; },
    async idle() {
      while (lanes.size) await Promise.all([...lanes.values()].map(lane => lane.done));
    },
    save({ key, read, write, project, persist, confirm = (_value, result) => result, success, failure }) {
      let lane = lanes.get(key);
      if (!lane) {
        lane = { base: structuredClone(read()), operations: [], done: Promise.resolve() };
        lanes.set(key, lane);
      }
      const operation = { project };
      const publish = () => write(lane.operations.reduce((value, item) => item.project(value), lane.base));
      lane.operations.push(operation);
      count++;
      publish();
      onChange({ settled: false });
      lane.done = lane.done.then(async () => {
        let error;
        try { lane.base = confirm(lane.base, await persist()); }
        catch (cause) { error = cause; }
        lane.operations.splice(lane.operations.indexOf(operation), 1);
        count--;
        if (!lane.operations.length) lanes.delete(key);
        publish();
        if (error) failure?.(error); else success?.();
        onChange({ settled: true });
      });
      return lane.done;
    },
  };
}
