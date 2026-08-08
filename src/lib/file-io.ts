export interface OpenedFile {
  text: string
  path?: string
}

export async function openSchemaFile(): Promise<OpenedFile | null> {
  if (window.zoolander) {
    const result = await window.zoolander.openFile()
    return result ? { text: result.text, path: result.path } : null
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { text: await file.text() } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function downloadFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
