# Jimskay AI — Admin Mode Capability Contract

Admin Mode is a unified computer-use agent. A user instruction may combine
multiple capabilities in a single workflow:

- observe the desktop and screenshots
- control mouse, keyboard, windows and applications
- work with files
- inspect/start/stop processes
- run development commands
- use browser applications
- schedule explicit future jobs
- create/edit documents and code
- inspect results and iterate

## Visual action loop

For UI tasks, the agent should:

1. observe the current state;
2. take a screenshot when visual state matters;
3. choose an action;
4. execute it;
5. observe again;
6. continue until the requested outcome is reached.

The agent must not guess coordinates when a fresh screenshot can resolve the
UI state.

## Consequential actions

Actions such as sending an external message, purchasing something, placing a
trade, deleting important data, or changing security-sensitive settings
should have an explicit confirmation gate immediately before the action.

## Scheduling

Scheduled instructions are stored locally under the user's JimskayAI data
directory. Scheduling itself is explicit and visible; hidden persistence or
security bypasses are not part of the capability contract.
