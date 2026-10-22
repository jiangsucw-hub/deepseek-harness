/** Validate the assembled application, including native Office conversion outside ASAR. */
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { desktopArtifactOutput, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: {
  unsigned: { type: 'boolean', default: false },
  'skip-notarization': { type: 'boolean', default: false },
  // Copy the application out of the build tree first. Node walks every node_modules directory above the
  // application, so running in place lets a workspace dependency masquerade as a packaged one; an
  // installed layout only sees the paths inside the application.
  relocated: { type: 'boolean', default: false },
}, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const linux = target === 'linux-x64'
const artifacts = desktopArtifactOutput(paths, { unsigned: values.unsigned, skipNotarization: values['skip-notarization'] }).directory
const application = windows ? join(artifacts, 'win-unpacked')
  : linux ? join(artifacts, 'linux-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app', 'Contents')
let applicationRoot = application
if (values.relocated) {
  applicationRoot = join(mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-')), 'application')
  cpSync(application, applicationRoot, { recursive: true, dereference: true })
}
const resources = join(applicationRoot, windows || linux ? 'resources' : 'Resources')
const executable = windows ? join(applicationRoot, 'DeepSeek Harness.exe')
  : linux ? join(applicationRoot, 'deepseek-harness') : join(applicationRoot, 'MacOS', 'DeepSeek Harness')
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
