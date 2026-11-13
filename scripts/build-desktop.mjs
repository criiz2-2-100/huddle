#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const productName = 'Rally Up Bots'
const staging = path.join(root, '.desktop-build', 'app')
const release = path.join(root, 'release')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const electronPackage = JSON.parse(
  await readFile(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'),
)
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })

await cp(path.join(root, 'desktop', 'main.cjs'), path.join(staging, 'main.cjs'))
for (const entry of ['server', 'skill-packs', path.join('web', 'dist')]) {
  await cp(path.join(root, entry), path.join(staging, entry), { recursive: true })
}
await cp(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'))
await writeFile(
  path.join(staging, 'package.json'),
  `${JSON.stringify(
    {
      name: 'rally-up-bots-desktop',
      productName,
      version: packageJson.version,
      description: packageJson.description,
      type: 'module',
      main: 'main.cjs',
      private: true,
      license: packageJson.license,
    },
    null,
    2,
  )}\n`,
)

const packager = path.join(root, 'node_modules', '.bin', 'electron-packager')
const icon = path.join(root, 'desktop', 'icon.icns')
const result = spawnSync(
  packager,
  [
    staging,
    productName,
    '--platform=darwin',
    `--arch=${arch}`,
    `--out=${release}`,
    '--overwrite',
    `--electron-version=${electronPackage.version}`,
    `--icon=${icon}`,
    '--app-bundle-id=com.twotwoonehundred.rallyupbots',
    `--app-version=${packageJson.version}`,
    `--build-version=${packageJson.version}`,
  ],
  { cwd: root, stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)

const appPath = path.join(release, `${productName}-darwin-${arch}`, `${productName}.app`)
const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
  stdio: 'inherit',
})
if (sign.error) throw sign.error
if (sign.status !== 0) process.exit(sign.status || 1)

console.log(`Built ${appPath}`)
