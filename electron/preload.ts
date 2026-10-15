import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, Snapshot } from '../shared/contracts'

const api: DesktopApi = {
  command: command => ipcRenderer.invoke('desktop:command', command),
  setBrowserBounds: bounds => ipcRenderer.invoke('desktop:bounds', bounds),
  onSnapshot: listener => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Snapshot) => listener(snapshot)
    ipcRenderer.on('desktop:snapshot', handler)
    return () => ipcRenderer.removeListener('desktop:snapshot', handler)
  },
}
contextBridge.exposeInMainWorld('desktop', api)
