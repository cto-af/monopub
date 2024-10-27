import {type SpawnOptions, spawn} from 'node:child_process';
export type {SpawnOptions} from 'node:child_process';

export interface ExecResult {

  /** If stdio is not inherited, the text from stdout. */
  stdout: string;

  /** If stdio is not inherited, the text from stderr. */
  stderr: string;

  /** Was the execution successful? */
  ok: boolean;

  /** Exit code, if the execution completed normally. */
  code?: number | null;

  /** Signal name, if the process was interrupted. */
  signal?: string | null;

  /** Error, if the process couldn't be launched (for example). */
  error?: Error | undefined;
}

/**
 * Execute a command returning a promise.
 *
 * @param opts Spawn options.
 * @param cmd Command name, or whole command if shell is true.
 * @param args Other arguments.
 * @returns Results of command, when it is complete.
 */
export function exec(
  opts: SpawnOptions,
  cmd:
  string,
  ...args: string[]
): Promise<ExecResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, opts);
    child.on('error', error => {
      resolve({
        stdout,
        stderr,
        ok: false,
        error,
      });
    });
    child.on('exit', (code, signal) => {
      resolve({
        stdout,
        stderr,
        ok: (code === 0) && (signal == null),
        code,
        signal,
      });
    });

    child.stdout?.on('data', data => (stdout += data));
    child.stderr?.on('data', data => (stderr += data));
  });
}
