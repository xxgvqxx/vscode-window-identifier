const vscode = require('vscode');
const cp = require('child_process');

const STATE_KEY = 'vscodeBorder.branchColors';
const DEFAULT_COLORS = [
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#3949AB',
  '#1E88E5',
  '#039BE5',
  '#00897B',
  '#43A047',
  '#FDD835',
  '#FB8C00',
  '#F4511E'
];

class BorderViewProvider {
  constructor(stateProvider) {
    this.stateProvider = stateProvider;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const state = this.stateProvider();
    const items = [];

    items.push(
      new vscode.TreeItem(
        `Branch: ${state.branch || 'unknown'}`,
        vscode.TreeItemCollapsibleState.None
      )
    );
    items.push(
      new vscode.TreeItem(
        `Color: ${state.color || 'unset'}`,
        vscode.TreeItemCollapsibleState.None
      )
    );

    const action = new vscode.TreeItem(
      'Randomize Color',
      vscode.TreeItemCollapsibleState.None
    );
    action.command = {
      command: 'vscodeBorder.randomizeColor',
      title: 'Randomize Color'
    };
    action.iconPath = new vscode.ThemeIcon('refresh');
    items.push(action);

    return items;
  }
}

function activate(context) {
  const state = {
    branch: null,
    color: null
  };

  const viewProvider = new BorderViewProvider(() => state);
  const treeView = vscode.window.createTreeView('vscode-border-view', {
    treeDataProvider: viewProvider,
    showCollapseAll: false
  });

  context.subscriptions.push(treeView);
  context.subscriptions.push(
    treeView.onDidChangeVisibility((event) => {
      if (event.visible) {
        randomizeColor(context, state, viewProvider, true);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeBorder.randomizeColor', () =>
      randomizeColor(context, state, viewProvider, true)
    )
  );

  refreshForCurrentBranch(context, state, viewProvider);

  const interval = setInterval(() => {
    refreshForCurrentBranch(context, state, viewProvider);
  }, 5000);

  context.subscriptions.push(new vscode.Disposable(() => clearInterval(interval)));
}

async function refreshForCurrentBranch(context, state, viewProvider) {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    state.branch = null;
    state.color = null;
    viewProvider.refresh();
    return;
  }

  const branch = await getBranch(workspaceFolder);
  if (!branch) {
    state.branch = null;
    state.color = null;
    viewProvider.refresh();
    return;
  }

  if (branch === state.branch && state.color) {
    return;
  }

  state.branch = branch;
  state.color = await getColorForBranch(context, branch, false);
  await applyColor(state.color);
  viewProvider.refresh();
}

async function randomizeColor(context, state, viewProvider, forceNew) {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showInformationMessage(
      'VS Code Border: open a workspace to set a branch color.'
    );
    return;
  }

  const branch = await getBranch(workspaceFolder);
  if (!branch) {
    vscode.window.showInformationMessage(
      'VS Code Border: could not determine git branch.'
    );
    return;
  }

  state.branch = branch;
  state.color = await getColorForBranch(
    context,
    branch,
    forceNew,
    state.color
  );
  await applyColor(state.color);
  viewProvider.refresh();
}

function getWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    return null;
  }
  return folders[0].uri.fsPath;
}

async function getColorForBranch(context, branch, forceNew, currentColor) {
  const stored = context.globalState.get(STATE_KEY);
  const map =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  let color = map[branch];

  if (!color || forceNew) {
    const colors = getPrimaryColors();
    let pool = colors;
    if (forceNew && currentColor && colors.length > 1) {
      const filtered = colors.filter((value) => value !== currentColor);
      if (filtered.length) {
        pool = filtered;
      }
    }

    color = pool[Math.floor(Math.random() * pool.length)] || DEFAULT_COLORS[0];
    map[branch] = color;
    await context.globalState.update(STATE_KEY, map);
  }

  return color;
}

function getPrimaryColors() {
  const configured = vscode.workspace
    .getConfiguration('vscodeBorder')
    .get('primaryColors');

  if (Array.isArray(configured)) {
    const cleaned = configured.filter(
      (value) => typeof value === 'string' && value.trim().length
    );
    if (cleaned.length) {
      return cleaned;
    }
  }

  return DEFAULT_COLORS;
}

async function applyColor(color) {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const existing = workbench.get('colorCustomizations');
  const base = isPlainObject(existing) ? existing : {};
  const theme = workbench.get('colorTheme');
  const themeKey =
    typeof theme === 'string' && theme.trim().length ? `[${theme}]` : null;

  const hoverBackground = withAlpha(color, 0.12);
  const hoverBorder = withAlpha(color, 0.7);
  const inactiveBorder = color;

  const overrides = {
    'window.activeBorder': color,
    'window.inactiveBorder': inactiveBorder,
    'activityBar.border': color,
    'sideBar.border': color,
    'panel.border': color,
    'editorGroup.border': color,
    'tab.activeBorderTop': color,
    'tab.hoverBackground': hoverBackground,
    'tab.hoverBorder': hoverBorder,
    'tab.unfocusedHoverBackground': hoverBackground,
    'tab.unfocusedHoverBorder': hoverBorder
  };

  const merged = { ...base, ...overrides };
  if (themeKey) {
    const themeExisting = base[themeKey];
    merged[themeKey] = {
      ...(isPlainObject(themeExisting) ? themeExisting : {}),
      ...overrides
    };
  }

  await workbench.update(
    'colorCustomizations',
    merged,
    vscode.ConfigurationTarget.Workspace
  );
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function hexToRgb(input) {
  if (typeof input !== 'string') {
    return null;
  }

  let hex = input.trim();
  if (!hex.startsWith('#')) {
    return null;
  }

  hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  if (hex.length !== 6) {
    return null;
  }

  const num = parseInt(hex, 16);
  if (Number.isNaN(num)) {
    return null;
  }

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function getBranch(workspaceFolder) {
  const branch = await execGit(['branch', '--show-current'], workspaceFolder);
  if (branch) {
    return branch;
  }

  const fallback = await execGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    workspaceFolder
  );
  if (fallback && fallback !== 'HEAD') {
    return fallback;
  }

  return execGit(['rev-parse', '--short', 'HEAD'], workspaceFolder);
}

function execGit(args, cwd) {
  return new Promise((resolve) => {
    cp.execFile('git', args, { cwd }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
