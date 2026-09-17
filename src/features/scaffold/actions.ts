'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import type { Project } from '@/features/projects/types';

/**
 * Create the project's folder on disk and drop a runnable skeleton in it.
 *
 * This writes to your actual filesystem, so two rules are enforced rather
 * than trusted:
 *  1. It only writes inside `code_root` from Settings. A blank code_root
 *     disables the whole feature — there is no "current directory" default,
 *     because a path bug in that design overwrites whatever you happened to
 *     be in.
 *  2. It refuses to touch a folder that already has files in it.
 *
 * It also only works where Next.js is running on a real Node process with a
 * writable disk (i.e. `next dev` on your machine). On a serverless host
 * there is no persistent filesystem and this will fail — which is correct:
 * scaffolding is a local-workstation action.
 */

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

export interface ScaffoldResult {
  ok: boolean;
  message: string;
  dir?: string;
}

export type Stack = 'nextjs' | 'node-cli' | 'static' | 'python';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}

/** Resolve and confine: the target must stay inside root. */
function safeJoin(root: string, folder: string): string | null {
  const target = path.resolve(root, folder);
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null;
  return target;
}

function nextFiles(name: string, slug: string, devBrowser: boolean): Record<string, string> {
  // With the dev-browser wired in, `npm run dev` starts next and opens the
  // ephemeral localhost-only Playwright window from nextjs-dev-browser;
  // `dev:plain` keeps a normal next dev around for when you don't want it.
  const scripts = devBrowser
    ? { dev: 'dev-browser dev', 'dev:plain': 'next dev', browser: 'dev-browser open', build: 'next build', start: 'next start', lint: 'next lint' }
    : { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' };

  const devDeps: Record<string, string> = {
    typescript: '^5.6.0',
    '@types/node': '^22.5.0',
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
  };
  if (devBrowser) devDeps['nextjs-dev-browser'] = '^1.1.0';

  return {
    'package.json': JSON.stringify(
      {
        name: slug,
        version: '0.1.0',
        private: true,
        scripts,
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: devDeps,
      },
      null,
      2
    ) + '\n',
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], strict: true, noEmit: true,
          esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
          isolatedModules: true, jsx: 'preserve', incremental: true, skipLibCheck: true,
          plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2
    ) + '\n',
    'next.config.mjs': '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n',
    '.gitignore': 'node_modules\n.next\n.env*.local\n.DS_Store\n',
    'README.md':
      `# ${name}\n\nScaffolded by Meridian.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` +
      (devBrowser
        ? `\n## Dev browser\n\n\`npm run dev\` starts Next and opens an ephemeral, localhost-only browser\n(via [nextjs-dev-browser](https://www.npmjs.com/package/nextjs-dev-browser)) that wipes its\ncache, cookies and storage on close — separate from your everyday profile.\n\n\`\`\`bash\nnpm run dev        # next dev + the dev browser\nnpm run browser    # reopen the browser without restarting the server\nnpm run dev:plain  # plain next dev\n\`\`\`\n\nFirst \`npm install\` downloads a Chromium build for Playwright.\n`
        : ''),
    'src/app/layout.tsx':
      `export const metadata = { title: ${JSON.stringify(name)} };\n\n` +
      `export default function RootLayout({ children }: { children: React.ReactNode }) {\n` +
      `  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    'src/app/page.tsx':
      `export default function Home() {\n  return (\n    <main style={{ padding: 40, fontFamily: 'system-ui' }}>\n` +
      `      <h1>${name}</h1>\n      <p>Scaffolded by Meridian. Start here.</p>\n    </main>\n  );\n}\n`,
  };
}

function otherFiles(stack: Stack, name: string, slug: string): Record<string, string> {
  if (stack === 'node-cli') {
    return {
      'package.json': JSON.stringify({ name: slug, version: '0.1.0', type: 'module', bin: { [slug]: 'index.js' }, scripts: { start: 'node index.js' } }, null, 2) + '\n',
      'index.js': `#!/usr/bin/env node\nconsole.log('${name} — hello');\n`,
      '.gitignore': 'node_modules\n.env\n',
      'README.md': `# ${name}\n\nScaffolded by Meridian.\n`,
    };
  }
  if (stack === 'python') {
    return {
      'pyproject.toml': `[project]\nname = "${slug}"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n`,
      'src/main.py': `def main() -> None:\n    print("${name} — hello")\n\n\nif __name__ == "__main__":\n    main()\n`,
      '.gitignore': '__pycache__/\n.venv/\n*.pyc\n.env\n',
      'README.md': `# ${name}\n\nScaffolded by Meridian.\n`,
    };
  }
  return {
    'index.html': `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${name}</title>\n</head>\n<body>\n<h1>${name}</h1>\n</body>\n</html>\n`,
    'README.md': `# ${name}\n\nScaffolded by Meridian.\n`,
  };
}

export async function scaffoldProject(projectId: string, formData: FormData): Promise<ScaffoldResult> {
  const owner = await requireOwner();
  const settings = await getSettings(owner);
  const root = settings.code_root.trim();

  if (!root) {
    return { ok: false, message: 'Set a code root folder in Settings first — scaffolding only writes inside that folder.' };
  }

  const project = await table<Project>('projects').find(projectId);
  if (!project) return { ok: false, message: 'Project not found.' };

  const folder = String(formData.get('folder') ?? '').trim() || slugify(project.name);
  const stack = (String(formData.get('stack') ?? 'nextjs') as Stack);
  const devBrowser = String(formData.get('dev_browser') ?? '') === 'on';

  const target = safeJoin(root, folder);
  if (!target) return { ok: false, message: 'That folder resolves outside your code root.' };

  try {
    await fs.mkdir(root, { recursive: true });

    // Refuse to scaffold over existing work.
    try {
      const existing = await fs.readdir(target);
      if (existing.length > 0) {
        return { ok: false, message: `${target} already exists and is not empty — nothing was written.` };
      }
    } catch {
      // ENOENT is the happy path here.
    }

    const files =
      stack === 'nextjs'
        ? nextFiles(project.name, slugify(project.name), devBrowser)
        : otherFiles(stack, project.name, slugify(project.name));

    for (const [rel, contents] of Object.entries(files)) {
      const file = path.join(target, rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, contents, 'utf8');
    }

    revalidatePath(`/projects/${projectId}`);
    const next =
      stack === 'python'
        ? 'create a venv and install'
        : devBrowser
          ? 'npm install (this also fetches Chromium for the dev browser), then npm run dev'
          : 'npm install, then npm run dev';

    return {
      ok: true,
      dir: target,
      message: `Created ${Object.keys(files).length} files in ${target}. Next: cd there, ${next}, git init.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not write the folder.' };
  }
}
