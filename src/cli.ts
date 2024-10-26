import {Command, Option, type OutputConfiguration} from 'commander';
import {MonoRoot} from './index.js';
import path from 'node:path';
import {version} from './version.js';

function push(p: string, prev: string[] = []): string[] {
  prev.push(p);
  return prev;
}

/**
 * Run the command line interface for a given set of arguments.
 *
 * @param args Arguments to process, in node format.  If not specified, uses
 *   process.argv.
 * @param out Override stdout and stderr for testing.
 */
export async function cli(
  args?: string[],
  out?: OutputConfiguration
): Promise<void> {
  const program = new Command();
  if (out) {
    program.configureOutput(out);
    program.exitOverride();
  }

  program
    .option('-p, --packages <glob>', 'Glob to find names of sub-package directories.  Can be specified multiple times.', push, [])
    .option('-P, --private', 'Include private packages')
    .addOption(
      new Option('--cwd <directory>', 'Operate from given directory')
        .default(process.cwd(), 'cwd')
        .argParser(val => path.resolve(process.cwd(), val))
    )
    .version(version)
    .configureHelp({
      showGlobalOptions: true,
      sortOptions: true,
      sortSubcommands: true,
    });

  program
    .command('version')
    .description('Update version of all sub-repos to match the root.  Should be called from the npm "version" script.')
    .action(async(_opts, p) => {
      const opts = p.optsWithGlobals();
      const m = await new MonoRoot(opts).init();
      m.setVersions();
      await m.save(true);
    });

  program
    .command('delete <fields>')
    .description('Delete this set of comma-separated fields from all package files.')
    .action(async(fields, _opts, p) => {
      const opts = p.optsWithGlobals();
      const m = await new MonoRoot(opts).init();
      m.delete(fields.split(','));
      await m.save(false);
    });

  program
    .command('exec <command>')
    .description('Run the given command in a shell for each package file.')
    .action(async(cmd, _opts, p) => {
      const opts = p.optsWithGlobals();
      const m = await new MonoRoot(opts).init();
      const results = await m.execAll({stdio: 'inherit'}, cmd);
      if (results.some(r => !r.ok)) {
        program.error('Failed execution');
      }
    });

  await program.parseAsync(args);
}
