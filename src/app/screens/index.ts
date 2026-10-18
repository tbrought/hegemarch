/**
 * The menu pages: the title screen, the setup of a run, the Hall of Heirs, Settings, How to Play, the
 * throne of a crowned Daily, and the results. They are HTML over the game's canvas. Each page is a module with a function that draws
 * it (`showSetup(app)`) and a table of what its buttons do: a button says `data-sa="name:argument"`,
 * and `App.onScreenAction` looks the name up here.
 */
import type { App } from '../App';
import { hallActions } from './hall';
import { menuActions } from './menu';
import { resultsActions } from './results';
import { settingsActions } from './settings';
import { setupActions } from './setup';
import { throneActions } from './throne';

/** What a button does: `arg` is what stands after the colon in its `data-sa`, `el` the button itself. */
export type ScreenAction = (app: App, arg: string, el: HTMLElement) => void;
export type ScreenActions = Record<string, ScreenAction>;

export const SCREEN_ACTIONS: ScreenActions = { ...menuActions, ...setupActions, ...hallActions, ...settingsActions, ...resultsActions, ...throneActions };
