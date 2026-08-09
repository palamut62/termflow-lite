import { existsSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import { ipcMain } from 'electron'
import { IPC, type ProjectInfo, type ProjectTask } from '../../shared/ipc'
import { readProjectTasks } from './tasks'

function task(id: string, label: string, command: string, source: ProjectTask['source']): ProjectTask {
  return { id, label, command, source }
}

export function detectProject(cwd: string): ProjectInfo | null {
  try {
    if (!isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) return null
    const has = (name: string): boolean => existsSync(join(cwd, name))
    const technologies: string[] = []
    const tasks: ProjectTask[] = []

    if (has('package.json')) {
      technologies.push('Node.js')
      tasks.push(...readProjectTasks(cwd))
    }
    if (has('pyproject.toml') || has('requirements.txt')) {
      technologies.push('Python')
      tasks.push(
        task('python:test', 'Python: Run tests', 'python -m pytest', 'python'),
        task('python:install', 'Python: Install project', 'python -m pip install -e .', 'python')
      )
    }
    if (has('Cargo.toml')) {
      technologies.push('Rust')
      tasks.push(
        task('cargo:run', 'Cargo: Run', 'cargo run', 'cargo'),
        task('cargo:test', 'Cargo: Test', 'cargo test', 'cargo'),
        task('cargo:check', 'Cargo: Check', 'cargo check', 'cargo')
      )
    }
    if (has('go.mod')) {
      technologies.push('Go')
      tasks.push(task('go:run', 'Go: Run', 'go run .', 'go'), task('go:test', 'Go: Test', 'go test ./...', 'go'))
    }
    if (has('compose.yml') || has('compose.yaml') || has('docker-compose.yml') || has('docker-compose.yaml')) {
      technologies.push('Docker')
      tasks.push(
        task('docker:up', 'Docker: Compose up', 'docker compose up', 'docker'),
        task('docker:down', 'Docker: Compose down', 'docker compose down', 'docker'),
        task('docker:logs', 'Docker: Compose logs', 'docker compose logs -f', 'docker')
      )
    }
    if (has('.git')) {
      technologies.push('Git')
      tasks.push(task('git:status', 'Git: Status', 'git status', 'git'), task('git:log', 'Git: Recent commits', 'git log --oneline -10', 'git'))
    }
    return technologies.length > 0 ? { root: cwd, technologies, tasks } : null
  } catch {
    return null
  }
}

export function registerProjectIpc(): void {
  ipcMain.handle(IPC.PROJECT_DETECT, (_event, cwd: string): ProjectInfo | null =>
    typeof cwd === 'string' ? detectProject(cwd) : null)
}
