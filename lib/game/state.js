// Initial game state configuration
export const GAME_STATUS = {
  IDLE: 'IDLE',
  BETTING: 'BETTING',
  RUNNING: 'RUNNING',
  CRASHED: 'CRASHED',
  RESET: 'RESET',
};

export const initialState = {
  status: GAME_STATUS.IDLE,
  multiplier: 1.0,
  startTime: null,
  crashPoint: null,
  currentRoundId: null,
  history: [],
};

let currentState = { ...initialState };

export const getState = () => ({ ...currentState });

export const updateState = (newState) => {
  currentState = { ...currentState, ...newState };
  return currentState;
};

export const resetState = () => {
  currentState = { 
    ...initialState, 
    history: currentState.history 
  };
  return currentState;
};
