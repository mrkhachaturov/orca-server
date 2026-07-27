import type React from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { getExternalEditorOpenCapability } from '@/lib/external-editor-open-capability'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import type { GlobalSettings, OpenInApplication } from '../../../shared/types'
import { translate } from '@/i18n/i18n'

/**
 * The "Open in" entry model, shared by every menu that offers one.
 *
 * Why it lives outside the menu components: there are two of them — the worktree card's dropdown
 * and Source Control's file context menu — and they used to each derive an entry's icon and its
 * click arguments independently. When `url` was added, only one of them learned about it, so the
 * other rendered items that read as enabled and could only fail on click. Entry shape, enabled-
 * ness and icon are decided once, here.
 */
export type OpenInMenuEntry = {
  id: string
  label: string
  target: 'external-editor' | 'file-manager'
  command?: string
  url?: string
}

export function getWorktreeOpenInEntries(
  openInApplications: OpenInApplication[],
  fileManagerLabel: string
): OpenInMenuEntry[] {
  return [
    ...openInApplications.map((application) => ({
      id: application.id,
      label: application.label,
      target: 'external-editor' as const,
      command: application.command,
      url: application.url
    })),
    { id: 'file-manager', label: fileManagerLabel, target: 'file-manager' }
  ]
}

export function getOpenInEntryAvailability(
  entry: OpenInMenuEntry,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId?: string | null
): { disabled: boolean; metadata?: string } {
  if (entry.target === 'file-manager') {
    const disabled = isLocalPathOpenBlocked(settings, { connectionId })
    return disabled
      ? {
          disabled: true,
          metadata: translate('auto.components.sidebar.WorktreeOpenInMenu.localOnly', 'Local only')
        }
      : { disabled: false }
  }
  const capability = getExternalEditorOpenCapability(settings, {
    connectionId,
    command: entry.command,
    url: entry.url
  })
  if (!capability.allowed) {
    return {
      disabled: true,
      metadata:
        capability.reason === 'invalid-url'
          ? translate(
              'auto.components.sidebar.WorktreeOpenInMenu.openInUrlInvalidBadge',
              'Invalid URL'
            )
          : translate('auto.components.sidebar.WorktreeOpenInMenu.localOnly', 'Local only')
    }
  }
  return capability.remote
    ? {
        disabled: false,
        metadata: translate('auto.components.sidebar.WorktreeOpenInMenu.remoteSsh', 'Remote SSH')
      }
    : { disabled: false }
}

/** The icon for a menu entry — one implementation so the two menus cannot drift apart. */
export function OpenInMenuEntryIcon({ entry }: { entry: OpenInMenuEntry }): React.JSX.Element {
  if (entry.target === 'file-manager') {
    return <FolderOpen className="size-3.5" />
  }
  if (entry.command?.trim() || entry.url?.trim()) {
    return (
      <OpenInApplicationIcon
        application={{ id: entry.id, command: entry.command ?? '', url: entry.url }}
        size={14}
      />
    )
  }
  return <ExternalLink className="size-3.5" />
}
