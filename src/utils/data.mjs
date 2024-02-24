import { consola } from 'consola'
import { isCancel, select, text } from '@clack/prompts'
import { joinURL } from 'ufo'
import { ofetch } from 'ofetch'
import { NUXT_HUB_URL, loadUserConfig } from './config.mjs'

export const $api = ofetch.create({
  baseURL: joinURL(NUXT_HUB_URL, '/api'),
  onRequest({ options }) {
    options.headers = options.headers || {}
    if (!options.headers.Authorization) {
      options.headers.Authorization = `Bearer ${loadUserConfig().hub?.userToken || ''}`
    }
  },
  onResponseError(ctx) {
    if (ctx.response._data?.message) {
      ctx.error = new Error(`- ${ctx.response._data.message}`)
    }
  }
})

export function fetchUser() {
  if (!loadUserConfig().hub?.userToken) {
    return null
  }
  return $api('/user').catch(() => null)
}

export async function selectTeam() {
  const teams = await $api('/teams')
  let team
  if (teams.length > 1) {
    const teamId = await select({
      message: 'Select a team',
      options: teams.map((team) => ({
        value: team.id,
        label: team.name
      }))
    })
    if (isCancel(teamId)) return null
    team = teams.find((team) => team.id === teamId)
  } else {
    team = teams[0]
  }
  return team
}

export async function selectProject(team) {
  const projects = await $api(`/teams/${team.slug}/projects`)
  let projectId
  if (projects.length) {
    projectId = await select({
      message: 'Select a project',
      options: [
        { value: 'new', label: 'Create a new project' },
        ...projects.map((project) => ({
          value: project.id,
          label: project.slug
        }))
      ]
    })
    if (isCancel(projectId)) return null
  } else {
    projectId = 'new'
  }

  let project
  if (projectId === 'new') {
    const defaultProjectName = process.cwd().split('/').pop()
    let projectName = await text({
      message: 'Project name',
      placeholder: defaultProjectName
    })
    if (isCancel(projectName)) return null
    projectName = projectName || defaultProjectName
    consola.start(`Creating project \`${projectName}\` on NuxtHub and Cloudflare...`)
    project = await $api(`/teams/${team.slug}/projects`, {
      method: 'POST',
      body: { name: projectName }
    }).catch((err) => {
      if (err.response?._data?.message?.includes('Cloudflare account')) {
        consola.warn('You need to link your Cloudflare account to create a project.')
        consola.info('Please configure it in your team settings:')
        consola.info(`\`${joinURL(NUXT_HUB_URL, team.slug, '/settings/cloudflare')}\`\n`)
        process.exit(1)
      }
      throw err
    })
    consola.success(`Project \`${project.slug}\` created`)
  } else {
    project = projects.find((project) => project.id === projectId)
  }

  return project
}

export async function fetchProject() {
  if (process.env.NUXT_HUB_PROJECT_KEY) {
    return $api(`/projects/${process.env.NUXT_HUB_PROJECT_KEY}`).catch(() => null)
  }
  return null
}
