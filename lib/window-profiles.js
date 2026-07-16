'use strict';

const WORKSPACE_MODES = Object.freeze(['clipboard', 'notes']);

function normalizeWorkspaceMode(mode) {
  return WORKSPACE_MODES.includes(mode) ? mode : 'clipboard';
}

function workspaceBoundsKey() {
  return 'windowBounds';
}

function defaultWorkspaceBounds(_mode, current = {}) {
  const position = {
    x: Number.isFinite(Number(current.x)) ? Number(current.x) : 100,
    y: Number.isFinite(Number(current.y)) ? Number(current.y) : 100,
  };
  return { ...position, width: 540, height: 640 };
}

module.exports = {
  WORKSPACE_MODES,
  normalizeWorkspaceMode,
  workspaceBoundsKey,
  defaultWorkspaceBounds,
};
