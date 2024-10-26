/* eslint-disable @typescript-eslint/member-ordering */
import {type ExecResult, type SpawnOptions, exec} from './exec.js';
import assert from 'node:assert';
import fs from 'node:fs/promises';
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
   * @returns Package name.
   */
  public get name(): string {
    assert(this.#json, 'Call init before using');
    assert.equal(typeof this.#json.name, 'string');
    return this.#json.name as string;
  }

  public set name(nm: string) {
    assert(this.#json, 'Call init before using');
    if (nm !== this.#json.name) {
      this.#json.name = nm;
      this.#dirty = true;
    }
  }

  public get private(): boolean {
    assert(this.#json, 'Call init before using');
    return Boolean(this.#json.private);
  }

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

  public get workspaces(): string[] {
    assert(this.#json, 'Call init before using');
    if (Array.isArray(this.#json.workspaces)) {
      return this.#json.workspaces;
    }
    return [];
  }

  /**
   * Read file in preparation for further processing.
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

  public exec(opts: SpawnOptions, command: string): Promise<ExecResult> {
    return exec({
      cwd: this.opts.cwd,
      shell: true,
      ...opts,
    }, command);
  }
}

export class MonoRoot extends PackageFile {
  #subPackages = new Map<string, PackageFile>();
  #localNames: string[] = [];

  public constructor(opts: MonoPubOptions) {
    super(opts);
  }

  public *[Symbol.iterator](): MapIterator<PackageFile> {
    if (this.opts.private) {
      yield *this.#subPackages.values();
    } else {
      for (const v of this.#subPackages.values()) {
        if (!v.private) {
          yield v;
        }
      }
    }
  }

  public async init(): Promise<this> {
    await super.init();

    const subDirs = new Set<string>();
    const workspaces = [
      ...(this.opts.packages ?? []),
      ...this.workspaces,
    ];
    for (const w of workspaces) {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      for await (const dir of fs.glob(w, {cwd: this.opts.cwd})) {
        subDirs.add(path.resolve(this.opts.cwd, dir));
      }
    }

    const locals = new Set<string>();
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

  public async save(gitAdd = false): Promise<this> {
    await super.save(gitAdd);
    for (const p of this) {
      await p.save(gitAdd);
    }
    return this;
  }

  public delete(fields: string[]): this {
    if (this.opts.private || !this.private) {
      super.delete(fields);
    }
    for (const p of this) {
      p.delete(fields);
    }
    return this;
  }

  public setVersions(): void {
    const ver = this.version;
    for (const p of this) {
      p.version = ver;
    }
  }

  public async execAll(opts: SpawnOptions, cmd: string): Promise<ExecResult[]> {
    const res: ExecResult[] = [];
    if (this.opts.private || !this.private) {
      const e = await super.exec(opts, cmd);
      res.push(e);
      if (!e.ok) {
        return res;
      }
    }
    for (const p of this) {
      const e = await p.exec(opts, cmd);
      res.push(e);
      if (!e.ok) {
        return res;
      }
    }
    return res;
  }
}
