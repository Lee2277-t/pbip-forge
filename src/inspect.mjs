import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ForgeError } from './util.mjs'
import { validateTmdl } from './desktop.mjs'

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new ForgeError(`Could not read ${label} at "${file}": ${error.message}`)
  }
}

export async function validateProject(pbipPath) {
  const projectFile = path.resolve(pbipPath)
  const project = await readJson(projectFile, 'PBIP file')
  const errors = []
  const warnings = []

  if (project.version !== '1.0') warnings.push(`Unexpected .pbip version "${project.version}"`)
  if (!Array.isArray(project.artifacts) || project.artifacts.length === 0) {
    throw new ForgeError('The .pbip file has no artifacts')
  }

  const reportArtifact = project.artifacts.find((artifact) => artifact?.report?.path)
  if (!reportArtifact) throw new ForgeError('The .pbip file has no report artifact')
  const reportDir = path.resolve(path.dirname(projectFile), reportArtifact.report.path)
  const pbir = await readJson(path.join(reportDir, 'definition.pbir'), 'definition.pbir')
  const modelRelative = pbir?.datasetReference?.byPath?.path
  if (!modelRelative) throw new ForgeError('definition.pbir has no datasetReference.byPath.path')
  const modelDir = path.resolve(reportDir, modelRelative)

  const reportDefinition = await readJson(path.join(reportDir, 'definition', 'report.json'), 'report.json')
  const pagesDefinition = await readJson(path.join(reportDir, 'definition', 'pages', 'pages.json'), 'pages.json')
  const pageOrder = Array.isArray(pagesDefinition.pageOrder) ? pagesDefinition.pageOrder : []
  if (pageOrder.length === 0) errors.push('pages.json has an empty pageOrder')

  let visualCount = 0
  for (const pageName of pageOrder) {
    const pageDir = path.join(reportDir, 'definition', 'pages', pageName)
    try {
      const page = await readJson(path.join(pageDir, 'page.json'), `page ${pageName}`)
      if (!page.name) errors.push(`Page ${pageName} has no name`)
      if (!page.displayName) warnings.push(`Page ${pageName} has no displayName`)
      const visualsDir = path.join(pageDir, 'visuals')
      let entries = []
      try {
        const { readdir } = await import('node:fs/promises')
        entries = await readdir(visualsDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue
        const visual = await readJson(path.join(visualsDir, entry.name, 'visual.json'), `visual ${entry.name}`)
        visualCount++
        if (!visual.visual?.visualType) errors.push(`Visual ${entry.name} has no visualType`)
        if (!visual.position) errors.push(`Visual ${entry.name} has no position`)
      }
    } catch (error) {
      errors.push(error.message)
    }
  }

  const tmdl = await validateTmdl(path.join(modelDir, 'definition'))
  if (tmdl.status === 'failed') errors.push(`TMDL validation failed: ${tmdl.error}`)

  return {
    ok: errors.length === 0,
    project: projectFile,
    reportDir,
    modelDir,
    reportSchema: reportDefinition.$schema,
    pages: pageOrder.length,
    visuals: visualCount,
    validation: { tmdl },
    errors,
    warnings,
  }
}
