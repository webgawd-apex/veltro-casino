export class StateManager {
  constructor(initialState) {
    this.initialState = initialState;
    this.currentState = { ...initialState };
  }

  getState() {
    return { ...this.currentState };
  }

  updateState(newState) {
    this.currentState = { ...this.currentState, ...newState };
    return this.currentState;
  }

  resetState() {
    // Preserve history while resetting everything else
    this.currentState = { 
      ...this.initialState, 
      history: this.currentState.history || [] 
    };
    return this.currentState;
  }
}
