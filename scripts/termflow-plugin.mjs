#!/usr/bin/env node
import { createHash } from 'crypto'
import { mkdir, readFile, writeFile, cp } from 'fs/promises'
import { basename, join, resolve } from 'path'
import process from 'process'
import { watch } from 'fs'

const [command, rawPath = '.'] = process.argv.slice(2)
const root = resolve(rawPath)
const manifestPath = join(root, 'termflow-plugin.json')
const fail = (message) => { console.error(`termflow-plugin: ${message}`); process.exitCode = 1 }

function validate(manifest) {
  if (![1, 2].includes(manifest.schemaVersion)) throw new Error('schemaVersion must be 1 or 2')
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(manifest.id || '')) throw new Error('invalid plugin id')
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version || '')) throw new Error('version must be semver')
  if (!manifest.name || !Array.isArray(manifest.commands) || !manifest.commands.length) throw new Error('name and commands are required')
  const ids = new Set()
  for (const item of manifest.commands) { if (!item.id || !item.title || !item.command || ids.has(item.id)) throw new Error(`invalid or duplicate command: ${item.id}`); ids.add(item.id) }
  if (manifest.entry && !/^[\w./-]+\.js$/.test(manifest.entry)) throw new Error('entry must be a relative JavaScript file')
  return manifest
}

async function load() { return validate(JSON.parse(await readFile(manifestPath, 'utf8'))) }

async function init() {
  await mkdir(root, { recursive: true })
  const id = `user.${basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 2, id, name: basename(root), version: '0.1.0', publisher: 'local', entry: 'entry.js', activationEvents: ['onStartupFinished'], permissions: ['terminal:execute'], commands: [{ id: 'hello', title: 'Hello', command: 'echo Hello from TermFlow', shell: 'cmd' }] }, null, 2))
  await writeFile(join(root, 'entry.js'), `module.exports.activate = (api) => api.log('Plugin activated')\nmodule.exports.deactivate = () => {}\n`)
  console.log(`Created ${manifestPath}`)
}

async function pack() {
  const manifest = await load()
  const files = {}
  if (manifest.entry) files[manifest.entry] = Buffer.from(await readFile(join(root, manifest.entry))).toString('base64')
  const payload = { format: 'termflow-plugin-bundle', formatVersion: 1, manifest, files }
  const content = JSON.stringify(payload)
  const bundle = { ...payload, sha256: createHash('sha256').update(content).digest('hex') }
  const target = resolve(`${manifest.id}-${manifest.version}.tfplugin`)
  await writeFile(target, JSON.stringify(bundle, null, 2))
  console.log(target)
}

async function install() {
  const manifest = await load()
  const targetRoot = process.env.TERMFLOW_PLUGIN_DIR || join(process.env.APPDATA || '', 'termflow', 'plugins')
  const target = join(targetRoot, manifest.id)
  await mkdir(target, { recursive: true })
  await cp(root, target, { recursive: true })
  console.log(target)
}

async function dev() {
  const manifest = await load()
  const targetRoot = process.env.TERMFLOW_PLUGIN_DIR || join(process.env.APPDATA || '', 'termflow', 'plugins')
  const target = join(targetRoot, manifest.id)
  const sync = async () => { await mkdir(target, { recursive: true }); await cp(root, target, { recursive: true }); await writeFile(join(targetRoot, `${manifest.id}.json`), JSON.stringify(await load(), null, 2)); console.log(`[${new Date().toLocaleTimeString()}] synced ${manifest.id}`) }
  await sync()
  let timer
  watch(root, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => void sync().catch((error) => fail(error.message)), 100) })
  console.log('Watching for plugin changes. Use Reload plugin host in TermFlow.')
  await new Promise(() => {})
}

try {
  if (command === 'init') await init()
  else if (command === 'validate' || command === 'test') { const manifest = await load(); if (manifest.entry) await readFile(join(root, manifest.entry)); console.log(`${manifest.id}@${manifest.version} valid`) }
  else if (command === 'pack') await pack()
  else if (command === 'install') await install()
  else if (command === 'dev') await dev()
  else fail('usage: npm run plugin -- <init|validate|test|pack|install|dev> [directory]')
} catch (error) { fail(error instanceof Error ? error.message : String(error)) }
