/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

interface Window {
  ipcRenderer: {
    on(channel: string, listener: any): void
    off(channel: string, listener: any): void
    send(channel: string, ...args: unknown[]): void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
  }
}
