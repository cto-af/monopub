# @cto.af/monopub

This project is a relatively-simplified approach to publishing multiple NPM
packages from a monorepo.  It handles these use cases:

- Setting the version number of all sub-packages to the same version as the root
  project.  This is usually performed during the run of
  [npm version](https://docs.npmjs.com/cli/v10/commands/npm-version) by setting
  the version script to `monopub version`.  This will modify each of the
  sub-project package.json files and add them to the pending git commit that
  `npm version` creates.
- Deleting unwanted keys from all package.json files.  Some projects like to
  remove the devDependencies, scripts, and other development-focused information
  from the package.json file before publishing.  This would be run during the
  GitHub Actions script that is publishing the package to npm with
  `monopub delete devDependencies,scripts`.
- Executing a script on all of the sub-pacakges.  This is used during the
  GitHub Actions script that is publishing the package to npm with
  `monopub exec 'npm publish'`.
- By default, private packages are ignored.  Include them with `--private`.
- All actions are run in dependency order, so that a sub-project that depends
  on another sub-project is evaluated after its dependency.

## Installation

```sh
npm install @cto.af/monopub
```

## CLI

```
Usage: monopub [options] [command]

Options:
  --cwd <directory>      Operate from given directory (default: cwd)
  -h, --help             display help for command
  -p, --packages <glob>  Glob to find names of sub-package directories.  Can be
                         specified multiple times. (default: [])
  -P, --private          Include private packages
  -V, --version          output the version number

Commands:
  delete <fields>        Delete this set of comma-separated fields from all
                         package files.
  exec <command>         Run the given command in a shell for each package
                         file.
  help [command]         display help for command
  order                  Output the order in which packages will be processed.
  version                Update version of all sub-repos to match the root.
                         Should be called from the npm "version" script.
```

### delete

```
Usage: monopub delete [options] <fields>

Delete this set of comma-separated fields from all package files.

Options:
  -h, --help             display help for command

Global Options:
  --cwd <directory>      Operate from given directory (default: cwd)
  -p, --packages <glob>  Glob to find names of sub-package directories.  Can be
                         specified multiple times. (default: [])
  -P, --private          Include private packages
  -V, --version          output the version number
```

### exec

```
Usage: monopub exec [options] <command>

Run the given command in a shell for each package file.

Options:
  -h, --help             display help for command

Global Options:
  --cwd <directory>      Operate from given directory (default: cwd)
  -p, --packages <glob>  Glob to find names of sub-package directories.  Can be
                         specified multiple times. (default: [])
  -P, --private          Include private packages
  -V, --version          output the version number
```

### order

```
Usage: monopub order [options]

Output the order in which packages will be processed.

Options:
  -h, --help             display help for command

Global Options:
  --cwd <directory>      Operate from given directory (default: cwd)
  -p, --packages <glob>  Glob to find names of sub-package directories.  Can be
                         specified multiple times. (default: [])
  -P, --private          Include private packages
  -V, --version          output the version number
```

### version

```
Usage: monopub version [options]

Update version of all sub-repos to match the root.  Should be called from the
npm "version" script.

Options:
  -h, --help             display help for command

Global Options:
  --cwd <directory>      Operate from given directory (default: cwd)
  -p, --packages <glob>  Glob to find names of sub-package directories.  Can be
                         specified multiple times. (default: [])
  -P, --private          Include private packages
  -V, --version          output the version number
```

## API

Full [API documentation](http://cto-af.github.io/monopub/) is available.

Example:

```js
import {MonoRoot} from './index.js';
const m = await new MonoRoot(opts).init();
m.delete(['devDependencies', 'scripts']);
m.setVersions();
await m.execAll({stdio: 'inherit'}, 'npm publish');
await m.save(true); // True to do git add for changed files
```

---
[![Tests](https://github.com/cto-af/monopub/actions/workflows/node.js.yml/badge.svg)](https://github.com/cto-af/monopub/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/cto-af/monopub/graph/badge.svg?token=azdFR2fdrQ)](https://codecov.io/gh/cto-af/monopub)
