import type React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { OpenInApplication } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '@/lib/utils'
import { getOpenInAppPreset, OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import {
  isOpenInUrlTemplateUsable,
  OPEN_IN_URL_PATH_PLACEHOLDER
} from '../../../../shared/open-in-url-template'
import { translate } from '@/i18n/i18n'

export type OpenInMenuRowProps = {
  application: OpenInApplication
  editing: boolean
  onEditToggle: () => void
  onRemove: () => void
  onChange: (updates: Partial<Pick<OpenInApplication, 'label' | 'command' | 'url'>>) => void
  onCommit: () => void
}

export function OpenInMenuRow({
  application,
  editing,
  onEditToggle,
  onRemove,
  onChange,
  onCommit
}: OpenInMenuRowProps): React.JSX.Element {
  const url = application.url ?? ''
  const hasUrl = url.trim() !== ''
  const preset = getOpenInAppPreset(application)
  // A URL row is never a preset: the collapsed preset editor offers only a command field, which
  // would hide the URL that actually decides what the row opens, and make it unclearable.
  const isPreset =
    preset !== null &&
    !hasUrl &&
    (application.id === preset.id ||
      application.label.trim().toLowerCase() === preset.label.toLowerCase())
  const urlInvalid = hasUrl && !isOpenInUrlTemplateUsable(url)

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/50">
          <OpenInApplicationIcon application={application} size={16} />
        </div>

        <div className="min-w-0 flex-1 sm:min-w-[12rem]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium leading-none">
              {application.label.trim() ||
                translate('auto.components.settings.OpenInMenuSetting.f79084947b', 'New app')}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {/* URL first: when both are set the URL is what opens. */}
            {url.trim() ||
              application.command.trim() ||
              translate(
                'auto.components.settings.OpenInMenuSetting.setCommandOrUrl',
                'Set a command or a URL'
              )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEditToggle}
            title={
              editing
                ? translate(
                    'auto.components.settings.OpenInMenuSetting.494ed535cd',
                    'Collapse app details'
                  )
                : translate('auto.components.settings.OpenInMenuSetting.af7d1c3656', 'Edit app')
            }
            aria-label={
              editing
                ? translate(
                    'auto.components.settings.OpenInMenuSetting.494ed535cd',
                    'Collapse app details'
                  )
                : translate('auto.components.settings.OpenInMenuSetting.af7d1c3656', 'Edit app')
            }
            aria-expanded={editing}
            className={cn(
              'size-7 text-muted-foreground hover:text-foreground',
              editing && 'text-foreground'
            )}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            title={translate('auto.components.settings.OpenInMenuSetting.a261931d29', 'Remove app')}
            aria-label={translate(
              'auto.components.settings.OpenInMenuSetting.a261931d29',
              'Remove app'
            )}
            className="size-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 pl-10">
          <div
            className={cn(
              'grid grid-cols-1 gap-2',
              !isPreset && 'sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)]'
            )}
          >
            {!isPreset && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {translate('auto.components.settings.OpenInMenuSetting.e1fc0085c6', 'Menu label')}
                </Label>
                <Input
                  value={application.label}
                  placeholder={translate(
                    'auto.components.settings.OpenInMenuSetting.3ebe650f74',
                    'App name'
                  )}
                  onChange={(event) => onChange({ label: event.target.value })}
                  onBlur={onCommit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onCommit()
                      event.currentTarget.blur()
                    }
                  }}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.settings.OpenInMenuSetting.ba1422ee07',
                  'Terminal command'
                )}
              </Label>
              <Input
                value={application.command}
                placeholder={translate(
                  'auto.components.settings.OpenInMenuSetting.810ef39b56',
                  'cursor'
                )}
                spellCheck={false}
                className="font-mono text-xs"
                onChange={(event) => onChange({ command: event.target.value })}
                onBlur={onCommit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onCommit()
                    event.currentTarget.blur()
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.settings.OpenInMenuSetting.eb55b87570',
                  'The command you would type in Terminal to open this app.'
                )}
              </p>
            </div>
          </div>

          {/* A workspace reached through a browser has no local command to run, so a URL is the
              only "Open in" target it can offer — including one the runtime seeded. */}
          {!isPreset && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {translate('auto.components.settings.OpenInMenuSetting.webUrl', 'Web URL')}
              </Label>
              <Input
                value={url}
                placeholder={`https://code-server.example.com/?folder=${OPEN_IN_URL_PATH_PLACEHOLDER}`}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-mono text-xs"
                aria-invalid={urlInvalid}
                onChange={(event) => onChange({ url: event.target.value })}
                onBlur={onCommit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onCommit()
                    event.currentTarget.blur()
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.settings.OpenInMenuSetting.webUrlHint',
                  'Opens this URL instead of the command. {path} is replaced with the folder path.'
                )}
              </p>
              {urlInvalid && (
                <p className="text-[11px] text-destructive">
                  {translate(
                    'auto.components.settings.OpenInMenuSetting.webUrlInvalid',
                    'Enter a full http:// or https:// URL.'
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
