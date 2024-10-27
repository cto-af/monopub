/* eslint-disable @typescript-eslint/member-ordering */
import {type ExecResult, type SpawnOptions, exec} from './exec.js';
import FastGlob from 'fast-glob';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import {parse} from 'yaml';
import path from 'node:path';
import {simpleGit} from 'simple-git';

export {ExecResult} from './exec.js';

export interface MonoPubOptions {

  /**  Directory to work from. */
  cwd: string;

  /**
   * Extra globs to consider as package directories.
   */
  packages?: string[];

  /**
   * Include private packages?
   */
  private?: boolean;
}

interface PackageJSON {
  name?: string;
  version?: string;
  private?: boolean;
  dependencies?: {
    [pkg: string]: string;
  };
  devDependencies?: {
    [pkg: string]: string;
  };
  workspaces?: string[];
  [key: string]: unknown;
}

/**
 * Representation of a single package.json file.
 *
 * @example
 * await new PackageFile(opts).init();
 */
export class PackageFile {
  #dirty = false;
  #json: PackageJSON | undefined = undefined;
  #file: string;
  protected opts: MonoPubOptions;

  public constructor(opts: MonoPubOptions) {
    this.opts = opts;
    this.#file = path.join(opts.cwd, 'package.json');
  }

  /**
   * Package name. Asserts if not available.  Must call init() first.
   *
   * @type {string}
   * @readonly
   */
  public get name(): string {
    assert(this.#json, 'Call init before using');
    assert.equal(typeof this.#json.name, 'string');
    return this.#json.name as string;
  }

  /**
   * Is this package private?
   *
   * @type {boolean}
   * @readonly
   */
  public get private(): boolean {
    assert(this.#json, 'Call init before using');
    return Boolean(this.#json.private);
  }

  /**
   * Current version of the package.
   *
   * @type {string}
   */
  public get version(): string {
    assert(this.#json, 'Call init before using');
    assert.equal(typeof this.#json.version, 'string');
    return this.#json.version as string;
  }

  public set version(ver: string) {
    assert(this.#json, 'Call init before using');
    if (ver !== this.#json.version) {
      this.#json.version = ver;
      this.#dirty = true;
    }
  }

  /**
   * Workspaces as defined in the package file, if you are using npm-style
   * workspaces.
   *
   * @type {string[]}
   * @readonly
   */
  public get workspaces(): string[] {
    assert(this.#json, 'Call init before using');
    if (Array.isArray(this.#json.workspaces)) {
      return this.#json.workspaces;
    }
    return [];
  }

  /**
   * Read file in preparation for further processing.  Must be called and
   * awaited, before anything else.
   *
   * @returns This, for chaining.
   */
  public async init(): Promise<this> {
    const txt = await fs.readFile(this.#file, 'utf8');
    this.#json = JSON.parse(txt);
    return this;
  }

  /**
   * Save the file if it is dirty.
   *
   * @param gitAdd If true, also perform a "git add" on this file after saving.
   * @returns This, for chaining.
   */
  public async save(gitAdd = false): Promise<this> {
    assert(this.#json, 'Call init before using');
    if (this.#dirty) {
      await fs.writeFile(
        this.#file,
        `${JSON.stringify(this.#json, null, 2)}\n`,
        'utf8'
      );
      if (gitAdd) {
        await simpleGit({baseDir: this.opts.cwd}).add([this.#file]);
      }
    }
    return this;
  }

  /**
   * Delete 0 or more fields from this file.
   *
   * @param fields List of fields to delete.
   * @returns This, for chaining.
   */
  public delete(fields: string[]): this {
    assert(this.#json, 'Call init before using');
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(this.#json, f)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.#json[f];
        this.#dirty = true;
      }
    }
    return this;
  }

  /**
   * Get the set of local dependencies.  Which of the local pacakges does
   * this package depend upon?
   *
   * @param locals The names of the local packages.
   * @returns The local packages we depend on.
   */
  public depends(locals: Set<string>): Set<string> {
    assert(this.#json, 'Call init before using');
    const ret = new Set<string>();
    if (this.#json.dependencies &&
        typeof this.#json.dependencies === 'object') {
      for (const d of Object.keys(this.#json.dependencies)) {
        if (locals.has(d)) {
          ret.add(d);
        }
      }
    }
    if (this.#json.devDependencies &&
        typeof this.#json.devDependencies === 'object') {
      for (const d of Object.keys(this.#json.devDependencies)) {
        if (locals.has(d)) {
          ret.add(d);
        }
      }
    }
    return ret;
  }

  /**
   * Execute a command in the directory for this pacakge.
   *
   * @param opts Options for spawn.  `{stdion: 'inherit'}` is recommended.
   * @param command Shell command.
   * @returns Results of execution when complete.
   */
  public exec(opts: SpawnOptions, command: string): Promise<ExecResult> {
    return exec({
      cwd: this.opts.cwd,
      shell: true,
      ...opts,
    }, command);
  }
}

/**
 * Representation for the root package of the monorepo.
 */
export class MonoRoot extends PackageFile {
  #subPackages = new Map<string, PackageFile>();
  #localNames: string[] = [];

  public constructor(opts: MonoPubOptions) {
    super(opts);
  }

  /**
   * All of the child packages.  Depending on opts.private, may not
   * include private packages.
   * @yields PackageFile.
   */
  public *[Symbol.iterator](): MapIterator<PackageFile> {
    for (const n of this.#localNames) {
      const s = this.#subPackages.get(n);
      assert(s);
      if (this.opts.private || !s.private) {
        yield s;
      }
    }
  }

  /**
   * Initialize this package, and all of the sub-packages.  Compute the
   * dependency topology.
   *
   * @returns A promise that completes when all reads are done.
   */
  public async init(): Promise<this> {
    await super.init();

    const pnpmPkgs = await this.#pnpmPackages();
    const subDirs = new Set<string>();
    const workspaces = [
      ...this.workspaces,
      ...pnpmPkgs,
      ...(this.opts.packages ?? []),
    ];
    for (const w of workspaces) {
      for (const dir of await FastGlob.glob(w, {
        cwd: this.opts.cwd,
        absolute: true,
        markDirectories: true,
        onlyFiles: false,
      })) {
        subDirs.add(dir);
      }
    }

    this.#subPackages.set(this.name, this);
    const locals = new Set<string>([this.name]);
    for (const cwd of subDirs) {
      const m = await new PackageFile({cwd}).init();
      this.#subPackages.set(m.name, m);
      locals.add(m.name);
    }

    // Sort by dependency topology into #localNames
    const deps = new Map([...this.#subPackages.entries()]
      .map(([k, v]) => [k, v.depends(locals)]));
    while (deps.size > 0) {
      // Pick something with no dependencies, and remove it as a dependency
      // from everything else
      for (const [k, v] of deps) {
        if (v.size === 0) {
          this.#localNames.push(k);
          deps.delete(k);
          for (const s of deps.values()) {
            s.delete(k);
          }
          break;
        }
      }
    }
    return this;
  }

  async #pnpmPackages(): Promise<string[]> {
    try {
      const str = await fs.readFile(
        path.join(this.opts.cwd, 'pnpm-workspace.yaml'),
        'utf8'
      );
      const pwy = parse(str);
      if (Array.isArray(pwy.packages)) {
        return pwy.packages;
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw e;
      }
    }
    return [];
  }

  /**
   * Save this package and any sub-package files, if they are dirty.
   *
   * @param gitAdd If true, add the changed files to the pending git commit.
   * @returns Promise of this, for chaining.
   */
  public async save(gitAdd = false): Promise<this> {
    for (const p of this) {
      if (p === this) {
        super.save(gitAdd);
      } else {
        await p.save(gitAdd);
      }
    }
    return this;
  }

  /**
   * Delete the given fields from all packages.
   *
   * @param fields Field names to delete.
   * @returns Promise of this, for chaining.
   */
  public delete(fields: string[]): this {
    for (const p of this) {
      if (p === this) {
        super.delete(fields);
      } else {
        p.delete(fields);
      }
    }
    return this;
  }

  /**
   * Set the version of all sub-packages to the version of the root package.
   */
  public setVersions(): void {
    const ver = this.version;
    for (const p of this) {
      if (p !== this) {
        p.version = ver;
      }
    }
  }

  /**
   * Execute the given script in the directories of this package and all
   * sub-projects.  If one script fails, execution stops.
   *
   * @param opts Options for exec.
   * @param cmd Shell script to run.
   * @returns Array of execution results.  If one execution fails, the last
   *   result will have "ok: false".
   */
  public async execAll(opts: SpawnOptions, cmd: string): Promise<ExecResult[]> {
    const res: ExecResult[] = [];
    for (const p of this) {
      const e = await p.exec(opts, cmd);
      res.push(e);
      if (!e.ok) {
        return res;
      }
    }
    return res;
  }

  public order(): string[] {
    return [...[...this].map(p => p.name)];
  }
}
