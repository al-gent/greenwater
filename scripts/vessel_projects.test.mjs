import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Children, isValidElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'

function loadComponent(filename, dependencies) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  const require = (name) => {
    if (name === 'react/jsx-runtime') return jsxRuntime
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }
  new Function('require', 'exports', outputText)(require, exports)
  return exports.default
}

function elements(node) {
  return Children.toArray(node).flatMap((child) => isValidElement(child) ? [child, ...elements(child.props.children)] : [])
}

const pastCard = { project: { id: 'past' }, cruise: null, siblings: 0 }
const upcomingCard = { project: { id: 'upcoming' }, cruise: null, siblings: 0 }
const olderCard = { project: { id: 'older' }, cruise: null, siblings: 0 }
const timeline = jsxRuntime.jsx('div', { 'data-testid': 'existing-timeline' })

function projectViews() {
  const state = []
  let cursor = 0
  const Component = loadComponent('components/VesselProjectsRow.tsx', {
    react: {
      useId: () => 'vessel-research-view',
      useCallback: (callback) => callback,
      useState: (initial) => {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
      },
    },
    '@/components/CardRow': { default: 'card-row' },
    '@/components/ProjectCard': { default: 'project-card' },
  })
  const render = () => {
    cursor = 0
    return elements(Component({ vesselId: 138, pastCards: [pastCard], upcomingCards: [upcomingCard], pastCruisesTotal: 2, pastPagesLoaded: 1, pastPageSize: 1, timeline }))
  }
  const choose = (label) => render().find((element) => element.type === 'button' && element.props.children === label).props.onClick()
  return { render, choose }
}

test('vessel research defaults to projects with accessible view controls', () => {
  const rendered = projectViews().render()
  const controls = rendered.filter((element) => element.type === 'button')
  assert.deepEqual(controls.map((element) => [element.props.children, element.props['aria-pressed']]), [['Projects', true], ['Timeline', false]])
  assert.ok(controls.every((element) => element.props.type === 'button' && rendered.some((panel) => panel.props.id === element.props['aria-controls'])))
  assert.equal(rendered.filter((element) => element.type === 'project-card').length, 2)
  assert.ok(!rendered.some((element) => element.props['data-testid'] === 'existing-timeline'))
})

test('switching views shows the supplied timeline and restores project cards', () => {
  const views = projectViews()
  views.choose('Timeline')
  const rendered = views.render()
  assert.ok(rendered.some((element) => element.props['data-testid'] === 'existing-timeline'))
  assert.ok(!rendered.some((element) => element.type === 'card-row'))
  assert.equal(rendered.find((element) => element.type === 'button' && element.props.children === 'Timeline').props['aria-pressed'], true)
  views.choose('Projects')
  assert.equal(views.render().filter((element) => element.type === 'project-card').length, 2)
})

test('older project pagination survives switching to the timeline and back', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/vessels/138/projects?page=2')
    return Response.json({ cards: [olderCard] })
  })
  const views = projectViews()
  assert.equal(await views.render().find((element) => element.type === 'card-row').props.onReachStart(), 1)
  views.choose('Timeline')
  views.choose('Projects')
  const rendered = views.render()
  assert.deepEqual(rendered.filter((element) => element.type === 'project-card').map((element) => element.props.project.id), ['older', 'past', 'upcoming'])
  const row = rendered.find((element) => element.type === 'card-row')
  assert.equal(row.props.startIndex, 2)
  assert.equal(row.props.onReachStart, undefined)
})

function serverProjects(upcoming, past) {
  return loadComponent('components/VesselProjects.tsx', {
    '@/lib/cruises': {
      getUpcomingCruises: async ({ vesselId }) => { assert.equal(vesselId, 138); return upcoming },
      getPastCruises: async ({ vesselId }) => { assert.equal(vesselId, 138); return { cruises: past, total: past.length } },
    },
    '@/lib/project-cards': { projectCardsForCruises: async (cruises) => cruises },
    '@/components/VesselProjectsRow': { default: 'project-views' },
    '@/components/VesselTimelineStrip': { default: 'vessel-timeline-strip' },
  })
}

test('server reuses the existing timeline scoped to this vessel with a bounded date window', async () => {
  const Component = serverProjects([upcomingCard], [pastCard])
  const rendered = await Component({ vesselId: 138, vesselName: 'Atlantis' })
  assert.equal(rendered.props.timeline.type, 'vessel-timeline-strip')
  const props = rendered.props.timeline.props
  assert.equal(props.vesselId, 138)
  assert.equal(props.vesselName, 'Atlantis')
  assert.equal((props.to - props.from) / 86_400_000, 119)
  assert.ok(props.from < new Date() && props.to > new Date())
  assert.notEqual(props.hideIfEmpty, true)
})

test('vessels without published research keep the existing hidden section behavior', async () => {
  const Component = serverProjects([], [])
  assert.equal(await Component({ vesselId: 138, vesselName: 'Atlantis' }), null)
})
