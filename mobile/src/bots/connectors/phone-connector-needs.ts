// The bot's connectors that need the owner, as Needs you lists them: the desktop's needsOwner rules
// (bot-connector-entries) over the reads the Connectors page makes, in its order. Each opens the
// connector's own page in Settings › Connectors.
import { useEffect, useMemo, useState } from 'react'
import { BOT_CONNECTOR_NAMES } from '../../../../src/shared/bots/bot-templates'
import { botLinearWorkspaces, botSlackApps } from '../../../../src/shared/bot-types'
import { composioAppName } from '../../../../src/shared/composio/composio-curated-apps'
import type { Translate } from '../../i18n/mobile-i18n'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import {
  useMobileComposio,
  type MobileComposio
} from '../../session/native-chat/transcript/bot-cards/mobile-composio-store'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import type { PhoneBot } from '../host-bots-operations'
import {
  connectorTitle,
  githubAccountStatus,
  linearWorkspaceStatus
} from './connector-account-rows'
import type { ConnectorPage } from './connector-pages'
import { usePhoneGoogleStatus, type PhoneGoogleStatus } from './MobileBotGooglePage'
import { slackRowFace } from './mobile-slack-copy'
import { usePhoneBotSlack, type PhoneSlackView } from './use-phone-bot-slack'
import {
  usePhoneGitHubAccount,
  usePhoneLinearAccount,
  type PhoneGitHubView,
  type PhoneLinearView
} from './use-phone-connector-account'

export type PhoneConnectorNeed = {
  key: string
  /** The connector's row title, e.g. "Slack · Stably". */
  title: string
  /** What it needs, in the desktop's words. */
  need: string
  page: ConnectorPage
}

type Sources = {
  slack: PhoneSlackView
  linear: PhoneLinearView
  github: PhoneGitHubView
  google: PhoneGoogleStatus | null
  composio: MobileComposio
}

export function phoneConnectorNeeds(
  bot: PhoneBot,
  { slack, linear, github, google, composio }: Sources,
  hostName: string,
  t: Translate
): PhoneConnectorNeed[] {
  const needs: PhoneConnectorNeed[] = []
  const signIn = (title: string) =>
    t('bots.needs.connector', '{{name}} needs you to sign in again or fix it.', { name: title })
  for (const app of botSlackApps(bot)) {
    const face = slackRowFace(slack, app.teamId, hostName, t)
    // Can't check (and signed out of Orca Cloud) is not the owner's to fix here.
    if (face.next === null || face.next === 'retry') {
      continue
    }
    const title = connectorTitle(BOT_CONNECTOR_NAMES.slack, face.workspace, t)
    needs.push({
      key: `slack:${app.teamId}`,
      title,
      need:
        face.next === 'update'
          ? t('settings.bots.slackStatus.updateNeeded', 'Update needed')
          : signIn(title),
      page: { kind: 'slack', teamId: app.teamId }
    })
  }
  for (const workspace of botLinearWorkspaces(bot)) {
    if (linearWorkspaceStatus(linear, workspace.workspaceId, t) === undefined) {
      continue
    }
    const title = connectorTitle(BOT_CONNECTOR_NAMES.linear, workspace.workspaceName, t)
    needs.push({
      key: `linear:${workspace.workspaceId}`,
      title,
      need: signIn(title),
      page: { kind: 'linear', workspaceId: workspace.workspaceId }
    })
  }
  const githubState = github.status === 'ready' ? github.value : null
  // As the desktop's card: every org the host's link has, removed from this bot or not.
  const githubInstalls = githubState?.account ? githubState.installations : []
  if (bot.github && githubAccountStatus(githubState, githubInstalls, t)) {
    needs.push({
      key: 'github',
      title: BOT_CONNECTOR_NAMES.github,
      need: signIn(BOT_CONNECTOR_NAMES.github),
      page: { kind: 'github', installationId: null }
    })
  }
  if (bot.google === true && google?.accounts?.length === 0) {
    needs.push({
      key: 'google',
      title: BOT_CONNECTOR_NAMES.google,
      need: signIn(BOT_CONNECTOR_NAMES.google),
      page: { kind: 'google' }
    })
  }
  const keyProblem = composio.status?.key === 'rejected' || composio.status?.key === 'unreadable'
  const signIns = (composio.connections?.connections ?? []).filter(
    // A sign-in still under way finishes in the browser.
    (connection) => connection.status !== 'pending'
  )
  // Nothing known to list, but the bot uses Composio and its key is refused: one row says so.
  if (signIns.length === 0 && keyProblem && composio.status?.added) {
    const title = t('bots.composio.toolName', 'Composio apps')
    needs.push({ key: 'composio', title, need: signIn(title), page: { kind: 'list' } })
  }
  for (const connection of signIns) {
    if (!keyProblem && connection.status === 'active') {
      continue
    }
    const title = composioAppName(connection.app, connection.name)
    needs.push({
      key: `composio:${connection.id ?? `${connection.app}:${connection.label ?? ''}`}`,
      title,
      need: signIn(title),
      page: { kind: 'composio', app: connection.app, label: connection.label }
    })
  }
  return needs
}

const READ_EVERY_MS = 60_000

/** The route's read count, moved on at most once a minute: each read is an Orca Cloud call on the
 *  host, and the route reads on every change of the bot's work. */
function useReadsAtMostEveryMinute(reads: number): number {
  const [passed, setPassed] = useState({ reads, at: 0 })
  useEffect(() => {
    const now = Date.now()
    if (reads !== passed.reads && now - passed.at >= READ_EVERY_MS) {
      setPassed({ reads, at: now })
    }
  }, [reads, passed])
  return passed.reads
}

/** The needs while `client` is set (the panel shows); the reads only the bot's connectors call for. */
export function usePhoneConnectorNeeds({
  client,
  bot,
  reads,
  hostKey,
  hostName
}: {
  client: RpcClient | null
  bot: PhoneBot
  reads: number
  hostKey: string
  hostName: string
}): PhoneConnectorNeed[] {
  const t = useMobileTranslation()
  const shown = client !== null
  const again = useReadsAtMostEveryMinute(reads)
  const slack = usePhoneBotSlack(client, bot.id, again, shown && botSlackApps(bot).length > 0)
  const linear = usePhoneLinearAccount(client, shown && botLinearWorkspaces(bot).length > 0, again)
  const github = usePhoneGitHubAccount(client, shown && bot.github !== null, again)
  const google = usePhoneGoogleStatus(client, shown && bot.google === true, again)
  const composio = useMobileComposio(client, hostKey, bot.id)
  return useMemo(
    () =>
      phoneConnectorNeeds(
        bot,
        {
          slack: slack.view,
          linear: linear.view,
          github: github.view,
          google: google.status,
          composio
        },
        hostName,
        t
      ),
    [bot, slack.view, linear.view, github.view, google.status, composio, hostName, t]
  )
}
