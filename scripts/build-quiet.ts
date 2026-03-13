import { spawn } from 'node:child_process'

async function runBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsdown', [], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    })

    let errorOutput = ''

    child.stdout?.on('data', (data: Buffer) => {
      // 完全忽略 stdout，tsdown 的日志太详细了
      void data
    })

    child.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString()
    })

    child.on('close', (code) => {
      // 以进程退出码为准，stderr 可能有警告信息
      if (code === 0) {
        console.log('✓ Build successful')
        resolve()
      } else {
        console.error('✗ Build failed')
        if (errorOutput) {
          console.error(errorOutput)
        }
        reject(new Error(`Build exited with code ${code}`))
      }
    })

    child.on('error', (err) => {
      console.error('✗ Build failed:', err.message)
      reject(err)
    })
  })
}

runBuild().catch(() => process.exit(1))
