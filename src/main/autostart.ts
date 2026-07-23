export function buildLinuxAutostartEntry(execPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=token-pulse',
    `Exec=${execPath}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
  ].join('\n')
}
