Here is the output in raw markdown format:

### Purpose

This file provides a context for the application state, allowing components to access and update the app's state.

### Main Classes/Functions

*   **`AppContext`**: A React context that stores the app's state and dispatch function.
*   **`AppProvider`**: A React component that wraps the app with the `AppContext`.
*   **`useAppState`**: A hook that allows components to access the app's state using the `AppContext`.

### Important Logic

* The `AppProvider` component uses `useReducer` to manage the app's state and dispatch function.
* It also uses `useEffect` to:
	+ Load hardware information from Cordex.
	+ Restore the last session from Cordex.
	+ Probe Ollama status every 15 seconds.
	+ Listen for Ollama status changes from the main process.
* The `probeLlama` function is used to update the app's state with Ollama status information.

### Dependencies

*   `react`
*   `./reducer`: A file that exports the app's reducer function and initial state.
*   `../types`: A file that exports type definitions for the app's state and actions.
*   `Cordex`: An external library or module that provides access to Cordex functionality.

### Interaction with the Rest of the System

* The `AppProvider` component is likely used as a wrapper around the entire application, providing access to the app's state and dispatch function to all components.
* Components can use the `useAppState` hook to access the app's state and update it using the dispatch function.
* The `probeLlama` function is likely called by other parts of the system (e.g. main process) to update the app's state with Ollama status information.

### Example Use Case

To update the active tab, an action with type `SET_ACTIVE_TAB` would be dispatched to the reducer with the ID of the new active tab. The reducer would then update the state accordingly, returning a new state object with the updated active tab ID.