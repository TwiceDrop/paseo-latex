import { polyfillNavigator } from "./navigator";

// A call in _layout runs after its imports. xterm reads these during import.
polyfillNavigator();
