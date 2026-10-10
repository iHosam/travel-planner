// A minimal store with undo/redo. State is { data, prefs }; only `data` is tracked in history,
// so undoing never flips the theme or the current view.

export function createStore(reducer, initialState, { limit = 100 } = {}) {
  let state = initialState;
  let past = [];
  let future = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener(state));

  const travel = (from, to) => {
    if (!from.length) return;
    to.push(state.data);
    state = { ...state, data: from.pop() };
    emit();
  };

  return {
    getState: () => state,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      if (action.type === 'undo') return travel(past, future);
      if (action.type === 'redo') return travel(future, past);
      const next = reducer(state, action);
      if (next === state) return;
      if (next.data !== state.data && action.history !== false) {
        past.push(state.data);
        if (past.length > limit) past.shift();
        future = [];
      }
      state = next;
      emit();
    },
  };
}
